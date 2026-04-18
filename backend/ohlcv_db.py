"""
OHLCV Database Module - Production-grade SQL storage.

Supports:
- PostgreSQL (preferred) with SQLite fallback
- Timeframes: 1m, 5m, 15m, 60m (1h), 1D, 1W
- No duplicate entries (PRIMARY KEY: symbol + timeframe + datetime)
- Only closed candles stored
- Efficient incremental updates

Schema:
CREATE TABLE ohlcv (
    symbol VARCHAR(50) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    datetime TIMESTAMP NOT NULL,
    open NUMERIC(18,4) NOT NULL,
    high NUMERIC(18,4) NOT NULL,
    low NUMERIC(18,4) NOT NULL,
    close NUMERIC(18,4) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (symbol, timeframe, datetime)
);

Indexes:
- PRIMARY KEY on (symbol, timeframe, datetime)
- INDEX on (symbol, timeframe, datetime DESC) for fast queries
- INDEX on (timeframe, datetime) for aggregation queries
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from contextlib import contextmanager

import pandas as pd
import numpy as np

try:
    import psycopg2
    from psycopg2.extras import execute_batch
    HAS_PG = True
except ImportError:
    HAS_PG = False

try:
    import sqlite3
    HAS_SQLITE = True
except ImportError:
    HAS_SQLITE = False

log = logging.getLogger(__name__)

TIMEFRAMES = ["1m", "5m", "15m", "60m", "1D", "1W"]
MARKET_HOURS = {"start": "09:15", "end": "15:30"}  # IST


class OHLCVDatabase:
    """Database handler for OHLCV data."""

    def __init__(self, connection_string: str = None, db_path: str = None):
        """
        Initialize database connection.

        Args:
            connection_string: PostgreSQL connection string
            db_path: SQLite file path (fallback)
        """
        self.connection_string = connection_string
        self.db_path = db_path or os.path.join(os.path.dirname(__file__), "data", "ohlcv.db")
        self._conn = None
        self._use_pg = False

        if connection_string and HAS_PG:
            try:
                self._conn = psycopg2.connect(connection_string)
                self._use_pg = True
                log.info("Connected to PostgreSQL")
            except Exception as e:
                log.warning(f"PostgreSQL connection failed: {e}, using SQLite")

        if not self._conn and HAS_SQLITE:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA cache_size=10000")
            log.info(f"Connected to SQLite: {self.db_path}")

        self._create_tables()

    def _create_tables(self):
        """Create OHLCV tables with proper schema."""
        if self._use_pg:
            self._create_tables_pg()
        else:
            self._create_tables_sqlite()

    def _create_tables_pg(self):
        """Create PostgreSQL tables."""
        for tf in TIMEFRAMES:
            table = f"ohlcv_{tf.replace('D', 'D').replace('W', 'W').replace('m', 'm').replace('60m', '1h')}"
            self._conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {table} (
                    symbol VARCHAR(50) NOT NULL,
                    datetime TIMESTAMP NOT NULL,
                    open NUMERIC(18,4) NOT NULL,
                    high NUMERIC(18,4) NOT NULL,
                    low NUMERIC(18,4) NOT NULL,
                    close NUMERIC(18,4) NOT NULL,
                    volume BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (symbol, datetime)
                )
            """)
            self._conn.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{table}_symbol_dt
                ON {table} (symbol, datetime DESC)
            """)
        self._conn.commit()

    def _create_tables_sqlite(self):
        """Create SQLite tables."""
        for tf in TIMEFRAMES:
            safe_tf = tf.replace(" ", "_").replace("-", "_")
            self._conn.execute(f"""
                CREATE TABLE IF NOT EXISTS ohlcv_{safe_tf} (
                    symbol TEXT NOT NULL,
                    datetime TEXT NOT NULL,
                    open REAL NOT NULL,
                    high REAL NOT NULL,
                    low REAL NOT NULL,
                    close REAL NOT NULL,
                    volume INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (symbol, datetime)
                )
            """)
            self._conn.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_ohlcv_{safe_tf}_symbol_dt
                ON ohlcv_{safe_tf} (symbol, datetime DESC)
            """)
        self._conn.commit()

    def get_table_name(self, timeframe: str) -> str:
        """Get safe table name for timeframe."""
        safe = timeframe.replace(" ", "_").replace("-", "_")
        if self._use_pg:
            return f"ohlcv_{safe}"
        return f"ohlcv_{safe}"

    @contextmanager
    def _cursor(self):
        """Context manager for cursor."""
        cursor = self._conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()

    def insert_ohlcv(self, symbol: str, timeframe: str, data: pd.DataFrame) -> int:
        """
        Insert OHLCV data with upsert (no duplicates).

        Args:
            symbol: Stock symbol
            timeframe: Timeframe (1m, 5m, 15m, 60m, 1D, 1W)
            data: DataFrame with columns [datetime, open, high, low, close, volume]

        Returns:
            Number of rows inserted
        """
        if data.empty:
            return 0

        table = self.get_table_name(timeframe)
        inserted = 0

        for _, row in data.iterrows():
            try:
                if self._use_pg:
                    self._conn.execute(f"""
                        INSERT INTO {table} (symbol, datetime, open, high, low, close, volume)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (symbol, datetime) DO NOTHING
                    """, (symbol, row['datetime'], row['Open'], row['High'],
                          row['Low'], row['Close'], int(row['Volume'])))
                else:
                    self._conn.execute(f"""
                        INSERT OR IGNORE INTO {table} (symbol, datetime, open, high, low, close, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (symbol, row['datetime'], row['Open'], row['High'],
                          row['Low'], row['Close'], int(row['Volume'])))
                inserted += 1
            except Exception as e:
                log.debug(f"Insert error for {symbol} {timeframe}: {e}")

        self._conn.commit()
        return inserted

    def bulk_insert_ohlcv(self, symbol: str, timeframe: str, data: pd.DataFrame) -> int:
        """
        Bulk insert OHLCV data for performance.

        Args:
            symbol: Stock symbol
            timeframe: Timeframe
            data: DataFrame with columns [datetime, open, high, low, close, volume] OR
                  DataFrame with index=datetime and columns=[open, high, low, close, volume]

        Returns:
            Number of rows inserted
        """
        if data.empty:
            return 0

        table = self.get_table_name(timeframe)

        if isinstance(data.index, pd.DatetimeIndex):
            df = data.reset_index()
            df = df.rename(columns={'index': 'datetime'})
        else:
            df = data.copy()

        if 'datetime' not in df.columns:
            df = df.reset_index()

        rows = []
        for _, row in df.iterrows():
            dt_val = row['datetime']
            if isinstance(dt_val, str):
                dt_str = dt_val
            elif hasattr(dt_val, 'isoformat'):
                dt_str = dt_val.isoformat()
            else:
                dt_str = str(dt_val)

            rows.append((
                symbol,
                dt_str,
                float(row['Open']),
                float(row['High']),
                float(row['Low']),
                float(row['Close']),
                int(row['Volume'])
            ))

        if self._use_pg:
            from psycopg2.extras import execute_batch
            execute_batch(self._conn.cursor(), f"""
                INSERT INTO {table} (symbol, datetime, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (symbol, datetime) DO NOTHING
            """, rows)
        else:
            self._conn.executemany(f"""
                INSERT OR IGNORE INTO {table} (symbol, datetime, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, rows)

        self._conn.commit()
        return len(rows)

    def get_ohlcv(self, symbol: str, timeframe: str,
                   start: datetime = None, end: datetime = None,
                   limit: int = None) -> pd.DataFrame:
        """
        Get OHLCV data for a symbol.

        Args:
            symbol: Stock symbol
            timeframe: Timeframe
            start: Start datetime
            end: End datetime
            limit: Max rows to return (for recent data)

        Returns:
            DataFrame with OHLCV data
        """
        table = self.get_table_name(timeframe)
        query = f"SELECT symbol, datetime, open, high, low, close, volume FROM {table} WHERE symbol = ?"
        params = [symbol]

        if start:
            query += " AND datetime >= ?"
            params.append(start.isoformat() if isinstance(start, datetime) else start)

        if end:
            query += " AND datetime <= ?"
            params.append(end.isoformat() if isinstance(end, datetime) else end)

        query += " ORDER BY datetime DESC"

        if limit:
            query += f" LIMIT {limit}"

        try:
            df = pd.read_sql_query(query, self._conn, params=params)
            if not df.empty:
                df['datetime'] = pd.to_datetime(df['datetime'])
                df = df.sort_values('datetime')
            return df
        except Exception as e:
            log.error(f"Error fetching {symbol} {timeframe}: {e}")
            return pd.DataFrame()

    def get_latest_datetime(self, symbol: str, timeframe: str) -> Optional[datetime]:
        """Get the latest datetime for a symbol/timeframe."""
        table = self.get_table_name(timeframe)
        try:
            cursor = self._conn.cursor()
            cursor.execute(f"""
                SELECT MAX(datetime) FROM {table} WHERE symbol = ?
            """, (symbol,))
            result = cursor.fetchone()[0]
            if result:
                return pd.to_datetime(result)
            return None
        except Exception as e:
            log.error(f"Error getting latest for {symbol} {timeframe}: {e}")
            return None

    def get_symbols(self, timeframe: str = "1m") -> List[str]:
        """Get all symbols for a timeframe."""
        table = self.get_table_name(timeframe)
        try:
            cursor = self._conn.cursor()
            cursor.execute(f"SELECT DISTINCT symbol FROM {table}")
            return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            log.error(f"Error getting symbols: {e}")
            return []

    def count_rows(self, symbol: str = None, timeframe: str = "1m") -> int:
        """Count rows for a symbol/timeframe."""
        table = self.get_table_name(timeframe)
        try:
            cursor = self._conn.cursor()
            if symbol:
                cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE symbol = ?", (symbol,))
            else:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
            return cursor.fetchone()[0]
        except Exception as e:
            log.error(f"Error counting rows: {e}")
            return 0

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None


class OHLCVAggregator:
    """
    Aggregates 1-minute OHLCV data to higher timeframes.

    Uses closed candles only (no partial candles).
    Optimized for incremental updates.
    """

    def __init__(self, db: OHLCVDatabase):
        self.db = db

    def _resample(self, df: pd.DataFrame, minutes: int) -> pd.DataFrame:
        """
        Resample 1Min data to higher timeframe.

        Args:
            df: DataFrame with 1Min candles
            minutes: Target timeframe in minutes

        Returns:
            Aggregated DataFrame
        """
        if df is None or df.empty:
            return pd.DataFrame()

        df = df.copy()

        col_map = {'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}
        df = df.rename(columns={c: col_map.get(c, c) for c in df.columns})

        if not isinstance(df.index, pd.DatetimeIndex):
            if 'datetime' in df.columns:
                df = df.set_index('datetime')
            elif 'index' in df.columns:
                df = df.set_index('index')

        df = df.sort_index()

        if minutes >= 1440:
            freq = f'{minutes // 1440}D'
        elif minutes >= 60:
            freq = f'{minutes // 60}h'
        else:
            freq = f'{minutes}min'

        resampled = df.resample(freq, origin='start').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()

        resampled = resampled.reset_index()
        return resampled

    def aggregate_1m_to_5m(self, symbol: str, from_dt: datetime = None) -> int:
        """Aggregate 1m to 5m."""
        df_1m = self.db.get_ohlcv(symbol, "1m", start=from_dt)
        if df_1m.empty:
            return 0
        df_5m = self._resample(df_1m, 5)
        return self.db.bulk_insert_ohlcv(symbol, "5m", df_5m)

    def aggregate_1m_to_15m(self, symbol: str, from_dt: datetime = None) -> int:
        """Aggregate 1m to 15m."""
        df_1m = self.db.get_ohlcv(symbol, "1m", start=from_dt)
        if df_1m.empty:
            return 0
        df_15m = self._resample(df_1m, 15)
        return self.db.bulk_insert_ohlcv(symbol, "15m", df_15m)

    def aggregate_1m_to_60m(self, symbol: str, from_dt: datetime = None) -> int:
        """Aggregate 1m to 60m (1h)."""
        df_1m = self.db.get_ohlcv(symbol, "1m", start=from_dt)
        if df_1m.empty:
            return 0
        df_60m = self._resample(df_1m, 60)
        return self.db.bulk_insert_ohlcv(symbol, "60m", df_60m)

    def aggregate_1m_to_1D(self, symbol: str, from_dt: datetime = None) -> int:
        """Aggregate 1m to 1D (daily)."""
        df_1m = self.db.get_ohlcv(symbol, "1m", start=from_dt)
        if df_1m.empty:
            return 0
        df_1D = self._resample(df_1m, 1440)
        return self.db.bulk_insert_ohlcv(symbol, "1D", df_1D)

    def aggregate_1m_to_1W(self, symbol: str, from_dt: datetime = None) -> int:
        """Aggregate 1m to 1W (weekly)."""
        df_1m = self.db.get_ohlcv(symbol, "1m", start=from_dt)
        if df_1m.empty:
            return 0
        df_1W = self._resample(df_1m, 10080)
        return self.db.bulk_insert_ohlcv(symbol, "1W", df_1W)

    def aggregate_all_timeframes(self, symbol: str, from_dt: datetime = None) -> Dict[str, int]:
        """
        Aggregate 1m data to all timeframes.

        Args:
            symbol: Stock symbol
            from_dt: Only aggregate data from this datetime

        Returns:
            Dict with rows inserted per timeframe
        """
        results = {}
        timeframes = [
            ("5m", lambda: self.aggregate_1m_to_5m(symbol, from_dt)),
            ("15m", lambda: self.aggregate_1m_to_15m(symbol, from_dt)),
            ("60m", lambda: self.aggregate_1m_to_60m(symbol, from_dt)),
            ("1D", lambda: self.aggregate_1m_to_1D(symbol, from_dt)),
            ("1W", lambda: self.aggregate_1m_to_1W(symbol, from_dt)),
        ]

        for tf_name, agg_func in timeframes:
            try:
                results[tf_name] = agg_func()
            except Exception as e:
                log.error(f"Error aggregating {symbol} to {tf_name}: {e}")
                results[tf_name] = 0

        return results


class OHLCVScheduler:
    """
    Scheduler for OHLCV data updates.

    Schedule:
    - Every minute: Insert 1m data from yfinance
    - Every 5 min: Build 5m candles
    - Every 15 min: Build 15m candles
    - Every 60 min: Build 60m candles
    - End of day (3:35 PM IST): Build daily candles
    - End of week (Friday 3:35 PM IST): Build weekly candles
    
    Uses yfinance with .NS suffix for Indian stocks.
    """

    def __init__(self, db: OHLCVDatabase, aggregator: OHLCVAggregator):
        self.db = db
        self.aggregator = aggregator

    def is_market_open(self) -> bool:
        """Check if market is currently open (IST)."""
        now = datetime.now()
        if now.weekday() >= 5:
            return False

        current_minutes = now.hour * 60 + now.minute
        start_minutes = 9 * 60 + 15
        end_minutes = 15 * 60 + 30

        return start_minutes <= current_minutes <= end_minutes

    def is_market_closed_today(self) -> bool:
        """Check if market is closed for today (after 3:35 PM)."""
        now = datetime.now()
        if now.weekday() >= 5:
            return True

        current_minutes = now.hour * 60 + now.minute
        close_minutes = 15 * 60 + 35

        return current_minutes > close_minutes

    def is_end_of_week(self) -> bool:
        """Check if it's end of week (Friday after market close)."""
        now = datetime.now()
        return now.weekday() == 4 and self.is_market_closed_today()

    def download_1m_candles(self, symbol: str, days: int = 10) -> Optional[pd.DataFrame]:
        """
        Download 1-minute candles from yfinance using .NS suffix.

        Args:
            symbol: Stock symbol
            days: Number of calendar days to fetch

        Returns:
            DataFrame with 1m candles or None
        """
        import yfinance as yf
        
        try:
            base = symbol.replace("-EQ", "")
            yf_symbol = f"{base}.NS"
            
            ticker_obj = yf.Ticker(yf_symbol)
            df = ticker_obj.history(period=f"{days}d", interval="1m")

            if df is not None and not df.empty:
                df = df.rename(columns={'Open': 'Open', 'High': 'High', 'Low': 'Low', 'Close': 'Close', 'Volume': 'Volume'})
                df.index = df.index.tz_convert('Asia/Kolkata')
                df.index.name = 'datetime'
                df = df.sort_index()
                df = df[~df.index.duplicated(keep='last')]
                return df[["Open", "High", "Low", "Close", "Volume"]]

            return None

        except Exception as e:
            log.error(f"Error downloading 1m for {symbol}: {e}")
            return None

    def update_1m_data(self, symbols: List[str] = None, days: int = 10) -> Dict:
        """
        Update 1-minute data for all symbols.

        Args:
            symbols: List of symbols (None = all in DB)
            days: Days to fetch

        Returns:
            Summary dict
        """
        if symbols is None:
            symbols = self.db.get_symbols("1m")

        if not symbols:
            log.info("No symbols to update")
            return {"done": 0, "failed": 0, "skipped": 0}

        done = 0
        failed = 0
        skipped = 0

        for symbol in symbols:
            try:
                latest = self.db.get_latest_datetime(symbol, "1m")

                df = self.download_1m_candles(symbol, days)

                if df is None or df.empty:
                    failed += 1
                    continue

                if latest:
                    df = df[df.index > latest]

                if df.empty:
                    skipped += 1
                    continue

                inserted = self.db.bulk_insert_ohlcv(symbol, "1m", df)
                done += 1
                log.debug(f"Inserted {inserted} 1m candles for {symbol}")

            except Exception as e:
                log.error(f"Error updating 1m for {symbol}: {e}")
                failed += 1

        return {"done": done, "failed": failed, "skipped": skipped}

    def build_aggregated_candles(self, symbol: str) -> Dict[str, int]:
        """
        Build all aggregated timeframes for a symbol.

        Args:
            symbol: Stock symbol

        Returns:
            Dict with rows inserted per timeframe
        """
        return self.aggregator.aggregate_all_timeframes(symbol)

    def run_scheduled_tasks(self) -> Dict:
        """
        Run appropriate tasks based on current time.

        Returns:
            Summary of tasks run
        """
        results = {}

        if self.is_market_closed_today():
            log.info("Market closed, running end-of-day tasks")

            if self.is_end_of_week():
                log.info("End of week, building weekly candles")
                symbols = self.db.get_symbols("1m")
                for symbol in symbols:
                    results[f"{symbol}_weekly"] = self.db.bulk_insert_ohlcv(
                        symbol, "1W",
                        self.aggregator._resample(self.db.get_ohlcv(symbol, "1m"), 10080)
                    )

            log.info("Building daily candles")
            symbols = self.db.get_symbols("1m")
            for symbol in symbols:
                results[f"{symbol}_daily"] = self.db.bulk_insert_ohlcv(
                    symbol, "1D",
                    self.aggregator._resample(self.db.get_ohlcv(symbol, "1m"), 1440)
                )

        return results


def create_ohlcv_system(db_path: str = None) -> Tuple[OHLCVDatabase, OHLCVAggregator, OHLCVScheduler]:
    """
    Create OHLCV system components.

    Args:
        db_path: Path for SQLite database

    Returns:
        Tuple of (database, aggregator, scheduler)
    """
    db = OHLCVDatabase(db_path=db_path)
    aggregator = OHLCVAggregator(db)
    scheduler = OHLCVScheduler(db, aggregator)
    return db, aggregator, scheduler


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    print("=" * 60)
    print("OHLCV Database System")
    print("=" * 60)

    db, aggregator, scheduler = create_ohlcv_system()

    print(f"\nDatabase initialized:")
    print(f"  1m rows: {db.count_rows(timeframe='1m')}")
    print(f"  5m rows: {db.count_rows(timeframe='5m')}")
    print(f"  15m rows: {db.count_rows(timeframe='15m')}")
    print(f"  60m rows: {db.count_rows(timeframe='60m')}")
    print(f"  1D rows: {db.count_rows(timeframe='1D')}")
    print(f"  1W rows: {db.count_rows(timeframe='1W')}")

    db.close()

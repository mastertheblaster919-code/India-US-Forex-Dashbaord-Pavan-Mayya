"""
OHLCV DuckDB Module - Separate files per timeframe.

Each timeframe has its own DuckDB file for better organization and querying.
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Optional

import pandas as pd
import duckdb

log = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")
TIMEFRAMES = ["5m", "15m", "60m", "1D", "1W"]

def get_db_path(timeframe: str) -> str:
    return os.path.join(DATA_DIR, f"ohlcv_{timeframe}.db")

class OHLCDuckDB:
    """DuckDB wrapper for OHLCV data - separate file per timeframe."""

    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.conn = {}
        for tf in TIMEFRAMES:
            db_path = get_db_path(tf)
            self.conn[tf] = duckdb.connect(db_path)
            self._create_table(tf)

    def _create_table(self, tf: str):
        table = f"ohlcv_{tf}"
        self.conn[tf].execute(f"""
            CREATE TABLE IF NOT EXISTS {table} (
                symbol VARCHAR(50),
                datetime TIMESTAMP,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                volume BIGINT
            )
        """)
        self.conn[tf].execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{tf}_symbol ON {table} (symbol)
        """)
        self.conn[tf].execute(f"""
            CREATE INDEX IF NOT EXISTS idx_{tf}_datetime ON {table} (datetime)
        """)

    def insert(self, timeframe: str, symbol: str, data: pd.DataFrame) -> int:
        if data.empty:
            return 0
        table = f"ohlcv_{timeframe}"
        df = data.copy()
        df['symbol'] = symbol
        df = df[['symbol', 'datetime', 'open', 'high', 'low', 'close', 'volume']]
        df['datetime'] = pd.to_datetime(df['datetime'])
        rows = [tuple(x) for x in df.values]
        self.conn[timeframe].executemany(
            f"INSERT INTO {table} VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows
        )
        self.conn[timeframe].commit()
        return len(rows)

    def get_ohlcv(self, symbol: str, timeframe: str,
                  start: datetime = None, end: datetime = None,
                  limit: int = None) -> pd.DataFrame:
        table = f"ohlcv_{timeframe}"
        query = f"SELECT * FROM {table} WHERE symbol = '{symbol}'"
        if start:
            query += f" AND datetime >= '{start.isoformat()}'"
        if end:
            query += f" AND datetime <= '{end.isoformat()}'"
        query += " ORDER BY datetime ASC"
        if limit:
            query += f" LIMIT {limit}"
        try:
            return self.conn[timeframe].execute(query).fetchdf()
        except Exception as e:
            log.error(f"Error fetching {symbol} {timeframe}: {e}")
            return pd.DataFrame()

    def get_symbols(self, timeframe: str = "1D") -> List[str]:
        table = f"ohlcv_{timeframe}"
        try:
            result = self.conn[timeframe].execute(
                f"SELECT DISTINCT symbol FROM {table} ORDER BY symbol"
            ).fetchall()
            return [r[0] for r in result]
        except Exception as e:
            log.error(f"Error getting symbols: {e}")
            return []

    def get_latest_datetime(self, symbol: str, timeframe: str) -> Optional[datetime]:
        table = f"ohlcv_{timeframe}"
        try:
            result = self.conn[timeframe].execute(
                f"SELECT MAX(datetime) FROM {table} WHERE symbol = '{symbol}'"
            ).fetchone()
            if result and result[0]:
                return pd.to_datetime(result[0])
        except Exception as e:
            log.error(f"Error getting latest: {e}")
        return None

    def count_rows(self, timeframe: str, symbol: str = None) -> int:
        table = f"ohlcv_{timeframe}"
        query = f"SELECT COUNT(*) FROM {table}"
        if symbol:
            query += f" WHERE symbol = '{symbol}'"
        try:
            return self.conn[timeframe].execute(query).fetchone()[0]
        except Exception as e:
            log.error(f"Error counting: {e}")
            return 0

    def close(self):
        for tf in TIMEFRAMES:
            if tf in self.conn:
                self.conn[tf].close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


if __name__ == "__main__":
    print("DuckDB files per timeframe:")
    for tf in TIMEFRAMES:
        db_path = get_db_path(tf)
        size = os.path.getsize(db_path) / 1024 / 1024 if os.path.exists(db_path) else 0
        print(f"  {tf}: {db_path} ({size:.2f} MB)")
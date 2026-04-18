"""
Local OHLCV data store with SQLite support.

Strategy:
- Initial download: 2 years of daily OHLCV via Fyers API
- Incremental update: only fetch rows since the last stored date
- fetch_local(ticker, market) → DataFrame or None (used by engine.py)
- bulk_download(market, tickers, workers=6, force=False) → (done, skipped, failed)
- Data stored in SQLite database (backend/data/vcp.db)
"""

import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import pandas as pd

log = logging.getLogger(__name__)

OHLCV_DIR = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv")
REQUIRED_COLS = ["Open", "High", "Low", "Close", "Volume"]
MIN_ROWS = 60
FULL_PERIOD = "2y"

# Try to import DuckDB for OHLCV storage
try:
    import duckdb
    _USE_DUCKDB = True
except Exception:
    _USE_DUCKDB = False

DUCKDB_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")
DUCKDB_1D = os.path.join(DUCKDB_DIR, "ohlcv_1D.db")

# DuckDB helper functions
def _duckdb_save_ohlcv(ticker: str, df: pd.DataFrame):
    """Save OHLCV data to DuckDB using .NS format."""
    if df is None or df.empty:
        return
    # Keep .NS format as-is
    storage_ticker = ticker
    try:
        conn = duckdb.connect(DUCKDB_1D)
        conn.execute(f"DELETE FROM ohlcv_1D WHERE symbol = '{storage_ticker}'")

        # Reset index to get datetime as column
        df_save = df.reset_index()
        # Rename columns to lowercase and handle index name
        rename_map = {
            df_save.columns[0]: 'datetime',  # First column is the index
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        }
        df_save = df_save.rename(columns=rename_map)
        df_save['symbol'] = storage_ticker

        # Ensure datetime is in correct format
        df_save['datetime'] = pd.to_datetime(df_save['datetime']).dt.strftime('%Y-%m-%d')

        # Ensure column order matches table schema: symbol, datetime, open, high, low, close, volume
        df_save = df_save[['symbol', 'datetime', 'open', 'high', 'low', 'close', 'volume']]
        conn.execute("INSERT INTO ohlcv_1D SELECT * FROM df_save")
        conn.close()
        log.info(f"[ohlcv] Saved {len(df)} rows to DuckDB for {ticker}")
    except Exception as e:
        log.error(f"[ohlcv] DuckDB save error {ticker}: {e}")


# ─── Path helpers ─────────────────────────────────────────────────────────────

def _market_dir(market: str) -> str:
    d = os.path.join(OHLCV_DIR, market.upper())
    os.makedirs(d, exist_ok=True)
    return d


def _parquet_path(ticker: str, market: str) -> str:
    safe = ticker.replace(".", "_").replace("/", "_").replace("^", "_")
    return os.path.join(_market_dir(market), f"{safe}.parquet")


# ─── Single ticker I/O ────────────────────────────────────────────────────────

def fetch_local(ticker: str, market: str, resolution: str = "D") -> pd.DataFrame | None:
    """
    Fetch local OHLCV data using .NS ticker format.
    """
    if resolution == "D":
        return _fetch_daily_local(ticker, market)

    return _fetch_intraday_local(ticker, market, resolution)


def _fetch_daily_local(ticker: str, market: str) -> pd.DataFrame | None:
    """Fetch daily OHLCV from DuckDB."""
    if _USE_DUCKDB and os.path.exists(DUCKDB_1D):
        try:
            conn = duckdb.connect(DUCKDB_1D, read_only=True)
            df = conn.execute(f"""
                SELECT datetime, open, high, low, close, volume
                FROM ohlcv_1D WHERE symbol = '{ticker}'
                ORDER BY datetime
            """).fetchdf()
            conn.close()
            if df is not None and not df.empty:
                df['datetime'] = pd.to_datetime(df['datetime'])
                df.set_index('datetime', inplace=True)
                df = df.sort_index()
                df.columns = REQUIRED_COLS
                return df
        except Exception as e:
            log.error(f"[ohlcv] duckdb read error {ticker}: {e}")

    return None


def _fetch_intraday_local(ticker: str, market: str, resolution: str) -> pd.DataFrame | None:
    """Fetch intraday OHLCV with 1Min aggregation support."""
    try:
        safe = ticker.replace(".", "_").replace("/", "_").replace("^", "_")
    except Exception:
        safe = ticker.replace(".", "_")

    if resolution == "1":
        path = os.path.join(_market_dir(market), "intraday", "1", f"{safe}.parquet")
        if os.path.exists(path):
            df = pd.read_parquet(path)
            if df is not None and not df.empty:
                return df[REQUIRED_COLS] if all(c in df.columns for c in REQUIRED_COLS) else df
        return None

    path_1min = os.path.join(_market_dir(market), "intraday", "1", f"{safe}.parquet")
    if os.path.exists(path_1min):
        df_1min = pd.read_parquet(path_1min)
        if df_1min is not None and not df_1min.empty:
            aggregated = _aggregate_timeframe(df_1min, int(resolution))
            if aggregated is not None and not aggregated.empty:
                return aggregated[REQUIRED_COLS]

    path_direct = os.path.join(_market_dir(market), "intraday", resolution, f"{safe}.parquet")
    if os.path.exists(path_direct):
        df = pd.read_parquet(path_direct)
        if df is not None and not df.empty:
            return df[REQUIRED_COLS] if all(c in df.columns for c in REQUIRED_COLS) else df

    return None


def _aggregate_timeframe(df: pd.DataFrame, minutes: int) -> pd.DataFrame | None:
    """Aggregate 1Min candles to higher timeframe."""
    if df is None or df.empty:
        return None

    try:
        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)

        resampled = df.resample(f'{minutes}T').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()

        return resampled
    except Exception as e:
        log.warning(f"[ohlcv] aggregation error: {e}")
        return None


def _migrate_to_sqlite(ticker: str, df: pd.DataFrame):
    """Internal helper to migrate DataFrame to DuckDB."""
    _duckdb_save_ohlcv(ticker, df)


def _download_from_yfinance(ticker: str, days: int = 730, resolution: str = "D", market: str = "IN") -> pd.DataFrame | None:
    """Download OHLCV from yfinance. India uses .NS, US no suffix, FOREX uses =X."""
    import yfinance as yf
    try:
        is_us = market == "US" or ".US" in ticker
        is_forex = market == "FOREX"
        base = ticker.replace("-EQ", "").replace(".NS", "").replace(".US", "")
        
        # FOREX: ticker already has correct format (EURUSD=X, BTC-USD, GC=F)
        if is_forex:
            yf_ticker = ticker  # Use as-is
        elif is_us:
            yf_ticker = base
        else:
            yf_ticker = f"{base}.NS"
        
        period_days = min(days, 730)
        period_str = f"{period_days}d"
        
        # FOREX uses 4hr candles, others use daily
        if is_forex:
            interval = "4h"
        elif resolution != "D":
            interval_map = {"1": "1m", "5": "5m", "15": "15m", "60": "1h"}
            interval = interval_map.get(resolution, "1d")
        else:
            interval = "1d"
        
        ticker_obj = yf.Ticker(yf_ticker)
        df = ticker_obj.history(period=period_str, interval=interval, auto_adjust=True)
        
        if df is None or df.empty:
            log.warning(f"[ohlcv] No data from yfinance for {ticker} ({yf_ticker})")
            return None
        
        df = df.rename(columns={
            'Open': 'Open',
            'High': 'High',
            'Low': 'Low',
            'Close': 'Close',
            'Volume': 'Volume'
        })
        
        if resolution == "D":
            df.index = df.index.normalize()
        
        df = df[~df.index.duplicated(keep="last")]
        df = df.sort_index()
        
        return df[REQUIRED_COLS]
    except Exception as e:
        log.warning(f"[ohlcv] yfinance download error {ticker}: {e}")
        return None


def _download_from_fyers(ticker: str, days: int = 730, fyers_instance=None, resolution: str = "D") -> pd.DataFrame | None:
    """Download OHLCV from yfinance (replaces Fyers API). Returns cleaned DataFrame or None."""
    return _download_from_yfinance(ticker, days, resolution)


def download_intraday(ticker: str, market: str, resolution: str = "60", days: int = 30) -> bool:
    """
    Download intraday OHLCV data from Fyers and save to parquet.
    
    Args:
        ticker: Stock ticker (e.g., "RELIANCE-EQ")
        market: Market code (e.g., "IN")
        resolution: Intraday resolution - "60" for 1-hour, "15" for 15-min, "5" for 5-min
        days: Number of days to look back
        
    Returns:
        True on success
    """
    safe = ticker.replace(".", "_").replace("/", "_").replace("^", "_")
    intraday_dir = os.path.join(_market_dir(market), "intraday", resolution)
    os.makedirs(intraday_dir, exist_ok=True)
    path = os.path.join(intraday_dir, f"{safe}.parquet")
    
    df = _download_from_fyers(ticker, days=days, resolution=resolution)
    if df is None or df.empty:
        log.error(f"[ohlcv] Failed to download intraday {resolution} for {ticker}")
        return False
    
    try:
        df.to_parquet(path)
        log.info(f"[ohlcv] Saved intraday {resolution} for {ticker}: {len(df)} rows to {path}")
        print(f"[OHLCV] Downloaded {len(df)} rows of {resolution}-min data for {ticker}")
        return True
    except Exception as e:
        log.warning(f"[ohlcv] save error {ticker} intraday: {e}")
        return False


def download_ticker(ticker: str, market: str, force: bool = False) -> bool:
    """
    Full history download for a ticker.
    If data exists in SQLite and force=False, skip.
    Returns True on success.
    """
    # Check if already in DuckDB
    if _USE_DUCKDB and not force:
        try:
            conn = duckdb.connect(DUCKDB_1D, read_only=True)
            existing = conn.execute(f"SELECT 1 FROM ohlcv_1D WHERE symbol = '{ticker}' LIMIT 1").fetchone()
            conn.close()
            if existing:
                return True
        except Exception:
            pass

    # Use yfinance for all data
    df = _download_from_yfinance(ticker)
        
    if df is None:
        log.error(f"[ohlcv] Failed to download {ticker} from yfinance")
        return False
    
    # Save to DuckDB
    _duckdb_save_ohlcv(ticker, df)
    
    return True

def update_ticker(ticker: str, market: str) -> bool:
    """
    Incremental update: only fetch rows newer than the last stored date.
    Uses SQLite for storage.
    Returns True on success.
    """
    existing = fetch_local(ticker, market)
    if existing is None:
        return download_ticker(ticker, market, force=True)

    last_date = existing.index.max()
    today = pd.Timestamp.now().normalize()

    # Already up to date (last row is today or yesterday for non-trading days)
    if (today - last_date).days <= 1:
        return True

    # Use yfinance for incremental update
    new_df = _download_from_yfinance(ticker, days=7)
    if new_df is not None and not new_df.empty:
        combined = pd.concat([existing, new_df])
        combined = combined[~combined.index.duplicated(keep="last")]
        combined = combined.sort_index()
        
        # Save to DuckDB
        _duckdb_save_ohlcv(ticker, combined)
        log.info(f"[ohlcv] updated {ticker}: +{len(new_df)} rows -> {len(combined)} total")
        return True
    
    return False

# ... (rest of the code remains the same)

def _store_status(market: str, tickers: list[str]) -> dict:
    """Return per-market store summary."""
    present = []
    missing = []
    stale = []  # last row > 2 trading days old
    incomplete = [] # < 60 rows
    today = pd.Timestamp.now().normalize()

    for t in tickers:
        df = fetch_local(t, market)
        if df is None:
            missing.append(t)
        else:
            if len(df) < MIN_ROWS:
                incomplete.append(t)
            
            last = df.index.max()
            if (today - last).days > 3:
                stale.append(t)
            else:
                present.append(t)

    return {
        "market": market,
        "total": len(tickers),
        "present": len(present),
        "stale": len(stale),
        "missing": len(missing),
        "incomplete": len(incomplete),
        "coverage_pct": round(100 * (len(present) + len(stale)) / max(1, len(tickers)), 1),
        "missing_tickers": missing[:20],
        "incomplete_tickers": incomplete[:20],
    }


def refresh_recent(market: str, tickers: list[str], days: int = 10) -> dict:
    """
    Smart refresh: download last N calendar days of OHLCV from yfinance for all tickers.
    Merges with existing parquet data — new data REPLACES overlapping dates (no duplication).
    Uses yfinance with .NS suffix for Indian stocks.
    
    Args:
        market: Market key (e.g. "IN")
        tickers: List of ticker symbols
        days: Calendar days to fetch (10 ≈ 5 trading days)
    
    Returns: Summary dict with done/failed counts.
    """

    done = 0
    failed = 0
    total = len(tickers)
    import threading
    lock = threading.Lock()
    counters = {"done": 0, "failed": 0}

    def _refresh_one(ticker: str):
        time.sleep(0.1)  # Rate limit: 10 requests/sec
        try:
            existing = fetch_local(ticker, market)
            
            # If data is missing or very small (< 60 rows), trigger a full download
            if existing is None or len(existing) < 60:
                log.info(f"[Refresh] Ticker {ticker} is incomplete ({len(existing) if existing is not None else 0} rows), triggering full download...")
                if download_ticker(ticker, market, force=True):
                    with lock:
                        counters["done"] += 1
                else:
                    with lock:
                        counters["failed"] += 1
                return

            new_df = _download_from_yfinance(ticker, days=days)
            if new_df is None or new_df.empty:
                with lock:
                    counters["failed"] += 1
                return
            if existing is not None and not existing.empty:
                # Normalize existing index too
                existing.index = existing.index.normalize()
                # Drop rows from existing that overlap with new data dates
                # Then append new data - this ensures fresh data replaces old
                overlap_mask = existing.index.isin(new_df.index)
                kept = existing[~overlap_mask]
                combined = pd.concat([kept, new_df])
                combined = combined[~combined.index.duplicated(keep='last')]
                combined = combined.sort_index()
            else:
                # No existing data - just use what we got
                combined = new_df

            # Save to DuckDB
            _duckdb_save_ohlcv(ticker, combined)

            with lock:
                counters["done"] += 1
        except Exception as e:
            log.warning(f"[refresh_recent] {ticker}: {e}")
            with lock:
                counters["failed"] += 1

    # Use 10 parallel workers with rate limiting for 10 req/sec
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(_refresh_one, t): t for t in tickers}
        for i, fut in enumerate(as_completed(futures)):
            try:
                fut.result()
            except Exception:
                pass
            if (i + 1) % 50 == 0 or (i + 1) == total:
                log.info(f"[refresh_recent] {market} {i+1}/{total} — done={counters['done']} failed={counters['failed']}")
                print(f"[Refresh OHLCV] {market} {i+1}/{total} — done={counters['done']} failed={counters['failed']}")

    return {
        "market": market,
        "total": total,
        "done": counters["done"],
        "failed": counters["failed"],
        "date": datetime.now().strftime("%Y-%m-%d"),
    }


def bulk_download(
    market: str,
    tickers: list[str],
    workers: int = 6,
    force: bool = False,
    incremental: bool = False,
) -> dict:
    """
    Download or update OHLCV for all tickers in a market.

    incremental=True  → only fetch delta rows (for daily refresh)
    incremental=False → full 2y download, skip existing unless force=True
    force=True        → re-download everything from scratch

    Returns summary dict.
    """
    done = 0
    skipped = 0
    failed = 0
    total = len(tickers)

    fn = update_ticker if incremental else download_ticker

    def _worker(t):
        if market.upper() == "IN":
            time.sleep(0.1)  # 10 req/sec per worker max
        else:
            time.sleep(0.05)
        if incremental:
            ok = update_ticker(t, market)
        else:
            ok = download_ticker(t, market, force=force)
        return ok

    # Use 5 workers for Indian market to stay under rate limits (~10 req/sec)
    actual_workers = min(workers, 5)

    with ThreadPoolExecutor(max_workers=actual_workers) as ex:
        futures = {ex.submit(_worker, t): t for t in tickers}
        for i, fut in enumerate(as_completed(futures)):
            t = futures[fut]
            try:
                ok = fut.result()
                if ok:
                    done += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
            if (i + 1) % 100 == 0 or (i + 1) == total:
                log.info(f"[ohlcv] {market} {i+1}/{total} — done={done} failed={failed}")

    return {
        "market": market,
        "total": total,
        "done": done,
        "failed": failed,
        "date": datetime.now().strftime("%Y-%m-%d"),
    }

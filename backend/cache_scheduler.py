"""
1-Minute OHLCV Cache System - Pure Cached Data Design.

Design:
- Download 1Min candles from yfinance using .NS suffix after market close
- Store in parquet for caching
- On-demand aggregation to 15Min, 1HR, etc.
- Dashboard reads from cache ONLY (no live fetching)



import os
import time
import logging
import sqlite3
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

import pandas as pd
import yfinance as yf

log = logging.getLogger(__name__)

OHLCV_DIR = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv")
INTRADAY_DIR = os.path.join(OHLCV_DIR, "IN", "intraday")
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "vcp.db")

WORKERS = 5


def download_1min(ticker: str, days: int = 10) -> Optional[pd.DataFrame]:
    """Download 1-minute OHLCV candles from yfinance using .NS suffix."""
    try:
        base = ticker.replace("-EQ", "")
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
        log.warning(f"Error downloading 1min for {ticker}: {e}")
        return None


def save_1min_cache(ticker: str, df: pd.DataFrame):
    """Save 1min candles to parquet file."""
    try:
        safe = ticker.replace(".", "_").replace("/", "_").replace("^", "_")
        cache_dir = os.path.join(INTRADAY_DIR, "1")
        os.makedirs(cache_dir, exist_ok=True)
        path = os.path.join(cache_dir, f"{safe}.parquet")
        df.to_parquet(path)
        log.debug(f"Saved {len(df)} 1min candles for {ticker}")
    except Exception as e:
        log.error(f"Error saving 1min cache for {ticker}: {e}")


def load_1min_cache(ticker: str) -> Optional[pd.DataFrame]:
    """Load 1min candles from parquet file."""
    try:
        safe = ticker.replace(".", "_").replace("/", "_").replace("^", "_")
        path = os.path.join(INTRADAY_DIR, "1", f"{safe}.parquet")
        if os.path.exists(path):
            df = pd.read_parquet(path)
            return df[["Open", "High", "Low", "Close", "Volume"]]
    except Exception as e:
        log.error(f"Error loading 1min cache for {ticker}: {e}")
    return None


def aggregate(df: pd.DataFrame, minutes: int) -> pd.DataFrame:
    """Aggregate 1Min candles to higher timeframe."""
    if df is None or df.empty:
        return pd.DataFrame()

    resampled = df.resample(f'{minutes}T').agg({
        'Open': 'first',
        'High': 'max',
        'Low': 'min',
        'Close': 'last',
        'Volume': 'sum'
    }).dropna()

    return resampled


def get_cached_ohlcv(ticker: str, timeframe: str = "15") -> Optional[pd.DataFrame]:
    """
    Get OHLCV data from cache with on-demand aggregation.

    Args:
        ticker: Stock ticker (e.g., "RELIANCE-EQ")
        timeframe: "1", "5", "15", "60", "D"

    Returns:
        DataFrame with OHLCV candles or None
    """
    if timeframe == "1":
        return load_1min_cache(ticker)

    df_1min = load_1min_cache(ticker)
    if df_1min is None or df_1min.empty:
        return None

    if timeframe == "D":
        return aggregate(df_1min, 1440)

    return aggregate(df_1min, int(timeframe))


def download_all_1min(tickers: List[str], days: int = 10) -> Dict:
    """
    Download 1Min candles for all tickers with rate limiting.

    Args:
        tickers: List of ticker symbols
        days: Number of calendar days to fetch

    Returns:
        Summary dict with done/failed counts
    """
    fyers = _get_fyers_client()
    if not fyers:
        log.error("No Fyers client available")
        return {"done": 0, "failed": len(tickers), "error": "No Fyers client"}

    done = 0
    failed = 0
    total = len(tickers)
    lock = {"done": 0, "failed": 0}

    def _download_one(ticker: str):
        time.sleep(SLEEP_BETWEEN_REQUESTS)
        df = download_1min(ticker, fyers, days)
        if df is not None and not df.empty:
            save_1min_cache(ticker, df)
            lock["done"] += 1
        else:
            lock["failed"] += 1
        return lock["done"] + lock["failed"]

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(_download_one, t): t for t in tickers}
        for i, fut in enumerate(as_completed(futures)):
            try:
                fut.result()
            except Exception:
                lock["failed"] += 1

            if (i + 1) % 50 == 0 or (i + 1) == total:
                log.info(f"[1Min Download] {i+1}/{total} — done={lock['done']} failed={lock['failed']}")

    return {
        "done": lock["done"],
        "failed": lock["failed"],
        "total": total,
        "timestamp": datetime.now().isoformat()
    }


def get_all_ohlcv_tickers() -> List[str]:
    """Get all tickers that have OHLCV data in SQLite."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT ticker FROM ohlcv")
        tickers = [row[0] for row in cursor.fetchall()]
        conn.close()
        return tickers
    except Exception as e:
        log.error(f"Error getting tickers: {e}")
        return []


def run_daily_cache_update():
    """Run daily cache update after market close."""
    log.info("Starting daily 1Min cache update...")
    print("[Cache] Starting daily 1Min cache update...")

    tickers = get_all_ohlcv_tickers()
    log.info(f"Found {len(tickers)} tickers to update")
    print(f"[Cache] Found {len(tickers)} tickers to update")

    start_time = datetime.now()
    result = download_all_1min(tickers, days=10)
    elapsed = (datetime.now() - start_time).total_seconds()

    log.info(f"Daily cache update completed in {elapsed:.1f}s: {result}")
    print(f"[Cache] Completed in {elapsed:.1f}s: done={result['done']}, failed={result['failed']}")

    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    print("=" * 60)
    print("1-Minute OHLCV Cache Scheduler")
    print("=" * 60)

    result = run_daily_cache_update()
    print(f"\nResult: {result}")
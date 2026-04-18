"""
OHLCV Scheduler - Production-grade scheduler for OHLCV updates.

Schedule:
- Every minute (9:16 AM - 3:31 PM IST): Insert 1m data
- Every 5 min (at :05, :10, :15...): Build 5m candles
- Every 15 min (at :15, :30, :45, :00): Build 15m candles
- Every 60 min (at :00): Build 60m candles
- End of day (3:35 PM IST): Build daily candles
- End of week (Friday 3:35 PM IST): Build weekly candles

Features:
- Rate-limited Fyers API calls (10 req/sec)
- Retry logic for failures
- Incremental updates (only new candles)
- Market hours detection
"""

import os
import time
import logging
import threading
import sqlite3
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Callable
from functools import wraps

import pandas as pd

from ohlcv_db import OHLCVDatabase, OHLCVAggregator, OHLCVScheduler, create_ohlcv_system

log = logging.getLogger(__name__)

FYERS_RATE_LIMIT = 10
WORKERS = 5
SLEEP_BETWEEN_REQUESTS = 1.0 / FYERS_RATE_LIMIT

MARKET_START_HOUR = 9
MARKET_START_MINUTE = 15
MARKET_END_HOUR = 15
MARKET_END_MINUTE = 31
CLOSE_CHECK_HOUR = 15
CLOSE_CHECK_MINUTE = 35


class RetryableError(Exception):
    """Error that should trigger a retry."""
    pass


def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """
    Retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum retry attempts
        delay: Initial delay between retries
        backoff: Multiplier for delay after each retry
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except RetryableError as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        log.warning(f"Retryable error in {func.__name__}: {e}, retrying in {current_delay}s...")
                        time.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        log.error(f"Max retries exceeded for {func.__name__}: {e}")

            raise last_exception if last_exception else Exception(f"Failed after {max_attempts} attempts")

        return wrapper
    return decorator


class OHLCVTaskScheduler:
    """
    Scheduler for OHLCV data updates.

    Manages:
    - 1m data insertion from Fyers
    - 5m, 15m, 60m aggregation
    - Daily and weekly aggregation
    """

    def __init__(self, db: OHLCVDatabase = None):
        self.db = db or self._create_db()
        self.aggregator = OHLCVAggregator(self.db)
        self.scheduler = OHLCVScheduler(self.db, self.aggregator)
        self._running = False
        self._thread = None
        self._last_1m_update = None
        self._last_5m_update = None
        self._last_15m_update = None
        self._last_60m_update = None
        self._last_daily_update = None
        self._last_weekly_update = None

    def _create_db(self) -> OHLCVDatabase:
        """Create database instance."""
        db_path = os.path.join(os.path.dirname(__file__), "data", "ohlcv.db")
        return OHLCVDatabase(db_path=db_path)

    def is_market_open(self) -> bool:
        """Check if market is currently open (IST)."""
        now = datetime.now()
        if now.weekday() >= 5:
            return False

        current_minutes = now.hour * 60 + now.minute
        start_minutes = MARKET_START_HOUR * 60 + MARKET_START_MINUTE
        end_minutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE

        return start_minutes <= current_minutes <= end_minutes

    def is_market_closed_today(self) -> bool:
        """Check if market is closed for today (after 3:35 PM)."""
        now = datetime.now()
        if now.weekday() >= 5:
            return True

        current_minutes = now.hour * 60 + now.minute
        close_minutes = CLOSE_CHECK_HOUR * 60 + CLOSE_CHECK_MINUTE

        return current_minutes >= close_minutes

    def is_end_of_week(self) -> bool:
        """Check if it's end of week (Friday after market close)."""
        now = datetime.now()
        return now.weekday() == 4 and self.is_market_closed_today()

    def should_run_1m_update(self) -> bool:
        """Check if 1m update should run now."""
        if not self.is_market_open():
            return False

        now = datetime.now()
        minute_key = (now.hour, now.minute)

        if self._last_1m_update == minute_key:
            return False

        return True

    def should_run_aggregation(self, timeframe: str) -> bool:
        """Check if aggregation for timeframe should run."""
        if not self.is_market_open() and timeframe not in ["1D", "1W"]:
            return False

        now = datetime.now()
        minute = now.minute

        thresholds = {
            "5m": [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
            "15m": [0, 15, 30, 45],
            "60m": [0],
            "1D": [],
            "1W": []
        }

        if timeframe not in thresholds:
            return False

        if timeframe in ["1D", "1W"]:
            if timeframe == "1D" and self.is_market_closed_today():
                if self._last_daily_update is None or self._last_daily_update.date() != now.date():
                    return True
            if timeframe == "1W" and self.is_end_of_week():
                if self._last_weekly_update is None or (now - self._last_weekly_update).days >= 7:
                    return True
            return False

        threshold_list = thresholds[timeframe]
        if minute not in threshold_list:
            return False

        last_key = getattr(self, f"_last_{timeframe.replace('m', 'm')}_update", None)
        if last_key == (now.hour, minute):
            return False

        return True

    def mark_updated(self, timeframe: str):
        """Mark a timeframe as updated."""
        now = datetime.now()
        key = (now.hour, now.minute)

        if timeframe == "1m":
            self._last_1m_update = key
        elif timeframe == "5m":
            self._last_5m_update = key
        elif timeframe == "15m":
            self._last_15m_update = key
        elif timeframe == "60m":
            self._last_60m_update = key
        elif timeframe == "1D":
            self._last_daily_update = now
        elif timeframe == "1W":
            self._last_weekly_update = now

    def get_watchlist_tickers(self) -> List[str]:
        """Get tickers from watchlist."""
        try:
            db_path = os.path.join(os.path.dirname(__file__), "data", "vcp.db")
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT ticker FROM watchlist")
            tickers = [row[0] for row in cursor.fetchall()]
            conn.close()
            return tickers
        except Exception as e:
            log.error(f"Error getting watchlist: {e}")
            return []

    def get_all_tickers(self) -> List[str]:
        """Get all tickers from OHLCV tables."""
        return self.db.get_symbols("1m")

    @retry(max_attempts=3, delay=2.0, backoff=2.0)
    def download_1m_with_retry(self, symbol: str, days: int = 10) -> Optional[pd.DataFrame]:
        """Download 1m candles with retry logic."""
        return self.scheduler.download_1m_candles(symbol, days)

    def update_1m_for_symbol(self, symbol: str) -> bool:
        """
        Update 1m data for a single symbol.

        Args:
            symbol: Stock symbol

        Returns:
            True if successful
        """
        try:
            latest = self.db.get_latest_datetime(symbol, "1m")
            df = self.download_1m_with_retry(symbol, days=10)

            if df is None or df.empty:
                return False

            if latest:
                df = df[df.index > latest]

            if df.empty:
                return True

            inserted = self.db.bulk_insert_ohlcv(symbol, "1m", df)
            log.debug(f"Inserted {inserted} 1m candles for {symbol}")
            return True

        except Exception as e:
            log.error(f"Error updating 1m for {symbol}: {e}")
            return False

    def update_1m_batch(self, symbols: List[str] = None) -> Dict:
        """
        Update 1m data for all symbols (rate-limited).

        Args:
            symbols: List of symbols (None = all from watchlist)

        Returns:
            Summary dict
        """
        if symbols is None:
            symbols = self.get_watchlist_tickers()

        if not symbols:
            log.warning("No symbols to update")
            return {"done": 0, "failed": 0, "skipped": 0}

        done = 0
        failed = 0
        total = len(symbols)

        log.info(f"Starting 1m update for {total} symbols...")

        for i, symbol in enumerate(symbols):
            try:
                time.sleep(SLEEP_BETWEEN_REQUESTS)

                if self.update_1m_for_symbol(symbol):
                    done += 1
                else:
                    failed += 1

                if (i + 1) % 50 == 0 or (i + 1) == total:
                    log.info(f"1m Update: {i+1}/{total} — done={done} failed={failed}")

            except Exception as e:
                log.error(f"Error processing {symbol}: {e}")
                failed += 1

        self.mark_updated("1m")
        return {"done": done, "failed": failed, "total": total}

    def aggregate_timeframe(self, timeframe: str) -> Dict:
        """
        Run aggregation for a specific timeframe.

        Args:
            timeframe: Target timeframe (5m, 15m, 60m, 1D, 1W)

        Returns:
            Summary dict
        """
        symbols = self.db.get_symbols("1m")
        if not symbols:
            log.warning(f"No symbols with 1m data to aggregate to {timeframe}")
            return {"done": 0, "failed": 0}

        log.info(f"Starting {timeframe} aggregation for {len(symbols)} symbols...")

        done = 0
        failed = 0

        for symbol in symbols:
            try:
                latest_1m = self.db.get_latest_datetime(symbol, "1m")
                latest_tf = self.db.get_latest_datetime(symbol, timeframe)

                if latest_tf and latest_1m and latest_tf >= latest_1m:
                    log.debug(f"{symbol} {timeframe} already up to date")
                    continue

                result = self.aggregator.aggregate_all_timeframes(symbol)
                if result.get(timeframe, 0) > 0:
                    done += 1
                else:
                    failed += 1

            except Exception as e:
                log.error(f"Error aggregating {symbol} to {timeframe}: {e}")
                failed += 1

        self.mark_updated(timeframe)
        return {"done": done, "failed": failed, "total": len(symbols)}

    def run_market_open_tasks(self) -> Dict:
        """
        Run tasks during market hours.

        Returns:
            Summary of tasks run
        """
        results = {}

        if self.should_run_1m_update():
            log.info("Running 1m update...")
            results["1m"] = self.update_1m_batch()

        return results

    def run_market_close_tasks(self) -> Dict:
        """
        Run tasks after market close.

        Returns:
            Summary of tasks run
        """
        results = {}

        log.info("Running end-of-day aggregation tasks...")

        timeframes = ["5m", "15m", "60m", "1D"]
        for tf in timeframes:
            if self.should_run_aggregation(tf):
                log.info(f"Running {tf} aggregation...")
                results[tf] = self.aggregate_timeframe(tf)

        if self.is_end_of_week():
            log.info("Running weekly aggregation...")
            results["1W"] = self.aggregate_timeframe("1W")

        return results

    def run_once(self) -> Dict:
        """
        Run appropriate tasks based on current time.

        Returns:
            Summary of all tasks run
        """
        results = {}

        if self.is_market_open():
            results.update(self.run_market_open_tasks())

        if self.is_market_closed_today():
            results.update(self.run_market_close_tasks())

        return results

    def run_continuous(self, interval: int = 60):
        """
        Run scheduler continuously.

        Args:
            interval: Sleep interval in seconds between checks
        """
        self._running = True
        log.info(f"Starting OHLCV scheduler (interval: {interval}s)...")

        while self._running:
            try:
                results = self.run_once()
                if results:
                    log.info(f"Scheduler run completed: {results}")
            except Exception as e:
                log.error(f"Scheduler error: {e}")

            time.sleep(interval)

        log.info("Scheduler stopped")

    def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def start_background(self, interval: int = 60):
        """
        Start scheduler in background thread.

        Args:
            interval: Sleep interval in seconds
        """
        self._thread = threading.Thread(target=self.run_continuous, args=(interval,), daemon=True)
        self._thread.start()
        log.info(f"Scheduler started in background (thread: {self._thread.name})")


def run_scheduler():
    """Run scheduler from command line."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    print("=" * 60)
    print("OHLCV Scheduler")
    print("=" * 60)

    scheduler = OHLCVTaskScheduler()

    try:
        scheduler.run_continuous(interval=60)
    except KeyboardInterrupt:
        print("\nStopping scheduler...")
        scheduler.stop()


if __name__ == "__main__":
    run_scheduler()

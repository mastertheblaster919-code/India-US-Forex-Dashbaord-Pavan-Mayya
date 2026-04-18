"""
Live OHLCV Cache Scheduler - Continuous updates during market hours.

Runs continuously during market hours (9:15 AM - 3:30 PM IST):
- Fetches 1-minute data every 1-2 minutes using yfinance
- Updates SQL database immediately
- Re-aggregates to 5m/15m/60m/1D/1W

This keeps the database continuously updated with live data.
Uses .NS suffix for Indian stocks.
"""

import os
import time
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, List

import pandas as pd
import yfinance as yf

from ohlcv_db import OHLCVDatabase, OHLCVAggregator

log = logging.getLogger(__name__)

WORKERS = 5

MARKET_START_HOUR = 9
MARKET_START_MINUTE = 15
MARKET_END_HOUR = 15
MARKET_END_MINUTE = 30

FETCH_INTERVAL_SECONDS = 60


def is_market_open() -> bool:
    """Check if market is currently open (IST)."""
    now = datetime.now()
    if now.weekday() >= 5:
        return False

    current_minutes = now.hour * 60 + now.minute
    start_minutes = MARKET_START_HOUR * 60 + MARKET_START_MINUTE
    end_minutes = MARKET_END_HOUR * 60 + MARKET_END_MINUTE

    return start_minutes <= current_minutes <= end_minutes


def download_1m_candles(symbol: str, days: int = 10) -> pd.DataFrame | None:
    """Download 1-minute candles from yfinance using .NS suffix."""
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


class LiveOHLCVCacher:
    """
    Live OHLCV Cacher - continuously updates database during market hours.

    Features:
    - Runs during market hours (9:15 AM - 3:30 PM IST)
    - Fetches 1m data every 1 minute
    - Updates SQL database immediately
    - Re-aggregates to higher timeframes
    - Rate-limited to respect Fyers API limits
    """

    def __init__(self, db: OHLCVDatabase = None):
        self.db = db or OHLCVDatabase(db_path='data/ohlcv.db')
        self.aggregator = OHLCVAggregator(self.db)
        self.fyers = None
        self._running = False
        self._thread = None
        self._last_fetch = None
        self._fetch_count = 0

    def _get_fyers(self):
        """Get or create Fyers client."""
        if self.fyers is None:
            self.fyers = _get_fyers_client()
        return self.fyers

    def get_watchlist_tickers(self) -> List[str]:
        """Get tickers to update."""
        return self.db.get_symbols('1m')

    def update_ticker(self, symbol: str) -> bool:
        """Update single ticker's data."""
        try:
            fyers = self._get_fyers()
            if not fyers:
                return False

            latest = self.db.get_latest_datetime(symbol, '1m')

            df = download_1m_candles(fyers, symbol, days=10)
            if df is None or df.empty:
                return False

            if latest:
                df = df[df.index > latest]

            if df.empty:
                return True

            self.db.bulk_insert_ohlcv(symbol, '1m', df)
            log.info(f"Updated {symbol}: +{len(df)} candles")

            return True

        except Exception as e:
            log.error(f"Error updating {symbol}: {e}")
            return False

    def update_all_tickers(self) -> Dict:
        """Update all tickers with rate limiting."""
        tickers = self.get_watchlist_tickers()
        if not tickers:
            return {"done": 0, "failed": 0}

        fyers = self._get_fyers()
        if not fyers:
            log.error("No Fyers client")
            return {"done": 0, "failed": len(tickers)}

        done = 0
        failed = 0

        for i, symbol in enumerate(tickers):
            time.sleep(SLEEP_BETWEEN_REQUESTS)

            if self.update_ticker(symbol):
                done += 1
            else:
                failed += 1

            if (i + 1) % 100 == 0:
                log.info(f"Live cache: {i+1}/{len(tickers)} — done={done} failed={failed}")

        return {"done": done, "failed": failed, "total": len(tickers)}

    def reaggregate_all(self) -> Dict:
        """Re-aggregate all timeframes for all tickers."""
        tickers = self.db.get_symbols('1m')
        results = {}

        for tf, minutes in [('5m', 5), ('15m', 15), ('60m', 60), ('1D', 1440), ('1W', 10080)]:
            done = 0
            for symbol in tickers:
                try:
                    df_1m = self.db.get_ohlcv(symbol, '1m')
                    if df_1m.empty:
                        continue

                    df_agg = self.aggregator._resample(df_1m, minutes)
                    if not df_agg.empty:
                        self.db.bulk_insert_ohlcv(symbol, tf, df_agg)
                        done += 1
                except Exception as e:
                    log.error(f"Error reaggregating {symbol} to {tf}: {e}")

            results[tf] = done
            log.info(f"Reaggregated {tf}: {done} tickers")

        return results

    def run_live_update(self):
        """Run a single live update cycle."""
        if not is_market_open():
            return None

        log.info("Running live update cycle...")
        result = self.update_all_tickers()
        self._last_fetch = datetime.now()
        self._fetch_count += 1

        log.info(f"Live update #{self._fetch_count} completed: {result}")
        return result

    def run_continuous(self, interval: int = FETCH_INTERVAL_SECONDS):
        """
        Run continuously during market hours.

        Args:
            interval: Seconds between update cycles
        """
        self._running = True
        log.info(f"Starting LIVE OHLCV cacher (interval: {interval}s)...")

        while self._running:
            try:
                if is_market_open():
                    self.run_live_update()

                    for _ in range(interval):
                        if not self._running:
                            break
                        time.sleep(1)
                else:
                    now = datetime.now()
                    if now.weekday() >= 5:
                        next_run = "Monday 9:15 AM"
                    else:
                        current_min = now.hour * 60 + now.minute
                        if current_min < MARKET_START_HOUR * 60 + MARKET_START_MINUTE:
                            next_run = f"Today {MARKET_START_HOUR}:{MARKET_START_MINUTE:02d} AM"
                        else:
                            next_run = "Tomorrow 9:15 AM"

                    log.info(f"Market closed. Next run: {next_run}")
                    time.sleep(60)

            except Exception as e:
                log.error(f"Live cacher error: {e}")
                time.sleep(5)

        log.info("Live cacher stopped")

    def stop(self):
        """Stop the live cacher."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def start_background(self, interval: int = FETCH_INTERVAL_SECONDS):
        """Start in background thread."""
        self._thread = threading.Thread(
            target=self.run_continuous,
            args=(interval,),
            daemon=True
        )
        self._thread.start()
        log.info(f"Live cacher started in background (thread: {self._thread.name})")


def run_live_cacher():
    """Run live cacher from command line."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    print("=" * 60)
    print("LIVE OHLCV Cache Scheduler")
    print("Runs continuously during market hours (9:15 AM - 3:30 PM IST)")
    print("Updates 1m data every 60 seconds")
    print("=" * 60)

    cacher = LiveOHLCVCacher()

    try:
        cacher.run_continuous()
    except KeyboardInterrupt:
        print("\nStopping live cacher...")
        cacher.stop()


if __name__ == "__main__":
    run_live_cacher()
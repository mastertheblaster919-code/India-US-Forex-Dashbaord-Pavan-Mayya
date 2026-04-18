"""
24/5 Market Data Scheduler
Runs continuously to keep dashboard updated for India, US, and FOREX markets
Skips weekends - runs Monday-Friday
"""
import os
import sys
import time
import logging
import schedule
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

import pandas as pd
import yfinance as yf

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
log = logging.getLogger(__name__)

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from data_manager import _load_tickers
from ohlcv_store import _download_from_yfinance, _duckdb_save_ohlcv

# Configuration
MARKETS = ["IN", "US", "FOREX"]
UPDATE_INTERVAL_MINUTES = 30
WORKERS = 5

# Market settings
MARKET_CONFIG = {
    "IN": {
        "name": "India",
        "suffix": ".NS",
        "interval": "1d",
        "period": "730d"
    },
    "US": {
        "name": "USA",
        "suffix": "",
        "interval": "1d",
        "period": "730d"
    },
    "FOREX": {
        "name": "FOREX",
        "suffix": "=X",
        "interval": "4h",
        "period": "60d"
    }
}


def is_weekday() -> bool:
    """Check if today is weekday (Monday=0 to Friday=4)"""
    day = datetime.now().weekday()
    return 0 <= day <= 4


def get_yf_ticker(ticker: str, market: str) -> str:
    """Convert ticker to yfinance format based on market"""
    # FOREX tickers already have correct yfinance format (EURUSD=X, BTC-USD, GC=F, etc.)
    if market == "FOREX":
        return ticker
    
    base = ticker.replace("-EQ", "").replace(".NS", "").replace(".US", "")
    
    if market == "US":
        return base
    else:
        return f"{base}.NS"


def download_ticker_data(ticker: str, market: str) -> bool:
    """Download OHLCV data for a single ticker"""
    try:
        config = MARKET_CONFIG[market]
        yf_ticker = get_yf_ticker(ticker, market)
        
        ticker_obj = yf.Ticker(yf_ticker)
        df = ticker_obj.history(period=config["period"], interval=config["interval"], auto_adjust=True)
        
        if df is not None and not df.empty:
            # Save to DuckDB
            _duckdb_save_ohlcv(ticker, df)
            return True
    except Exception as e:
        log.warning(f"Error downloading {ticker} ({market}): {e}")
    
    return False


def update_market(market: str, limit: int = None) -> Dict:
    """Update OHLCV data for all tickers in a market"""
    log.info(f"Updating {MARKET_CONFIG[market]['name']} market data...")
    print(f"[Scheduler] Updating {MARKET_CONFIG[market]['name']} market...")
    
    tickers = _load_tickers(market)
    if limit:
        tickers = tickers[:limit]
    
    log.info(f"Found {len(tickers)} tickers for {market}")
    
    done = 0
    failed = 0
    
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(download_ticker_data, t, market): t for t in tickers}
        
        for i, fut in enumerate(as_completed(futures)):
            try:
                if fut.result():
                    done += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
            
            if (i + 1) % 20 == 0 or (i + 1) == len(tickers):
                log.info(f"  Progress: {i+1}/{len(tickers)} - Done: {done}, Failed: {failed}")
    
    result = {
        "market": market,
        "done": done,
        "failed": failed,
        "total": len(tickers),
        "timestamp": datetime.now().isoformat()
    }
    
    log.info(f"Completed {MARKET_CONFIG[market]['name']}: {done} done, {failed} failed")
    print(f"[Scheduler] {MARKET_CONFIG[market]['name']}: {done} updated, {failed} failed")
    
    return result


def run_all_markets():
    """Update all markets (IN, US, FOREX)"""
    if not is_weekday():
        log.info("Weekend - skipping market update")
        print(f"[Scheduler] Weekend - skipping update")
        return
    
    log.info("=" * 60)
    log.info(f"Starting market data update - {datetime.now()}")
    print(f"\n[Scheduler] === Market Update - {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")
    
    results = []
    for market in MARKETS:
        try:
            result = update_market(market)
            results.append(result)
        except Exception as e:
            log.error(f"Error updating {market}: {e}")
            print(f"[Scheduler] Error updating {market}: {e}")
    
    log.info(f"All markets updated: {results}")
    print(f"[Scheduler] === Update Complete ===\n")


def run_quick_update():
    """Quick update - fewer tickers for faster refresh"""
    if not is_weekday():
        log.info("Weekend - skipping quick update")
        return
    
    log.info("Quick update for all markets...")
    print(f"[Scheduler] Quick update...")
    
    for market in MARKETS:
        try:
            # Limit to 50 tickers for quick update
            update_market(market, limit=50)
        except Exception as e:
            log.error(f"Quick update error for {market}: {e}")


def start_scheduler():
    """Start the 24/5 scheduler"""
    print("=" * 60)
    print("24/5 MARKET DATA SCHEDULER")
    print("Markets: India (NSE), USA (NASDAQ), FOREX")
    print("Schedule: Update every 30 minutes (Mon-Fri)")
    print("Weekends: Skipped")
    print("=" * 60)
    
    # Run immediately on start
    run_all_markets()
    
    # Schedule updates every 30 minutes on weekdays
    schedule.every(UPDATE_INTERVAL_MINUTES).minutes.do(run_all_markets)
    
    print("\nScheduler started!")
    print("Press Ctrl+C to stop\n")
    
    while True:
        schedule.run_pending()
        
        # Log next scheduled run
        next_run = schedule.next_run()
        if next_run:
            log.info(f"Next scheduled run: {next_run}")
        
        time.sleep(60)


if __name__ == "__main__":
    start_scheduler()

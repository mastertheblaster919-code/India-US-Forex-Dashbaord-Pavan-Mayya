import os
import logging
import asyncio
import pandas as pd
from intraday_engine import fetch_intraday_candles, compute_intraday_signals

# Configure logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

async def test_intraday_monitor(ticker):
    log.info(f"Testing intraday monitor for {ticker}...")
    
    # 1. Fetch 15m candles
    log.info("Fetching 15m candles...")
    df_15m = fetch_intraday_candles(ticker, resolution="15", n_candles=50)
    
    # 2. Fetch 1h candles
    log.info("Fetching 1h candles...")
    df_1h = fetch_intraday_candles(ticker, resolution="60", n_candles=50)
    
    if df_15m.empty:
        log.error(f"Failed to get 15m candles for {ticker}")
        return

    log.info(f"Successfully fetched {len(df_15m)} 15m candles and {len(df_1h)} 1h candles.")

    # 3. Compute signals
    log.info("Computing signals...")
    results = compute_intraday_signals(ticker, df_15m, df_1h)
    
    if results:
        print("\nIntraday Signal Results:")
        print(f"Ticker: {results['symbol']}")
        print(f"Intraday Score: {results.get('intraday_score', 'N/A')}")
        print(f"Entry Signal: {results.get('entry_signal', 'N/A')}")
        print(f"Entry Type: {results.get('entry_type', 'N/A')}")
        print(f"Suggested Entry: {results.get('suggested_entry', 'N/A')}")
        print(f"Stop Loss: {results.get('stop_loss', 'N/A')}")
        print(f"Target 1: {results.get('target_1', 'N/A')}")
        
        print("\nIndividual Triggers:")
        for key, val in results.items():
            if isinstance(val, bool) and val is True:
                print(f"  [X] {key}")
    else:
        log.error(f"Failed to compute signals for {ticker}.")

if __name__ == "__main__":
    # Test with a ticker that was just synced
    loop = asyncio.get_event_loop()
    loop.run_until_complete(test_intraday_monitor("MUTHOOTFIN-EQ"))

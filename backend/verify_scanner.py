import os
import pandas as pd
import logging
from engine import VCPDetector, fetch_data

# Configure logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def verify_ticker(ticker):
    log.info(f"Verifying scanner logic for {ticker}...")
    
    # Fetch data - should now be real data from SQLite
    df = fetch_data(ticker, market="IN")
    
    if df is None or df.empty:
        log.error(f"No data found for {ticker}")
        return
    
    is_synthetic = df.attrs.get("is_synthetic", False)
    if is_synthetic:
        log.warning(f"Scanner is STILL using synthetic data for {ticker}. Sync might not have reached it yet.")
    else:
        log.info(f"Successfully loaded {len(df)} rows of REAL data for {ticker}.")
        
    detector = VCPDetector()
    results = detector.analyse(df, ticker)
    
    print("\nScan Results:")
    print(f"Ticker: {results['name']}")
    print(f"Score: {results['score']}")
    print(f"Trend Template: {results['trend_template']}")
    print(f"Last Price: {results['last_price']}")
    print(f"Tightness Rank: {results['tight']}")
    print(f"Checklist Points: {results['checklist']}/7")
    print(f"Squeeze Active: {results['squeeze']}")
    
    if results['score'] >= 70 or len(results['contractions']) > 0:
        print("\n*** POTENTIAL VCP SETUP ***")
        print(f"Contractions: {len(results['contractions'])}")
        for i, c in enumerate(results['contractions']):
            print(f"  Contraction {i+1}: {c['depth_pct']}% depth, {c['length_bars']} days")
    else:
        print("\nNo clear VCP setup detected currently.")

if __name__ == "__main__":
    # Test with one of the tickers that was just synced
    # From logs: MUTHOOTFIN-EQ, CEATLTD-EQ, GRINFRA-EQ
    verify_ticker("MUTHOOTFIN-EQ")

import pandas as pd
import os
import json
import time
import numpy as np
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from engine import fetch_data, DETECTOR
from data_manager import save_scan_cache, _load_tickers

def process_ticker_for_date(ticker, target_date, market, benchmark_df_full):
    try:
        data_df = fetch_data(ticker, market=market)
        if data_df is not None and not data_df.empty:
            # Truncate data to target_date
            data_date = pd.to_datetime(target_date).normalize()
            truncated_df = data_df[data_df.index <= data_date]
            
            if len(truncated_df) >= 60:
                # Truncate benchmark as well
                bench_truncated = None
                if benchmark_df_full is not None and not benchmark_df_full.empty:
                    bench_truncated = benchmark_df_full[benchmark_df_full.index <= data_date]
                
                res = DETECTOR.analyse(truncated_df, ticker=ticker, benchmark_df=bench_truncated)
                if "df" in res:
                    del res["df"]
                return res
    except Exception as e:
        pass
    return None

def run_historical_scan(market="IN", days=100, max_workers=10):
    tickers = _load_tickers(market)
    if not tickers:
        print("No tickers found.")
        return

    # Load full benchmark data once
    benchmark_df_full = None
    try:
        benchmark_df_full = fetch_data("NIFTY50-EQ", market=market)
        if benchmark_df_full is None or benchmark_df_full.empty:
            benchmark_df_full = fetch_data("NIFTY-EQ", market=market)
    except Exception:
        pass

    # Get trading days (days with data for a major stock like RELIANCE)
    try:
        ref_df = fetch_data("RELIANCE-EQ", market=market)
        if ref_df is not None and not ref_df.empty:
            trading_days = ref_df.index.sort_values(ascending=False)[:days]
            trading_days = [d.strftime("%Y-%m-%d") for d in trading_days]
        else:
            # Fallback to last 100 calendar days if reference fails
            trading_days = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]
    except Exception:
        trading_days = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]

    print(f"Starting historical scan for {len(trading_days)} days...", flush=True)

    for date_str in trading_days:
        # Check if already exists in DB to skip
        from data_manager import list_cached_dates
        if date_str in list_cached_dates(market):
            print(f"Skipping {date_str}, already cached.", flush=True)
            continue

        print(f"Scanning {date_str}...", flush=True)
        results = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_ticker_for_date, t, date_str, market, benchmark_df_full): t for t in tickers}
            for future in as_completed(futures):
                res = future.result()
                if res:
                    results.append(res)
        
        if results:
            save_scan_cache(market, date_str, results)
            print(f"✓ Saved {len(results)} results for {date_str}", flush=True)
        else:
            print(f"⚠ No results for {date_str}", flush=True)

if __name__ == "__main__":
    import sys
    days = 100
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except:
            pass
    run_historical_scan(days=days)

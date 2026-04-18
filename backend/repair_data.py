import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

def repair_market_data(market="IN", max_workers=5):
    from audit_data import audit_data
    from ohlcv_store import download_ticker
    
    stats = audit_data(market)
    to_repair = [t for t, count in stats["broken"]] + stats["missing"]
    
    if not to_repair:
        print(f"No tickers need repair in {market} market.")
        return
        
    print(f"\nRepairing {len(to_repair)} tickers...")
    
    done = 0
    failed = 0
    total = len(to_repair)
    
    def repair_one(ticker):
        # Small delay to help with rate limiting
        time.sleep(0.2)
        try:
            success = download_ticker(ticker, market, force=True)
            return ticker, success
        except Exception as e:
            print(f"Error repairing {ticker}: {e}")
            return ticker, False

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(repair_one, t): t for t in to_repair}
        
        for i, future in enumerate(as_completed(futures)):
            ticker, success = future.result()
            if success:
                done += 1
            else:
                failed += 1
            
            if (i + 1) % 10 == 0 or (i + 1) == total:
                print(f"Progress: {i+1}/{total} | Success: {done} | Failed: {failed}")

    print(f"\nRepair Complete for {market}:")
    print(f"- Successfully restored: {done}")
    print(f"- Failed: {failed}")

if __name__ == "__main__":
    # Start repair for Indian market
    repair_market_data("IN", max_workers=4)

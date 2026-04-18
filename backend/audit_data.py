import sqlite3
import os
import pandas as pd
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

def audit_data(market="IN"):
    from data_manager import _load_tickers
    from ohlcv_store import fetch_local
    
    tickers = _load_tickers(market)
    print(f"Auditing {len(tickers)} tickers for market {market}...")
    
    stats = {
        "total": len(tickers),
        "missing": [],
        "broken": [], # < 100 rows
        "healthy": []
    }
    
    for t in tickers:
        df = fetch_local(t, market)
        if df is None:
            stats["missing"].append(t)
        elif len(df) < 100:
            stats["broken"].append((t, len(df)))
        else:
            stats["healthy"].append(t)
            
    print(f"\nAudit Summary for {market}:")
    print(f"- Healthy: {len(stats['healthy'])}")
    print(f"- Broken (Low Data): {len(stats['broken'])}")
    print(f"- Missing: {len(stats['missing'])}")
    
    if stats["broken"]:
        print("\nSample Broken Tickers:")
        for t, count in stats["broken"][:10]:
            print(f"  {t}: {count} rows")
            
    return stats

if __name__ == "__main__":
    audit_data("IN")

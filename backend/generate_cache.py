import pandas as pd
import os
import json
import time
import numpy as np
from datetime import datetime
from engine import fetch_data, DETECTOR, compute_universe_rs_rank

# Try to import db module for SQLite support
try:
    from config_loader import get_config
    _DB_TYPE = get_config().get('database', {}).get('type', 'sqlite')
    if _DB_TYPE == 'sqlite':
        import db as _db_module
        _USE_SQLITE = True
    else:
        _USE_SQLITE = False
except Exception:
    _USE_SQLITE = False


def _convert_numpy(obj):
    """Convert numpy types to Python types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_convert_numpy(i) for i in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def generate_cache(market="IN", limit=None):
    # Standardize market name (but preserve limit parameter)
    market = market if market else "IN"
    
    # Load tickers based on market
    tickers = []
    if market == "US":
        csv_path = os.path.join(os.path.dirname(__file__), "sp500.csv")
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            if "Symbol" in df.columns:
                tickers = df["Symbol"].tolist()  # No suffix for US stocks
    elif market == "FOREX":
        csv_path = os.path.join(os.path.dirname(__file__), "forex.csv")
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            if "Symbol" in df.columns:
                # FOREX tickers already have correct yfinance format (EURUSD=X, BTC-USD, etc.)
                tickers = df["Symbol"].tolist()
    else:
        # India market
        for csv_name in ["fyers_tickers.csv", "nifty500.csv"]:
            csv_path = os.path.join(os.path.dirname(__file__), csv_name)
            if os.path.exists(csv_path):
                nifty = pd.read_csv(csv_path)
                if "Symbol" in nifty.columns:
                    tickers = (nifty["Symbol"] + ".NS").tolist()
                    break
            
    if not tickers:
        print("Could not find tickers. using fallback list.")
        tickers = ["RELIANCE.NS", "TCS.NS", "INFY.NS"] if market == "IN" else ["AAPL.US", "MSFT.US", "AMZN.US"]
        
    if limit:
        tickers = tickers[:limit]
        
    # Fetch benchmark data for RS calculation
    benchmark_df = None
    try:
        if market == "US":
            benchmark_df = fetch_data("^NDX", market=market)  # NASDAQ 100 index
            if benchmark_df is None or benchmark_df.empty:
                benchmark_df = fetch_data("^GSPC", market=market)  # S&P 500 fallback
        elif market == "FOREX":
            # Use EURUSD as benchmark for FOREX (with =X suffix)
            benchmark_df = fetch_data("EURUSD=X", market=market)
        else:
            # India - NIFTY benchmark
            benchmark_df = fetch_data("^NSEI", market=market)
            if benchmark_df is None or benchmark_df.empty:
                benchmark_df = fetch_data("^NIFTY", market=market)
        
        if benchmark_df is not None and not benchmark_df.empty:
            print(f"[OK] Loaded benchmark data with {len(benchmark_df)} bars")
        else:
            print(f"[WARN] Could not load benchmark data, RS will default to 100")
    except Exception as e:
        print(f"[ERROR] Error loading benchmark data: {e}")
        
    results = []
    print(f"Generating cache for {len(tickers)} tickers in {market}...")
    start_time = time.time()

    for i, ticker in enumerate(tickers):
        try:
            data_df = fetch_data(ticker, market=market)
            if data_df is not None and not data_df.empty and len(data_df) >= 60:
                res = DETECTOR.analyse(data_df, ticker=ticker, benchmark_df=benchmark_df)
                if "df" in res:
                    del res["df"]
                results.append(res)
        except Exception as e:
            pass
            
        if (i+1) % 50 == 0:
            print(f"Processed {i+1}/{len(tickers)}... ({len(results)} valid)")

    # Calculate RS rank across universe and update scores
    if results:
        print(f"Calculating RS rank for {len(results)} tickers...")
        results = compute_universe_rs_rank(results)

    # Save cache
    if not results:
        print(f"Failed to generate cache for {market}. Skipping cache save to avoid overwriting good data.")
        return 0, datetime.now().strftime("%Y-%m-%d")

    date_str = datetime.now().strftime("%Y-%m-%d")
    
    # Save to SQLite if enabled
    if _USE_SQLITE:
        try:
            _db_module.execute_update(
                "DELETE FROM scan_results WHERE market = ? AND scan_date = ?",
                (market, date_str)
            )
            data = [
                (market, date_str, r.get('ticker', ''), r.get('vcp_score'),
                 r.get('stage'), r.get('tight_rank'), r.get('dist52'),
                 r.get('rs_rating'), r.get('sector'), r.get('market_cap'),
                 json.dumps(_convert_numpy(r)))
                for r in results
            ]
            if data:
                _db_module.bulk_insert(
                    """INSERT INTO scan_results
                       (market, scan_date, ticker, vcp_score, stage, tight_rank,
                        dist52, rs_rating, sector, market_cap, data)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    data
                )
            print(f"Successfully generated cache for {len(results)} tickers in SQLite in {time.time()-start_time:.1f}s.")
            return len(results), date_str
        except Exception as e:
            print(f"SQLite save error: {e}")
    
    # Fallback to pickle if SQLite fails
    cache_dir = os.path.join(os.path.dirname(__file__), "outputs", "scan_cache")
    os.makedirs(cache_dir, exist_ok=True)
    import pickle
    out_path = os.path.join(cache_dir, f"{market}_{date_str}.pkl")
    with open(out_path, "wb") as f:
        pickle.dump(results, f)
        
    print(f"Successfully generated cache for {len(results)} tickers at {out_path} in {time.time()-start_time:.1f}s.")
    return len(results), date_str

def _post_scan_processing(results: list, market: str = "IN"):
    """After scan: insert qualifying setups to watchlist, send daily summary, expire old entries."""
    try:
        from db import insert_watchlist, expire_old_watchlist, get_active_watchlist
        from notifier import send_daily_summary
    except ImportError as e:
        print(f"[WARN] Could not import db/notifier: {e}")
        return

    market_health = True
    qualifying = [
        r for r in results
        if (r.get("score") or 0) >= 70
        and (r.get("rs_rank_6m") or 0) >= 75
        and (r.get("checklist") or 0) >= 5
        and market_health
    ]

    if qualifying:
        print(f"[INFO] {len(qualifying)} qualifying setups for watchlist")
        for r in qualifying:
            ticker = r.get("ticker")
            last_price = r.get("last_price") or r.get("close") or 0
            if last_price <= 0:
                continue
            insert_watchlist({
                "ticker": ticker,
                "pivot_price": last_price,
                "stop_price": round(last_price * 0.93, 2),
                "target_price": round(last_price * 1.20, 2),
                "score": r.get("score"),
                "ml_prob": r.get("ml_prob"),
                "rs_rank": r.get("rs_rank_6m"),
                "signals_fired": r.get("signals_summary", {}),
            })
        print(f"[INFO] Inserted {len(qualifying)} entries to watchlist")

    expired = expire_old_watchlist()
    if expired > 0:
        print(f"[INFO] Expired {expired} old watchlist entries")

    # Send daily summary with SCAN RESULTS (not watchlist) — send_daily_summary needs
    # score, rs_rank_6m, checklist, stage, signals_summary, last_price from the scan
    send_daily_summary(results)

if __name__ == "__main__":
    count, date = generate_cache("IN")
    if count > 0:
        try:
            from data_manager import load_scan_cache
            results = load_scan_cache("IN", date)
            if results:
                _post_scan_processing(results, "IN")
        except Exception as e:
            print(f"[WARN] Post-scan processing error: {e}")

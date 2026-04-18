import os
from datetime import datetime
import json
import pickle
import numpy as np

SCAN_CACHE_DIR = os.path.join(os.path.dirname(__file__), "outputs", "scan_cache")

def sanitize_for_json(obj):
    """Recursively convert numpy types to native Python types for JSON serialization."""
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        import math
        v = float(obj)
        return 0 if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, np.ndarray):
        return [sanitize_for_json(x) for x in obj.tolist()]
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(x) for x in obj]
    return obj

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


def migrate_pkl_to_sqlite():
    """On startup: migrate any .pkl scan cache files into SQLite if not already present."""
    if not _USE_SQLITE:
        return
    if not os.path.exists(SCAN_CACHE_DIR):
        return
    try:
        for fname in os.listdir(SCAN_CACHE_DIR):
            if not fname.endswith(".pkl"):
                continue
            for prefix in ["IN", "US"]:
                if fname.startswith(prefix + "_"):
                    date_str = fname[len(prefix) + 1:-4]
                    existing = _db_module.execute_query(
                        "SELECT 1 FROM scan_results WHERE market = ? AND scan_date = ? LIMIT 1",
                        (prefix, date_str)
                    )
                    if existing:
                        continue
                    path = os.path.join(SCAN_CACHE_DIR, fname)
                    try:
                        with open(path, "rb") as f:
                            data = pickle.load(f)
                        if data:
                            save_scan_cache(prefix, date_str, data)
                            print(f"[data_manager] Migrated {fname} → SQLite ({len(data)} results)")
                    except Exception:
                        continue
                    break
    except Exception as e:
        import logging
        logging.error(f"pkl→SQLite migration error: {e}")


def _market_prefixes(market: str) -> list:
    """Return all known file prefixes for a given market key."""
    prefixes = [market]
    # Map short keys to legacy long names
    legacy = {
        "IN": ["India (NSE)", "India"],
        "US": ["US"],
    }
    prefixes += legacy.get(market, [])
    return prefixes

def list_cached_dates(market: str) -> list:
    """Return sorted list of dates (strings) that have cached scan results."""
    dates = set()

    # 1. Check SQLite
    if _USE_SQLITE:
        try:
            results = _db_module.execute_query(
                "SELECT DISTINCT scan_date FROM scan_results WHERE market = ?",
                (market,)
            )
            for r in results:
                dates.add(r['scan_date'])
        except Exception:
            pass

    # 2. Check File System (Backward Compatibility)
    if os.path.exists(SCAN_CACHE_DIR):
        prefixes = _market_prefixes(market)
        for fname in os.listdir(SCAN_CACHE_DIR):
            if not fname.endswith(".pkl"):
                continue
            for prefix in prefixes:
                if fname.startswith(prefix + "_"):
                    date_str = fname[len(prefix)+1:-4]
                    dates.add(date_str)
                    break
            
    # Sort descending (newest first)
    sorted_dates = sorted(list(dates), reverse=True)
    return sorted_dates

def load_scan_cache(market: str, date_str: str) -> list:
    """Load scan results from SQLite (primary) or .pkl (legacy)."""
    # 1. Try SQLite
    if _USE_SQLITE:
        try:
            results = _db_module.execute_query(
                """SELECT data FROM scan_results
                   WHERE market = ? AND scan_date = ?
                   ORDER BY vcp_score DESC""",
                (market, date_str)
            )
            if results:
                return [json.loads(r['data']) for r in results]
        except Exception as e:
            import logging
            logging.error(f"SQLite load error: {e}")

    # 2. Try File System (Backward Compatibility)
    if os.path.exists(SCAN_CACHE_DIR):
        prefixes = _market_prefixes(market)
        for prefix in prefixes:
            path = os.path.join(SCAN_CACHE_DIR, f"{prefix}_{date_str}.pkl")
            if os.path.exists(path):
                try:
                    with open(path, "rb") as f:
                        data = pickle.load(f)
                        # Auto-migrate to SQLite if found
                        if _USE_SQLITE:
                            save_scan_cache(market, date_str, data)
                        return data
                except Exception as e:
                    import logging
                    logging.error(f"Legacy .pkl load error: {e}")
                    
    return []


def save_scan_cache(market: str, date_str: str, results: list):
    """Save scan results to SQLite database."""
    if _USE_SQLITE:
        try:
            _db_module.execute_update(
                "DELETE FROM scan_results WHERE market = ? AND scan_date = ?",
                (market, date_str)
            )
            data = [
                (market, date_str, r.get('ticker', ''), r.get('score', r.get('vcp_score', 0)),
                 r.get('stage', 1), r.get('tight', r.get('tight_rank', 1)), r.get('dist52', 0),
                 r.get('rs', r.get('rs_rating', 100)), r.get('sector', 'Unknown'), r.get('cap', 'Unknown'),
                 json.dumps(sanitize_for_json(r)))
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
        except Exception as e:
            import logging
            logging.error(f"SQLite save error: {e}")
def _load_tickers(market: str) -> list:
    """Helper to load ticker list for a market. Returns .NS for India, .US for US."""
    import pandas as pd
    tickers = []
    if market == "IN":
        for csv_name in ["fyers_tickers.csv", "nifty500.csv"]:
            csv_path = os.path.join(os.path.dirname(__file__), csv_name)
            if os.path.exists(csv_path):
                try:
                    df = pd.read_csv(csv_path)
                    if "Symbol" in df.columns:
                        tickers = (df["Symbol"] + ".NS").tolist()
                        break
                except Exception:
                    continue
    elif market == "US":
        csv_path = os.path.join(os.path.dirname(__file__), "sp500.csv")
        if os.path.exists(csv_path):
            try:
                df = pd.read_csv(csv_path)
                if "Symbol" in df.columns:
                    tickers = df["Symbol"].tolist()  # No suffix for US stocks
            except Exception:
                pass
    elif market == "FOREX":
        csv_path = os.path.join(os.path.dirname(__file__), "forex.csv")
        if os.path.exists(csv_path):
            try:
                df = pd.read_csv(csv_path)
                if "Symbol" in df.columns:
                    tickers = df["Symbol"].tolist()
            except Exception:
                pass
    else:
        # Fallback
        tickers = ["RELIANCE.NS"]
    return tickers

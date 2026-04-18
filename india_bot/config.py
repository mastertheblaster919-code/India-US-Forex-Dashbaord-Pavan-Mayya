"""
India Market Bot Configuration
VCP-based trading for NSE stocks
"""
import os

CONFIG = {
    "settings": {
        "min_score": 60,
        "sl_atr": 2.0,
        "rr": 2.0,
        "timeframe": "1d",
        "portfolio_file": "data/india_portfolio.json",
        "journal_file": "data/india_journal.csv",
        "signal_log": "data/india_signals.csv",
        "scan_interval_hours": 4,
    },
    "symbols": {},
    "telegram": {"enabled": False, "token": "", "chat_id": ""}
}

# Load symbols from nifty500.csv
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "nifty500.csv")
if os.path.exists(CSV_PATH):
    import csv
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row.get('Symbol', '').strip()
            if symbol and symbol != 'SYMBOL':
                CONFIG["symbols"][f"{symbol}.NS"] = {
                    "name": row.get('Company Name', symbol),
                    "type": "STOCK",
                    "strat": "VCP",
                    "dir": "L"
                }

print(f"India Bot loaded {len(CONFIG['symbols'])} symbols")

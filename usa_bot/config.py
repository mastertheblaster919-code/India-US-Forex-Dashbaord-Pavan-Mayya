"""
USA Market Bot Configuration
VCP-based trading for S&P 500 stocks
"""
import os

CONFIG = {
    "settings": {
        "min_score": 60,
        "sl_atr": 2.0,
        "rr": 2.0,
        "timeframe": "1d",
        "portfolio_file": "data/usa_portfolio.json",
        "journal_file": "data/usa_journal.csv",
        "signal_log": "data/usa_signals.csv",
        "scan_interval_hours": 4,
    },
    "symbols": {},  # Loaded from sp500.csv
    "telegram": {"enabled": False, "token": "", "chat_id": ""}
}

# Load symbols from sp500.csv
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "sp500.csv")
if os.path.exists(CSV_PATH):
    import csv
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row.get('Symbol', '').strip()
            if symbol:
                CONFIG["symbols"][symbol] = {
                    "name": row.get('Name', symbol),
                    "type": "STOCK",
                    "strat": "VCP",
                    "dir": "L"
                }

print(f"USA Bot loaded {len(CONFIG['symbols'])} symbols")

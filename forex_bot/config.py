# FOREX Bot Configuration
# Based on Global Swing Command Center strategy

CONFIG = {
    "settings": {
        "min_score": 55,  # Minimum ML probability threshold (0-100)
        "sl_atr": 2.0,    # Stop loss as ATR multiple
        "rr": 1.5,        # Risk:Reward ratio
        "portfolio_file": "data/forex_portfolio.json",
        "journal_file": "data/forex_journal.csv",
        "signal_log": "data/forex_signals.csv",
        "scan_interval_hours": 4,  # Auto-scan every 4 hours
    },
    "symbols": {
        "EURUSD=X": {"name": "EUR/USD", "strat": "MOM", "dir": "L"},
        "GBPUSD=X": {"name": "GBP/USD", "strat": "MOM", "dir": "L"},
        "USDJPY=X": {"name": "USD/JPY", "strat": "TRD", "dir": "L"},
        "USDCHF=X": {"name": "USD/CHF", "strat": "MR", "dir": "S"},
        "USDCAD=X": {"name": "USD/CAD", "strat": "MR", "dir": "B"},
        "AUDUSD=X": {"name": "AUD/USD", "strat": "MOM", "dir": "L"},
        "NZDUSD=X": {"name": "NZD/USD", "strat": "MOM", "dir": "L"},
        "GC=F": {"name": "GOLD", "strat": "MOM", "dir": "L"},
        "SI=F": {"name": "SILVER", "strat": "HA", "dir": "L"},
    },
    "telegram": {
        "enabled": False,
        "token": "",
        "chat_id": ""
    }
}

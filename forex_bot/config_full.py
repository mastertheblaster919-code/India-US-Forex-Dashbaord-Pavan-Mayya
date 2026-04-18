# FOREX Bot Configuration - Global Swing Command Center Strategy
# 2-Hour Timeframe | ML-Powered | 33 Instruments

CONFIG = {
    "settings": {
        "min_score": 55,          # Minimum ML probability threshold (0-100)
        "sl_atr": 2.0,            # Stop loss as ATR multiple
        "rr": 1.5,                # Risk:Reward ratio
        "timeframe": "2h",        # 2-hour candles
        "portfolio_file": "data/forex_portfolio.json",
        "journal_file": "data/forex_journal.csv",
        "signal_log": "data/forex_signals.csv",
        "scan_interval_hours": 2, # Auto-scan every 2 hours
    },
    # Symbol: {name, type, strat, dir}
    # strat: MOM (Momentum), TRD (Trend), MR (Mean Reversion), HA (Heikin Ashi)
    # dir: L (Long), S (Short), B (Both)
    "symbols": {
        # === FOREX PAIRS (10) ===
        "EURUSD=X":  {"name": "EUR/USD",    "type": "FX",  "strat": "MOM", "dir": "L"},
        "GBPUSD=X":  {"name": "GBP/USD",    "type": "FX",  "strat": "MOM", "dir": "L"},
        "USDJPY=X":  {"name": "USD/JPY",    "type": "FX",  "strat": "TRD", "dir": "L"},
        "USDCHF=X":  {"name": "USD/CHF",    "type": "FX",  "strat": "MR",  "dir": "S"},
        "AUDUSD=X":  {"name": "AUD/USD",    "type": "FX",  "strat": "MOM", "dir": "L"},
        "USDCAD=X":  {"name": "USD/CAD",    "type": "FX",  "strat": "MR",  "dir": "B"},
        "NZDUSD=X":  {"name": "NZD/USD",    "type": "FX",  "strat": "MOM", "dir": "L"},
        "EURJPY=X":  {"name": "EUR/JPY",    "type": "FX",  "strat": "MOM", "dir": "L"},
        "GBPJPY=X":  {"name": "GBP/JPY",    "type": "FX",  "strat": "TRD", "dir": "L"},
        "EURGBP=X":  {"name": "EUR/GBP",    "type": "FX",  "strat": "MOM", "dir": "L"},
        
        # === COMMODITIES (9) ===
        "GC=F":      {"name": "GOLD",       "type": "CMD", "strat": "MOM", "dir": "L"},
        "SI=F":      {"name": "SILVER",     "type": "CMD", "strat": "HA",  "dir": "L"},
        "CL=F":      {"name": "CRUDE WTI",  "type": "CMD", "strat": "HA",  "dir": "B"},
        "BZ=F":      {"name": "BRENT OIL",  "type": "CMD", "strat": "HA",  "dir": "B"},
        "NG=F":      {"name": "NAT GAS",    "type": "CMD", "strat": "MOM", "dir": "B"},
        "HG=F":      {"name": "COPPER",     "type": "CMD", "strat": "MOM", "dir": "L"},
        "ZC=F":      {"name": "CORN",       "type": "CMD", "strat": "MOM", "dir": "L"},
        "ZW=F":      {"name": "WHEAT",      "type": "CMD", "strat": "MOM", "dir": "L"},
        "ZS=F":      {"name": "SOYBEAN",    "type": "CMD", "strat": "MOM", "dir": "L"},
        
        # === GLOBAL INDICES (14) ===
        "^GSPC":     {"name": "S&P 500",    "type": "IDX", "strat": "MOM", "dir": "L"},
        "^DJI":      {"name": "DOW JONES",  "type": "IDX", "strat": "TRD", "dir": "L"},
        "^IXIC":     {"name": "NASDAQ",     "type": "IDX", "strat": "MOM", "dir": "L"},
        "^RUT":      {"name": "RUSSELL 2000","type": "IDX","strat": "MOM", "dir": "L"},
        "^FTSE":     {"name": "FTSE 100",   "type": "IDX", "strat": "TRD", "dir": "L"},
        "^GDAXI":    {"name": "DAX",        "type": "IDX", "strat": "TRD", "dir": "L"},
        "^FCHI":     {"name": "CAC 40",     "type": "IDX", "strat": "TRD", "dir": "L"},
        "^N225":     {"name": "NIKKEI 225", "type": "IDX", "strat": "TRD", "dir": "L"},
        "^HSI":      {"name": "HANG SENG",  "type": "IDX", "strat": "TRD", "dir": "B"},
        "000001.SS": {"name": "SHANGHAI",   "type": "IDX", "strat": "TRD", "dir": "L"},
        "^STI":      {"name": "SINGAPORE",  "type": "IDX", "strat": "TRD", "dir": "L"},
        "^AXJO":     {"name": "ASX 200",    "type": "IDX", "strat": "TRD", "dir": "L"},
        "^NSEI":     {"name": "NIFTY 50",   "type": "IDX", "strat": "TRD", "dir": "L"},
        "^BSESN":    {"name": "SENSEX",     "type": "IDX", "strat": "TRD", "dir": "L"},
    },
    "telegram": {
        "enabled": False,
        "token": "",
        "chat_id": ""
    }
}

"""
FOREX Trade Journal
Global Swing Command Center - Trade History & Analytics
"""
import os
import csv
from datetime import datetime
from config_full import CONFIG

JOURNAL_FILE = CONFIG["settings"]["journal_file"]


class TradeJournal:
    def __init__(self):
        self.filename = JOURNAL_FILE
        os.makedirs(os.path.dirname(self.filename) or "data", exist_ok=True)
    
    def add_entry(self, trade: dict):
        """Add a trade entry to journal"""
        entry = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "time": datetime.now().strftime("%H:%M"),
            "symbol": trade.get("symbol", ""),
            "name": trade.get("name", ""),
            "direction": trade.get("direction", ""),
            "entry_price": trade.get("entry_price", 0),
            "exit_price": trade.get("exit_price", 0),
            "stop_loss": trade.get("sl", 0),
            "take_profit": trade.get("tp", 0),
            "rr": trade.get("rr", 0),
            "score": trade.get("score", 0),
            "rsi": trade.get("rsi", 0),
            "adx": trade.get("adx", 0),
            "zscore": trade.get("zscore", 0),
            "atr_pct": trade.get("atr_pct", 0),
            "entry_time": trade.get("entry_time", ""),
            "exit_time": trade.get("exit_time", ""),
            "outcome": trade.get("outcome", ""),
            "pnl_pct": trade.get("pnl_pct", 0),
            "pnl_value": trade.get("pnl_value", 0),
            "strategy": trade.get("strat", ""),
            "asset_type": trade.get("type", ""),
            "notes": "",
        }
        
        file_exists = os.path.exists(self.filename)
        with open(self.filename, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=entry.keys())
            if not file_exists:
                writer.writeheader()
            writer.writerow(entry)
    
    def get_entries(self, limit: int = 50) -> list:
        """Get journal entries"""
        if not os.path.exists(self.filename):
            return []
        
        import pandas as pd
        try:
            df = pd.read_csv(self.filename)
            return df.tail(limit).to_dict("records")
        except:
            return []
    
    def get_stats(self) -> dict:
        """Get journal statistics"""
        if not os.path.exists(self.filename):
            return {}
        
        import pandas as pd
        try:
            df = pd.read_csv(self.filename)
            if df.empty:
                return {}
            
            closed = df[df["outcome"].isin(["TP", "SL"])]
            
            stats = {
                "total_trades": len(closed),
                "winning_trades": len(closed[closed["pnl_pct"] > 0]) if not closed.empty else 0,
                "losing_trades": len(closed[closed["pnl_pct"] <= 0]) if not closed.empty else 0,
                "win_rate": 0,
                "avg_win": 0,
                "avg_loss": 0,
                "total_pnl": 0,
                "best_trade": 0,
                "worst_trade": 0,
            }
            
            if not closed.empty:
                wins = closed[closed["pnl_pct"] > 0]
                losses = closed[closed["pnl_pct"] <= 0]
                
                stats["win_rate"] = round(len(wins) / len(closed) * 100, 1) if len(closed) > 0 else 0
                stats["avg_win"] = round(wins["pnl_pct"].mean(), 2) if not wins.empty else 0
                stats["avg_loss"] = round(losses["pnl_pct"].mean(), 2) if not losses.empty else 0
                stats["total_pnl"] = round(closed["pnl_pct"].sum(), 2)
                stats["best_trade"] = round(closed["pnl_pct"].max(), 2) if not closed.empty else 0
                stats["worst_trade"] = round(closed["pnl_pct"].min(), 2) if not closed.empty else 0
            
            return stats
        except:
            return {}
    
    def get_by_symbol(self, symbol: str) -> list:
        """Get trades for specific symbol"""
        if not os.path.exists(self.filename):
            return []
        
        import pandas as pd
        try:
            df = pd.read_csv(self.filename)
            return df[df["symbol"] == symbol].to_dict("records")
        except:
            return []
    
    def get_by_asset_type(self, asset_type: str) -> list:
        """Get trades by asset type (FX, CMD, IDX, CRY)"""
        if not os.path.exists(self.filename):
            return []
        
        import pandas as pd
        try:
            df = pd.read_csv(self.filename)
            return df[df["asset_type"] == asset_type].to_dict("records")
        except:
            return []


if __name__ == "__main__":
    journal = TradeJournal()
    print("Trade Journal Stats:", journal.get_stats())

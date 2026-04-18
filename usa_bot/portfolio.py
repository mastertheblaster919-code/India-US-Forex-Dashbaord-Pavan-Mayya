"""
USA Market Bot Portfolio Manager
"""
import os
import json
from datetime import datetime

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "usa_portfolio.json")

class Portfolio:
    def __init__(self):
        self.data = self._load()
    
    def _load(self):
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                return json.load(f)
        return {"balance": 100000, "positions": [], "history": []}
    
    def _save(self):
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, 'w') as f:
            json.dump(self.data, f, indent=2)
    
    def get_positions(self):
        return self.data.get("positions", [])
    
    def get_stats(self):
        positions = self.data.get("positions", [])
        history = self.data.get("history", [])
        wins = sum(1 for h in history if h.get("pnl_pct", 0) > 0)
        return {
            "balance": self.data.get("balance", 100000),
            "total_return_pct": ((self.data.get("balance", 100000) - 100000) / 100000) * 100,
            "open_positions": len(positions),
            "total_trades": len(history),
            "win_rate": (wins / len(history) * 100) if history else 0,
            "winning_trades": wins,
            "losing_trades": len(history) - wins
        }
    
    def open_position(self, symbol, direction, price, sl, tp, score):
        positions = self.data.get("positions", [])
        if any(p["symbol"] == symbol for p in positions):
            return False
        positions.append({
            "symbol": symbol, "dir": direction, "entry_price": price,
            "sl": sl, "tp": tp, "score": score,
            "entry_time": datetime.now().isoformat(), "size": 1.0
        })
        self.data["positions"] = positions
        self._save()
        return True
    
    def update_positions(self, current_prices):
        return []
    
    def get_history(self, limit=10):
        return self.data.get("history", [])[-limit:]


if __name__ == "__main__":
    p = Portfolio()
    print("USA Portfolio:", p.get_stats())

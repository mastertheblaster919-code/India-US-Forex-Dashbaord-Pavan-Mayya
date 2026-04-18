"""
FOREX Portfolio Manager
Manages simulated positions, tracks P&L, handles exits
"""
import os
import json
from datetime import datetime
from config import CONFIG

SIGNAL_LOG = CONFIG["settings"]["signal_log"]


class Portfolio:
    def __init__(self):
        self.filename = CONFIG["settings"]["portfolio_file"]
        self.data = self._load()
        
    def _load(self):
        if os.path.exists(self.filename):
            with open(self.filename, "r") as f:
                return json.load(f)
        return {
            "balance": 100000,
            "initial_balance": 100000,
            "positions": [],
            "history": [],
            "stats": {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "total_pnl": 0,
                "max_drawdown": 0
            }
        }
    
    def save(self):
        os.makedirs(os.path.dirname(self.filename), exist_ok=True)
        with open(self.filename, "w") as f:
            json.dump(self.data, f, indent=4)
    
    def update_positions(self, current_prices: dict) -> list:
        """Check for SL/TP hits and close positions"""
        closed_trades = []
        
        for p in self.data["positions"][:]:
            sym = p["symbol"]
            if sym not in current_prices:
                continue
            
            price = current_prices[sym]
            
            # Check exit conditions
            hit_sl = (p["dir"] == "LONG" and price <= p["sl"]) or (p["dir"] == "SHORT" and price >= p["sl"])
            hit_tp = (p["dir"] == "LONG" and price >= p["tp"]) or (p["dir"] == "SHORT" and price <= p["tp"])
            
            if hit_sl or hit_tp:
                # Calculate PnL
                if p["dir"] == "LONG":
                    pnl_pct = (price - p["entry_price"]) / p["entry_price"] * 100
                else:
                    pnl_pct = (p["entry_price"] - price) / p["entry_price"] * 100
                
                p["exit_price"] = price
                p["exit_time"] = datetime.now().isoformat()
                p["pnl_pct"] = round(pnl_pct, 2)
                p["pnl_value"] = round(pnl_pct / 100 * self.data["balance"], 2)
                p["outcome"] = "TP" if hit_tp else "SL"
                
                # Update balance
                self.data["balance"] += p["pnl_value"]
                
                # Update stats
                self.data["stats"]["total_trades"] += 1
                if pnl_pct > 0:
                    self.data["stats"]["winning_trades"] += 1
                else:
                    self.data["stats"]["losing_trades"] += 1
                self.data["stats"]["total_pnl"] += pnl_pct
                
                # Move to history
                self.data["history"].append(p)
                self.data["positions"].remove(p)
                closed_trades.append((p, "TP" if hit_tp else "SL"))
                
                # Update signal log
                self._update_signal_log(sym, p["outcome"], pnl_pct)
        
        self.save()
        return closed_trades
    
    def _update_signal_log(self, sym, outcome, pnl):
        """Update signal log with trade outcome"""
        if not os.path.exists(SIGNAL_LOG):
            return
        try:
            import pandas as pd
            df = pd.read_csv(SIGNAL_LOG)
            mask = (df["symbol"] == sym) & (df["outcome"] == "OPEN")
            if mask.any():
                df.loc[mask, "outcome"] = f"{outcome} ({pnl:+.2f}%)"
                df.to_csv(SIGNAL_LOG, index=False)
        except:
            pass
    
    def open_position(self, symbol, direction, entry, sl, tp, score) -> bool:
        """Open a new position"""
        # Don't open if already in position
        if any(p["symbol"] == symbol for p in self.data["positions"]):
            return False
        
        pos = {
            "symbol": symbol,
            "name": next((v["name"] for k, v in CONFIG["symbols"].items() if k == symbol), symbol),
            "dir": direction,
            "entry_price": entry,
            "sl": sl,
            "tp": tp,
            "score": score,
            "entry_time": datetime.now().isoformat(),
            "size": 1.0,  # Fixed size for now
        }
        
        self.data["positions"].append(pos)
        self.save()
        return True
    
    def get_stats(self) -> dict:
        """Get portfolio statistics"""
        stats = self.data["stats"].copy()
        if stats["total_trades"] > 0:
            stats["win_rate"] = round(stats["winning_trades"] / stats["total_trades"] * 100, 1)
            stats["avg_pnl"] = round(stats["total_pnl"] / stats["total_trades"], 2)
        else:
            stats["win_rate"] = 0
            stats["avg_pnl"] = 0
        
        stats["balance"] = self.data["balance"]
        stats["total_return_pct"] = round((self.data["balance"] - self.data["initial_balance"]) / self.data["initial_balance"] * 100, 2)
        stats["open_positions"] = len(self.data["positions"])
        
        return stats
    
    def get_positions(self) -> list:
        """Get current open positions"""
        return self.data["positions"]
    
    def get_history(self, limit: int = 20) -> list:
        """Get trade history"""
        return self.data["history"][-limit:]


if __name__ == "__main__":
    # Test portfolio
    port = Portfolio()
    print(f"Balance: ${port.data['balance']:.2f}")
    print(f"Open positions: {len(port.get_positions())}")
    print(f"Stats: {port.get_stats()}")

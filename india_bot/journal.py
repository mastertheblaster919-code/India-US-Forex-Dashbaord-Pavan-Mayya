"""
India Market Bot Trade Journal
"""
import os
import csv
from datetime import datetime

CSV_FILE = os.path.join(os.path.dirname(__file__), "data", "india_journal.csv")

class TradeJournal:
    def __init__(self):
        self._ensure_file()
    
    def _ensure_file(self):
        if not os.path.exists(CSV_FILE):
            os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)
            with open(CSV_FILE, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['date', 'symbol', 'direction', 'entry_price', 'exit_price', 'pnl_pct', 'score', 'outcome'])
    
    def add_entry(self, symbol, direction, entry_price, exit_price, pnl_pct, score):
        with open(CSV_FILE, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([datetime.now().strftime('%Y-%m-%d'), symbol, direction, entry_price, exit_price, pnl_pct, score, 'CLOSED'])
    
    def get_entries(self, limit=20):
        if not os.path.exists(CSV_FILE):
            return []
        entries = []
        with open(CSV_FILE, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                entries.append(row)
        return entries[-limit:]
    
    def get_stats(self):
        entries = self.get_entries(1000)
        if not entries:
            return {}
        wins = [float(e.get('pnl_pct', 0)) for e in entries if float(e.get('pnl_pct', 0)) > 0]
        losses = [float(e.get('pnl_pct', 0)) for e in entries if float(e.get('pnl_pct', 0)) < 0]
        return {
            'total_trades': len(entries),
            'win_rate': (len(wins) / len(entries) * 100) if entries else 0,
            'avg_win': sum(wins) / len(wins) if wins else 0,
            'avg_loss': sum(losses) / len(losses) if losses else 0,
            'total_pnl': sum(wins) + sum(losses),
            'best_trade': max(wins) if wins else 0,
            'worst_trade': min(losses) if losses else 0
        }


if __name__ == "__main__":
    j = TradeJournal()
    print("India Journal Stats:", j.get_stats())

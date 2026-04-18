import pickle
import os

path = r'd:\Production\vcp_dashboard_india\backend\outputs\scan_cache\IN_2026-04-17.pkl'
if os.path.exists(path):
    with open(path, 'rb') as f:
        data = pickle.load(f)
    # Apply intraday watchlist filters
    watchlist = [s for s in data if s.get('score', 0) >= 60 and s.get('stage', 1) == 2 and s.get('tight', 0) >= 2 and s.get('pct_off_high', 100) < 15]
    watchlist.sort(key=lambda x: x.get('score', 0), reverse=True)
    
    print(f"Total narrowed down stocks: {len(watchlist)}")
    print("-" * 30)
    for s in watchlist[:20]:
        print(f"{s['ticker']}: Score {s['score']}, Tightness {s['tight']}, Off High: {s.get('pct_off_high', 0):.2f}%")
else:
    print(f"No cache found at {path}")

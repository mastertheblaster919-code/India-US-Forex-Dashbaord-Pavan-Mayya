import json
from db import execute_query

results = execute_query("SELECT ticker, vcp_score, rs_rating, data FROM scan_results WHERE scan_date = '2026-04-18' LIMIT 3")
print(f"Found {len(results)} results for today")
for r in results:
    data = json.loads(r['data']) if r['data'] else {}
    print(f"Ticker: {r['ticker']}")
    print(f"  score: {data.get('score')}")
    print(f"  rs_rank_6m: {data.get('rs_rank_6m')}")
    print(f"  signals_summary: {data.get('signals_summary')}")
    print(f"  signals_history: {data.get('signals_history')}")
    print()

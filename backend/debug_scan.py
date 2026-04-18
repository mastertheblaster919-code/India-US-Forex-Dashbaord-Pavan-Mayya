import json
from db import execute_query

results = execute_query('SELECT ticker, vcp_score, rs_rating, data FROM scan_results LIMIT 3')
for r in results:
    data = json.loads(r['data']) if r['data'] else {}
    print(f"Ticker: {r['ticker']}")
    print(f"  vcp_score: {r['vcp_score']}")
    print(f"  rs_rating: {r['rs_rating']}")
    print(f"  score: {data.get('score')}")
    print(f"  rs_rank_6m: {data.get('rs_rank_6m')}")
    print(f"  signals_summary: {data.get('signals_summary')}")
    print(f"  Keys: {list(data.keys())[:25]}")
    print()

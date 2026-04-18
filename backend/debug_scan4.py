from data_manager import load_scan_cache
results = load_scan_cache('IN', '2026-04-18')
print(f"Loaded {len(results)} results")
if results:
    r = results[0]
    print(f"Sample: ticker={r.get('ticker')}, score={r.get('score')}, rs_rank_6m={r.get('rs_rank_6m')}")
    print(f"signals_summary keys: {list(r.get('signals_summary', {}).keys())}")

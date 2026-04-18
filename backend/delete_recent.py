import os
import duckdb
from datetime import datetime, timedelta

DUCKDB_1D = os.path.join(os.path.dirname(__file__), 'data', 'duckdb', 'ohlcv_1D.db')
cutoff = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')

print(f"Deleting data from {cutoff} onwards...")

conn = duckdb.connect(DUCKDB_1D)
conn.execute(f"DELETE FROM ohlcv_1D WHERE datetime >= '{cutoff}'")
conn.commit()
print("Deleted OHLCV data from last 10 days")
conn.close()

# Delete scan cache
scan_cache_dir = os.path.join(os.path.dirname(__file__), 'outputs', 'scan_cache')
if os.path.exists(scan_cache_dir):
    for f in os.listdir(scan_cache_dir):
        if f.endswith('.pkl'):
            os.remove(os.path.join(scan_cache_dir, f))
            print(f"Deleted {f}")

print("Done!")

import duckdb

conn = duckdb.connect("data/duckdb/ohlcv_1D.db", read_only=True)
r = conn.execute("SELECT COUNT(*) FROM ohlcv_1D WHERE symbol = 'TCS-EQ'").fetchone()
print(f"TCS-EQ direct query: {r[0]} rows")

# Check what fetch_local does
from ohlcv_store import fetch_local
df = fetch_local('TCS-EQ', 'IN')
print(f"fetch_local result: {len(df) if df is not None else 'None'}")

conn.close()
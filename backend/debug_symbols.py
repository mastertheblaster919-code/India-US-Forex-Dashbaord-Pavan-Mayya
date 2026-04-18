import duckdb

conn = duckdb.connect("data/duckdb/ohlcv_1D.db", read_only=True)

symbols = conn.execute("SELECT DISTINCT symbol FROM ohlcv_1D ORDER BY symbol LIMIT 30").fetchall()
print(f"Total symbols: {conn.execute('SELECT COUNT(DISTINCT symbol) FROM ohlcv_1D').fetchone()[0]}")

for s in symbols:
    print(f"  {s[0]}")

# Check if RELIANCE exists
result = conn.execute("SELECT symbol FROM ohlcv_1D WHERE symbol LIKE '%RELIANCE%'").fetchall()
print(f"\nRELIANCE variants: {result}")

conn.close()
import duckdb

conn = duckdb.connect("data/duckdb/ohlcv_1D.db", read_only=True)

# Get all symbols that have data
symbols = conn.execute("SELECT symbol, COUNT(*) as cnt FROM ohlcv_1D GROUP BY symbol ORDER BY cnt DESC LIMIT 20").fetchall()
print("Top 20 symbols by row count:")
for s, c in symbols:
    print(f"  {s}: {c}")

# Check a specific one
r = conn.execute("SELECT * FROM ohlcv_1D LIMIT 5").fetchdf()
print(f"\nFirst 5 rows:")
print(r)

conn.close()
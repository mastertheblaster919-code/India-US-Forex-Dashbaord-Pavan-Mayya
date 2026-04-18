import duckdb

conn = duckdb.connect("data/duckdb/ohlcv_1D.db")
symbols = conn.execute("SELECT DISTINCT symbol FROM ohlcv_1D ORDER BY symbol LIMIT 20").fetchall()
print(f"Total symbols: {conn.execute('SELECT COUNT(DISTINCT symbol) FROM ohlcv_1D').fetchone()[0]}")
print(f"\nSample symbols:")
for s in symbols:
    count = conn.execute(f"SELECT COUNT(*) FROM ohlcv_1D WHERE symbol = '{s[0]}'").fetchone()[0]
    print(f"  {s[0]}: {count} rows")

# Check date coverage
dates = conn.execute("SELECT datetime FROM ohlcv_1D WHERE symbol = 'RELIANCE-EQ' ORDER BY datetime").fetchdf()
if not dates.empty:
    print(f"\nRELIANCE-EQ: {len(dates)} rows")
    print(f"  First: {dates['datetime'].min()}")
    print(f"  Last: {dates['datetime'].max()}")

conn.close()
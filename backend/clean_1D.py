import duckdb

conn = duckdb.connect("data/duckdb/ohlcv_1D.db")

# Delete incomplete -E symbols
result = conn.execute("DELETE FROM ohlcv_1D WHERE symbol LIKE '%-E' AND symbol NOT LIKE '%-EQ'")
print(f"Deleted {result.fetchone()[0]} incomplete rows")

# Count remaining
total = conn.execute("SELECT COUNT(*) FROM ohlcv_1D").fetchone()[0]
symbols = conn.execute("SELECT COUNT(DISTINCT symbol) FROM ohlcv_1D").fetchone()[0]
print(f"Remaining: {total:,} rows, {symbols} symbols")

conn.close()

# Check file size
import os
size = os.path.getsize("data/duckdb/ohlcv_1D.db") / 1024 / 1024
print(f"Database size: {size:.2f} MB")
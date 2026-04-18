import duckdb
import os

db_path = "data/duckdb/ohlcv_1D.db"
print(f"Checking: {db_path}")
print(f"Exists: {os.path.exists(db_path)}")
print(f"Size: {os.path.getsize(db_path)/1024/1024:.2f} MB" if os.path.exists(db_path) else "N/A")

if os.path.exists(db_path):
    conn = duckdb.connect(db_path)
    rows = conn.execute("SELECT COUNT(*) FROM ohlcv_1D").fetchone()[0]
    symbols = conn.execute("SELECT COUNT(DISTINCT symbol) FROM ohlcv_1D").fetchone()[0]
    date_range = conn.execute("SELECT MIN(datetime), MAX(datetime) FROM ohlcv_1D").fetchone()
    print(f"\nRows: {rows:,}")
    print(f"Symbols: {symbols}")
    print(f"Date range: {date_range[0]} to {date_range[1]}")
    conn.close()
else:
    print("Database does not exist!")
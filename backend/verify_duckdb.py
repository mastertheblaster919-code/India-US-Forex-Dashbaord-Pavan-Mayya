import duckdb
import os

DUCKDB_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")

for tf in ["5m", "15m", "60m", "1D", "1W"]:
    db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")
    if os.path.exists(db_path):
        conn = duckdb.connect(db_path)
        count = conn.execute(f"SELECT COUNT(*) FROM ohlcv_{tf}").fetchone()[0]
        symbols = conn.execute(f"SELECT COUNT(DISTINCT symbol) FROM ohlcv_{tf}").fetchone()[0]
        sample = conn.execute(f"SELECT * FROM ohlcv_{tf} LIMIT 2").fetchdf()
        print(f"\n=== {tf} ===")
        print(f"Rows: {count:,}, Symbols: {symbols}")
        print(sample)
        conn.close()
    else:
        print(f"\n{tf}: NOT FOUND")
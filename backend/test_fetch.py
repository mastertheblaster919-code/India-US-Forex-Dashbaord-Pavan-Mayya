import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
import duckdb

DUCKDB_1D = os.path.join(os.path.dirname(__file__), "data", "duckdb", "ohlcv_1D.db")

print(f"Checking DuckDB: {DUCKDB_1D}")
print(f"Exists: {os.path.exists(DUCKDB_1D)}")

if os.path.exists(DUCKDB_1D):
    conn = duckdb.connect(DUCKDB_1D, read_only=True)
    df = conn.execute("SELECT * FROM ohlcv_1D WHERE symbol = 'RELIANCE-EQ' ORDER BY datetime").fetchdf()
    print(f"RELIANCE-EQ rows: {len(df)}")
    print(df.head())
    print(df.tail())
    conn.close()
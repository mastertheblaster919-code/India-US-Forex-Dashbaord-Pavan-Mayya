"""
Migrate vcp.db ohlcv table to separate DuckDB files per timeframe.
"""
import os
import sqlite3
import pandas as pd
import duckdb

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "data", "vcp.db")
DUCKDB_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")
TIMEFRAMES = ["5m", "15m", "60m", "1D", "1W"]

def migrate():
    print(f"Source: {SQLITE_PATH}")
    print(f"Dest: {DUCKDB_DIR}\n")

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    cur = sqlite_conn.cursor()

    count = cur.execute("SELECT COUNT(*) FROM ohlcv").fetchone()[0]
    print(f"Source rows: {count:,}")

    cur.execute("SELECT sql FROM sqlite_master WHERE name='ohlcv'")
    print(f"Schema: {cur.fetchone()[0]}\n")

    sample = cur.execute("SELECT * FROM ohlcv LIMIT 3").fetchall()
    print(f"Sample columns: {sample[0] if sample else 'empty'}")

    sqlite_conn.close()

    for tf in TIMEFRAMES:
        db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")
        if os.path.exists(db_path):
            conn = duckdb.connect(db_path)
            existing = conn.execute(f"SELECT COUNT(*) FROM ohlcv_{tf}").fetchone()[0]
            print(f"  {tf}: already has {existing:,} rows")
            conn.close()
        else:
            print(f"  {tf}: NOT FOUND")

if __name__ == "__main__":
    migrate()
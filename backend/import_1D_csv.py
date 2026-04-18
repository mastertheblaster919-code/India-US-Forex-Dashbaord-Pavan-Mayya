"""
Import ohlcv_1D.csv into DuckDB.
"""
import os
import pandas as pd
import duckdb

CSV_PATH = r"D:\OneDrive\MAYYA CAPITAL PARTNERS\Trading Strategies\TradingKnowledgeBase\vcp_streamlit_cloud_deploy\nse_ohlcv_data\ohlcv_1D.csv"
DUCKDB_PATH = os.path.join(os.path.dirname(__file__), "data", "duckdb", "ohlcv_1D.db")

print(f"Reading CSV: {CSV_PATH}")

df = pd.read_csv(CSV_PATH)
print(f"CSV rows: {len(df):,}")
print(f"CSV symbols: {df['symbol'].nunique():,}")
print(f"Date range: {df['datetime'].min()} to {df['datetime'].max()}")

print(f"\nImporting to: {DUCKDB_PATH}")

os.makedirs(os.path.dirname(DUCKDB_PATH), exist_ok=True)

if os.path.exists(DUCKDB_PATH):
    os.remove(DUCKDB_PATH)
    print("Removed old database")

conn = duckdb.connect(DUCKDB_PATH)

conn.execute("""
    CREATE TABLE ohlcv_1D (
        symbol VARCHAR,
        datetime DATE,
        open DOUBLE,
        high DOUBLE,
        low DOUBLE,
        close DOUBLE,
        volume BIGINT
    )
""")

conn.execute("CREATE INDEX idx_1D_symbol ON ohlcv_1D (symbol)")
conn.execute("CREATE INDEX idx_1D_datetime ON ohlcv_1D (datetime)")

df['datetime'] = pd.to_datetime(df['datetime']).dt.strftime('%Y-%m-%d')

rows = [tuple(x) for x in df.values]
conn.executemany("INSERT INTO ohlcv_1D VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
conn.commit()

print(f"\nInserted {len(rows):,} rows")

result = conn.execute("SELECT COUNT(*) as total, COUNT(DISTINCT symbol) as symbols FROM ohlcv_1D").fetchone()
print(f"DuckDB: {result[0]:,} rows, {result[1]:,} symbols")

conn.close()

size = os.path.getsize(DUCKDB_PATH) / 1024 / 1024
print(f"Database size: {size:.2f} MB")
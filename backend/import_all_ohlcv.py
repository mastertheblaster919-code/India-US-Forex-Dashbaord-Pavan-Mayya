"""
Import all OHLCV CSVs into separate DuckDB files.
"""
import os
import pandas as pd
import duckdb

BASE = r"D:\OneDrive\MAYYA CAPITAL PARTNERS\Trading Strategies\TradingKnowledgeBase\vcp_streamlit_cloud_deploy\nse_ohlcv_data"
DUCKDB_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")

os.makedirs(DUCKDB_DIR, exist_ok=True)

FILES = {
    "5m": "ohlcv_5m.csv",
    "15m": "ohlcv_15m.csv",
    "60m": "ohlcv_60m.csv",
    "1D": "ohlcv_1D.csv",
    "1W": "ohlcv_1W.csv",
}

for tf, filename in FILES.items():
    csv_path = os.path.join(BASE, filename)
    db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")

    print(f"\n=== {tf} ===")
    print(f"CSV: {csv_path}")

    df = pd.read_csv(csv_path)
    print(f"Rows: {len(df):,}, Symbols: {df['symbol'].nunique():,}")
    print(f"Date range: {df['datetime'].min()} to {df['datetime'].max()}")

    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed old: {db_path}")

    conn = duckdb.connect(db_path)

    if tf in ["1D", "1W"]:
        conn.execute(f"""
            CREATE TABLE ohlcv_{tf} (
                symbol VARCHAR,
                datetime DATE,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                volume BIGINT
            )
        """)
    else:
        conn.execute(f"""
            CREATE TABLE ohlcv_{tf} (
                symbol VARCHAR,
                datetime TIMESTAMP,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                volume BIGINT
            )
        """)

    conn.execute(f"CREATE INDEX idx_{tf}_symbol ON ohlcv_{tf} (symbol)")
    conn.execute(f"CREATE INDEX idx_{tf}_datetime ON ohlcv_{tf} (datetime)")

    if tf in ["1D", "1W"]:
        conn.execute(f"""
            COPY ohlcv_{tf} (symbol, datetime, open, high, low, close, volume)
            FROM '{csv_path}' (AUTO_DETECT TRUE, HEADER TRUE, DELIMITER ',')
        """)
    else:
        conn.execute(f"""
            COPY ohlcv_{tf} (symbol, datetime, open, high, low, close, volume)
            FROM '{csv_path}' (AUTO_DETECT TRUE, HEADER TRUE, DELIMITER ',')
        """)

    count = conn.execute(f"SELECT COUNT(*) FROM ohlcv_{tf}").fetchone()[0]
    symbols = conn.execute(f"SELECT COUNT(DISTINCT symbol) FROM ohlcv_{tf}").fetchone()[0]
    print(f"Imported: {count:,} rows, {symbols} symbols")

    conn.close()

    size = os.path.getsize(db_path) / 1024 / 1024
    print(f"Size: {size:.2f} MB")

print("\n=== DONE ===")

print("\nDuckDB files summary:")
for tf in FILES.keys():
    db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")
    if os.path.exists(db_path):
        conn = duckdb.connect(db_path, read_only=True)
        rows = conn.execute(f"SELECT COUNT(*) FROM ohlcv_{tf}").fetchone()[0]
        symbols = conn.execute(f"SELECT COUNT(DISTINCT symbol) FROM ohlcv_{tf}").fetchone()[0]
        size = os.path.getsize(db_path) / 1024 / 1024
        print(f"  {tf}: {rows:,} rows, {symbols} symbols, {size:.2f} MB")
        conn.close()
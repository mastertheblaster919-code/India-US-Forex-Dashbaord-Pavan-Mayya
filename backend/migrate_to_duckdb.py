"""
Migrate OHLCV data from SQLite to separate DuckDB files per timeframe.
"""
import os
import sqlite3
import pandas as pd
import duckdb

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "data", "ohlcv.db")
DUCKDB_DIR = os.path.join(os.path.dirname(__file__), "data", "duckdb")
TIMEFRAMES = ["5m", "15m", "60m", "1D", "1W"]

def migrate_timeframe(tf):
    db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")
    table = f"ohlcv_{tf}"

    print(f"Migrating {tf}...")

    if os.path.exists(db_path):
        os.remove(db_path)

    duck_conn = duckdb.connect(db_path)
    sqlite_conn = sqlite3.connect(SQLITE_PATH)

    try:
        df = pd.read_sql_query(f"SELECT symbol, datetime, open, high, low, close, volume FROM {table}", sqlite_conn)
    except Exception as e:
        print(f"  Skip: {e}")
        sqlite_conn.close()
        duck_conn.close()
        return False

    if df.empty:
        print(f"  No data")
        sqlite_conn.close()
        duck_conn.close()
        return False

    print(f"  {len(df)} rows")

    duck_conn.execute(f"""
        CREATE TABLE {table} (
            symbol VARCHAR,
            datetime TIMESTAMP,
            open DOUBLE,
            high DOUBLE,
            low DOUBLE,
            close DOUBLE,
            volume BIGINT
        )
    """)

    df['datetime'] = pd.to_datetime(df['datetime'])

    rows = []
    for _, row in df.iterrows():
        rows.append((row['symbol'], row['datetime'], float(row['open']), float(row['high']), float(row['low']), float(row['close']), int(row['volume'])))

    duckdb_cursor = duck_conn.cursor()
    duckdb_cursor.executemany(
        f"INSERT INTO {table} VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows
    )

    sqlite_conn.close()
    duck_conn.close()

    size = os.path.getsize(db_path) / 1024 / 1024
    print(f"  Done! Size: {size:.2f} MB")
    return True


def verify():
    print("\n=== Verification ===")
    total_size = 0
    for tf in TIMEFRAMES:
        db_path = os.path.join(DUCKDB_DIR, f"ohlcv_{tf}.db")
        if os.path.exists(db_path):
            conn = duckdb.connect(db_path)
            count = conn.execute(f"SELECT COUNT(*) FROM ohlcv_{tf}").fetchone()[0]
            size = os.path.getsize(db_path) / 1024 / 1024
            total_size += size
            print(f"  {tf}: {count:,} rows ({size:.2f} MB)")
            conn.close()
        else:
            print(f"  {tf}: NOT FOUND")
    print(f"\nTotal DuckDB size: {total_size:.2f} MB")


if __name__ == "__main__":
    os.makedirs(DUCKDB_DIR, exist_ok=True)
    print("Migrating to separate DuckDB files...")
    for tf in TIMEFRAMES:
        migrate_timeframe(tf)
    verify()
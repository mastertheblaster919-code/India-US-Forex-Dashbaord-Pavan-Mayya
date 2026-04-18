"""
Populate OHLCV database from parquet cache and test aggregation.
"""
import os
import logging
from datetime import datetime

import pandas as pd

from ohlcv_db import OHLCVDatabase, OHLCVAggregator

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

INTRADAY_DIR = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", "IN", "intraday", "1")


def load_parquet_files():
    """Get all parquet files and their tickers."""
    files = []
    if os.path.exists(INTRADAY_DIR):
        for f in os.listdir(INTRADAY_DIR):
            if f.endswith('.parquet'):
                ticker = f[:-9]
                files.append((ticker, os.path.join(INTRADAY_DIR, f)))
    return files


def populate_database():
    """Populate 1m table from parquet cache."""
    db = OHLCVDatabase(db_path='data/ohlcv.db')

    parquet_files = load_parquet_files()
    log.info(f"Found {len(parquet_files)} tickers in parquet cache")

    done = 0
    failed = 0

    for i, (ticker, path) in enumerate(parquet_files):
        try:
            df = pd.read_parquet(path)
            if df is None or df.empty:
                failed += 1
                continue

            inserted = db.bulk_insert_ohlcv(ticker, "1m", df)
            if inserted > 0:
                done += 1

            if (i + 1) % 100 == 0:
                log.info(f"Progress: {i+1}/{len(parquet_files)} - done={done} failed={failed}")

        except Exception as e:
            log.error(f"Error processing {ticker}: {e}")
            failed += 1

    log.info(f"Population complete: done={done} failed={failed}")
    print(f"\nDatabase 1m rows: {db.count_rows(timeframe='1m')}")

    return db, done, failed


def test_aggregation(db, symbol='RELIANCE-EQ'):
    """Test aggregation for a single symbol."""
    print(f"\n--- Testing aggregation for {symbol} ---")

    aggregator = OHLCVAggregator(db)

    df_1m = db.get_ohlcv(symbol, "1m")
    print(f"1m data: {len(df_1m)} rows")

    if df_1m.empty:
        print("No 1m data found")
        return

    df_5m = aggregator._resample(df_1m, 5)
    print(f"5m aggregated: {len(df_5m)} rows")

    df_15m = aggregator._resample(df_1m, 15)
    print(f"15m aggregated: {len(df_15m)} rows")

    df_60m = aggregator._resample(df_1m, 60)
    print(f"60m aggregated: {len(df_60m)} rows")

    df_1D = aggregator._resample(df_1m, 1440)
    print(f"1D aggregated: {len(df_1D)} rows")

    db.bulk_insert_ohlcv(symbol, "5m", df_5m)
    db.bulk_insert_ohlcv(symbol, "15m", df_15m)
    db.bulk_insert_ohlcv(symbol, "60m", df_60m)
    db.bulk_insert_ohlcv(symbol, "1D", df_1D)

    print(f"\nAfter insert:")
    print(f"  1m: {db.count_rows(symbol=symbol, timeframe='1m')}")
    print(f"  5m: {db.count_rows(symbol=symbol, timeframe='5m')}")
    print(f"  15m: {db.count_rows(symbol=symbol, timeframe='15m')}")
    print(f"  60m: {db.count_rows(symbol=symbol, timeframe='60m')}")
    print(f"  1D: {db.count_rows(symbol=symbol, timeframe='1D')}")


if __name__ == "__main__":
    print("=" * 60)
    print("Populate OHLCV Database from Parquet Cache")
    print("=" * 60)

    db, done, failed = populate_database()

    print(f"\n--- Final Database Stats ---")
    print(f"1m rows: {db.count_rows(timeframe='1m')}")

    test_symbol = 'RELIANCE-EQ'
    test_aggregation(db, test_symbol)

    db.close()
    print("\nDone!")
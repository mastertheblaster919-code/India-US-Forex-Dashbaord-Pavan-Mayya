"""Test chunked download for 1 ticker"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta
from fyers_live import get_fyers
import duckdb

DUCKDB_1D = os.path.join(os.path.dirname(__file__), "data", "duckdb", "ohlcv_1D.db")

fyers = get_fyers()
ticker = "RELIANCE-EQ"
base = ticker.replace("-EQ", "")
fyers_symbol = f"NSE:{base}-EQ"

end_date = datetime.now()
current_start = end_date - timedelta(days=730)

MAX_DAYS = 365
all_rows = []

while current_start < end_date:
    chunk_end = min(current_start + timedelta(days=MAX_DAYS), end_date)

    data = {
        "symbol": fyers_symbol,
        "resolution": "D",
        "date_format": "1",
        "range_from": current_start.strftime("%Y-%m-%d"),
        "range_to": chunk_end.strftime("%Y-%m-%d"),
        "cont_flag": "1"
    }

    res = fyers.history(data=data)
    print(f"Chunk {current_start.date()} to {chunk_end.date()}: {res.get('s')}, candles: {len(res.get('candles', []))}")

    if res.get("s") == "ok" and res.get("candles"):
        for c in res["candles"]:
            ts = datetime.fromtimestamp(c[0])
            all_rows.append((ticker, ts.strftime("%Y-%m-%d"), float(c[1]), float(c[2]), float(c[3]), float(c[4]), int(c[5])))

    current_start = chunk_end + timedelta(days=1)

print(f"\nTotal rows: {len(all_rows)}")

if all_rows:
    conn = duckdb.connect(DUCKDB_1D)
    conn.execute("DELETE FROM ohlcv_1D WHERE symbol = 'RELIANCE-EQ'")
    conn.executemany("INSERT INTO ohlcv_1D VALUES (?, ?, ?, ?, ?, ?, ?)", all_rows)
    conn.commit()
    conn.close()
    print(f"Stored {len(all_rows)} rows")

    conn = duckdb.connect(DUCKDB_1D, read_only=True)
    count = conn.execute("SELECT COUNT(*) FROM ohlcv_1D WHERE symbol = 'RELIANCE-EQ'").fetchone()[0]
    dates = conn.execute("SELECT MIN(datetime), MAX(datetime) FROM ohlcv_1D WHERE symbol = 'RELIANCE-EQ'").fetchone()
    conn.close()
    print(f"RELIANCE-EQ: {count} rows, {dates[0]} to {dates[1]}")
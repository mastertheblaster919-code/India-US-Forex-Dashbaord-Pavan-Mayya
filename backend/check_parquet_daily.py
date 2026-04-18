import os
import pandas as pd

OHLCV_DIR = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", "IN")
files = [f for f in os.listdir(OHLCV_DIR) if f.endswith(".parquet")][:5]

for f in files:
    path = os.path.join(OHLCV_DIR, f)
    df = pd.read_parquet(path)
    print(f"{f}: {len(df)} rows, {df.index.min()} to {df.index.max()}")
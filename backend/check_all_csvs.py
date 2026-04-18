import pandas as pd
import os

base = r"D:\OneDrive\MAYYA CAPITAL PARTNERS\Trading Strategies\TradingKnowledgeBase\vcp_streamlit_cloud_deploy\nse_ohlcv_data"

for tf in ["ohlcv_1D.csv", "ohlcv_1W.csv", "ohlcv_60m.csv", "ohlcv_15m.csv", "ohlcv_5m.csv"]:
    path = os.path.join(base, tf)
    df = pd.read_csv(path, nrows=3)
    print(f"\n=== {tf} ===")
    print(f"Columns: {df.columns.tolist()}")
    print(df.head(2))
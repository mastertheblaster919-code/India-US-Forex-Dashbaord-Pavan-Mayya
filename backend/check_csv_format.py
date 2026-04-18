import pandas as pd

csv_path = r"D:\OneDrive\MAYYA CAPITAL PARTNERS\Trading Strategies\TradingKnowledgeBase\vcp_streamlit_cloud_deploy\nse_ohlcv_data\ohlcv_1D.csv"

df = pd.read_csv(csv_path, nrows=10)
print("Columns:", df.columns.tolist())
print("\nFirst 5 rows:")
print(df.head())
print(f"\nShape: {df.shape}")
print(f"\nDtypes:\n{df.dtypes}")
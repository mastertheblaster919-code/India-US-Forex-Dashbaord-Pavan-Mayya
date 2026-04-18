import sqlite3
import os
import pandas as pd

db_path = r'd:\Production\vcp_dashboard_india\backend\data\vcp.db'
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get counts of rows per ticker
cursor.execute("SELECT ticker, COUNT(*) as count, MIN(datetime) as start, MAX(datetime) as end FROM ohlcv GROUP BY ticker")
rows = cursor.fetchall()

df = pd.DataFrame(rows, columns=['ticker', 'row_count', 'start_date', 'end_date'])
df['start_date'] = pd.to_datetime(df['start_date'])
df['end_date'] = pd.to_datetime(df['end_date'])

total_tickers = len(df)
fully_synced = df[df['row_count'] >= 400] # ~2 years of data
partially_synced = df[(df['row_count'] < 400) & (df['row_count'] >= 60)]
incomplete = df[df['row_count'] < 60]

print(f"Sync Status Summary:")
print(f"Total Tickers in DB: {total_tickers}")
print(f"Fully Synced (>= 400 rows, ~2yr): {len(fully_synced)}")
print(f"Partially Synced (60-400 rows): {len(partially_synced)}")
print(f"Incomplete (< 60 rows): {len(incomplete)}")
print("-" * 30)

if total_tickers > 0:
    print("\nTop 10 Tickers by History:")
    print(df.sort_values('row_count', ascending=False).head(10).to_string(index=False))

    print("\nBottom 10 Tickers (Incomplete):")
    print(df.sort_values('row_count', ascending=True).head(10).to_string(index=False))

conn.close()

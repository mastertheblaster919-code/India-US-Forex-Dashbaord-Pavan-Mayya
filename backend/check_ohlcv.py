import sqlite3

conn = sqlite3.connect('D:/Production/vcp_dashboard_india/backend/data/vcp.db')
cursor = conn.cursor()

# Check ohlcv table
cursor.execute("SELECT COUNT(*) FROM ohlcv")
print("OHLCV rows:", cursor.fetchone()[0])

# Check a sample
cursor.execute("SELECT ticker, COUNT(*) as cnt FROM ohlcv GROUP BY ticker LIMIT 10")
print("\nSample tickers:")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]} rows")

conn.close()

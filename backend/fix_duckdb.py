"""
Fix DuckDB column names and verify data.
"""
import duckdb

conn = duckdb.connect('data/ohlcv_duckdb.db')

print('Current schema:')
for col in conn.execute("DESCRIBE ohlcv_1D").fetchall():
    print(f'  {col}')

print()
print('Checking data:')
df = conn.execute("""
    SELECT symbol, "CAST(datetime AS TIMESTAMP)" as dt, open, high, low, close, volume
    FROM ohlcv_1D
    WHERE symbol = 'RELIANCE-EQ'
    ORDER BY dt DESC
    LIMIT 5
""").fetchdf()
print(df)

conn.close()
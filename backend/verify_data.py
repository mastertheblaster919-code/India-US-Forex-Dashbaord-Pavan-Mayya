import duckdb
conn = duckdb.connect('data/duckdb/ohlcv_1D.db', read_only=True)

# Get all US tickers (no -EQ suffix, no =X, no -USD, no =F)
us_tickers = conn.execute("""
    SELECT DISTINCT symbol FROM ohlcv_1D 
    WHERE symbol NOT LIKE '%-EQ' 
    AND symbol NOT LIKE '%=X' 
    AND symbol NOT LIKE '%.NS' 
    AND symbol NOT LIKE '%-USD' 
    AND symbol NOT LIKE '%=F'
""").fetchall()
print(f'Total US tickers in DB: {len(us_tickers)}')
print('Sample:', [t[0] for t in us_tickers[:30]])

# Get FOREX tickers
forex_tickers = conn.execute("""
    SELECT DISTINCT symbol FROM ohlcv_1D 
    WHERE symbol LIKE '%=X' OR symbol LIKE '%-USD' OR symbol LIKE '%=F'
""").fetchall()
print(f'\nTotal FOREX tickers in DB: {len(forex_tickers)}')
print('All:', [t[0] for t in forex_tickers])

# Get India tickers
india_tickers = conn.execute("SELECT DISTINCT symbol FROM ohlcv_1D WHERE symbol LIKE '%-EQ'").fetchall()
print(f'\nTotal India tickers in DB: {len(india_tickers)}')

# Check row counts
print('\n=== Row counts by market ===')
print('US total rows:', conn.execute("SELECT COUNT(*) FROM ohlcv_1D WHERE symbol NOT LIKE '%-EQ' AND symbol NOT LIKE '%=X' AND symbol NOT LIKE '%.NS' AND symbol NOT LIKE '%-USD' AND symbol NOT LIKE '%=F'").fetchone()[0])
print('FOREX total rows:', conn.execute("SELECT COUNT(*) FROM ohlcv_1D WHERE symbol LIKE '%=X' OR symbol LIKE '%-USD' OR symbol LIKE '%=F'").fetchone()[0])
print('India total rows:', conn.execute("SELECT COUNT(*) FROM ohlcv_1D WHERE symbol LIKE '%-EQ'").fetchone()[0])

conn.close()

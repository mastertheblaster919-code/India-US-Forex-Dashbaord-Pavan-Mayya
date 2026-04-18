from ohlcv_db import OHLCVDatabase, OHLCVAggregator

db = OHLCVDatabase(db_path='data/ohlcv.db')
aggregator = OHLCVAggregator(db)

symbol = 'RELIANCE-EQ'
df_1m = db.get_ohlcv(symbol, '1m')
print(f'1m: {len(df_1m)} rows')

df_5m = aggregator._resample(df_1m, 5)
df_15m = aggregator._resample(df_1m, 15)
df_60m = aggregator._resample(df_1m, 60)
df_1D = aggregator._resample(df_1m, 1440)
df_1W = aggregator._resample(df_1m, 10080)

print(f'5m: {len(df_5m)} rows')
print(f'15m: {len(df_15m)} rows')
print(f'60m: {len(df_60m)} rows')
print(f'1D: {len(df_1D)} rows')
print(f'1W: {len(df_1W)} rows')

db.bulk_insert_ohlcv(symbol, '5m', df_5m)
db.bulk_insert_ohlcv(symbol, '15m', df_15m)
db.bulk_insert_ohlcv(symbol, '60m', df_60m)
db.bulk_insert_ohlcv(symbol, '1D', df_1D)
db.bulk_insert_ohlcv(symbol, '1W', df_1W)

print()
print('After insert:')
print('  1m:', db.count_rows(symbol=symbol, timeframe='1m'))
print('  5m:', db.count_rows(symbol=symbol, timeframe='5m'))
print('  15m:', db.count_rows(symbol=symbol, timeframe='15m'))
print('  60m:', db.count_rows(symbol=symbol, timeframe='60m'))
print('  1D:', db.count_rows(symbol=symbol, timeframe='1D'))
print('  1W:', db.count_rows(symbol=symbol, timeframe='1W'))

print()
print('All tables:')
print('  1m:', db.count_rows(timeframe='1m'))
print('  5m:', db.count_rows(timeframe='5m'))
print('  15m:', db.count_rows(timeframe='15m'))
print('  60m:', db.count_rows(timeframe='60m'))
print('  1D:', db.count_rows(timeframe='1D'))
print('  1W:', db.count_rows(timeframe='1W'))
db.close()
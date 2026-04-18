from ohlcv_db import OHLCVDatabase, OHLCVAggregator

db = OHLCVDatabase(db_path='data/ohlcv.db')
aggregator = OHLCVAggregator(db)

symbol = 'RELIANCE-EQ'
df_1m = db.get_ohlcv(symbol, '1m')
print('1m shape:', df_1m.shape)
print('1m columns:', df_1m.columns.tolist())
print('1m dtypes:', df_1m.dtypes)
print()

df_5m = aggregator._resample(df_1m, 5)
print('5m:', len(df_5m), 'rows')
print('5m columns:', df_5m.columns.tolist())
print()

df_15m = aggregator._resample(df_1m, 15)
print('15m:', len(df_15m), 'rows')

db.close()
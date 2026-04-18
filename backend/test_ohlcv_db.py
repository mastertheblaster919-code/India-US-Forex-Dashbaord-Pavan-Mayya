from ohlcv_db import OHLCVDatabase, OHLCVAggregator
import logging
logging.basicConfig(level=logging.INFO)

db = OHLCVDatabase(db_path='data/ohlcv.db')
print('Database initialized')
print(f'Table 1m: {db.count_rows(timeframe="1m")} rows')
print(f'Table 5m: {db.count_rows(timeframe="5m")} rows')
print(f'Table 15m: {db.count_rows(timeframe="15m")} rows')
print(f'Table 60m: {db.count_rows(timeframe="60m")} rows')
print(f'Table 1D: {db.count_rows(timeframe="1D")} rows')
print(f'Table 1W: {db.count_rows(timeframe="1W")} rows')
db.close()
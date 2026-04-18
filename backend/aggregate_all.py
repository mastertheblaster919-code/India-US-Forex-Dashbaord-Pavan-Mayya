"""
Aggregate all timeframes for all tickers in the OHLCV database.
"""
import logging
from ohlcv_db import OHLCVDatabase, OHLCVAggregator

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def aggregate_all():
    db = OHLCVDatabase(db_path='data/ohlcv.db')
    aggregator = OHLCVAggregator(db)

    symbols = db.get_symbols('1m')
    log.info(f'Found {len(symbols)} symbols with 1m data')

    timeframes = ['5m', '15m', '60m', '1D', '1W']
    minutes = {'5m': 5, '15m': 15, '60m': 60, '1D': 1440, '1W': 10080}

    for tf in timeframes:
        log.info(f'Aggregating {tf}...')
        done = 0
        failed = 0

        for i, symbol in enumerate(symbols):
            try:
                df_1m = db.get_ohlcv(symbol, '1m')
                if df_1m.empty:
                    failed += 1
                    continue

                df_agg = aggregator._resample(df_1m, minutes[tf])
                if df_agg.empty:
                    failed += 1
                    continue

                inserted = db.bulk_insert_ohlcv(symbol, tf, df_agg)
                done += 1

                if (i + 1) % 100 == 0:
                    log.info(f'{tf}: {i+1}/{len(symbols)} — done={done} failed={failed}')

            except Exception as e:
                log.error(f'Error aggregating {symbol} to {tf}: {e}')
                failed += 1

        log.info(f'{tf} complete: done={done} failed={failed}')

    log.info('All aggregation complete!')
    print()
    print('Final database stats:')
    for tf in ['1m', '5m', '15m', '60m', '1D', '1W']:
        count = db.count_rows(timeframe=tf)
        print(f'  {tf}: {count:,} rows')

    db.close()


if __name__ == '__main__':
    print('=' * 60)
    print('Aggregating All Timeframes for All Tickers')
    print('=' * 60)
    aggregate_all()
import pickle
import sys
sys.path.insert(0, '.')
from ohlcv_store import download_intraday

# Load scan results
data = pickle.load(open('outputs/scan_cache/IN_2026-04-16.pkl', 'rb'))
tickers = [r['ticker'] for r in data[:30]]
print(f'Downloading 1hr data for {len(tickers)} tickers...')

for i, t in enumerate(tickers):
    print(f'{i+1}/{len(tickers)}: {t}')
    try:
        download_intraday(t, 'IN', '60', 30)
    except Exception as e:
        print(f'  Error: {e}')
print('Done!')

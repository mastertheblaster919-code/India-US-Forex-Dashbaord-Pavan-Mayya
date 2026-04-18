import os
from datetime import datetime

parquet_dir = r'outputs\ohlcv\IN\intraday\1'
files = os.listdir(parquet_dir)

print('1-Minute Parquet Cache Status:')
print('=' * 50)

recent = []
for f in files[:10]:
    path = os.path.join(parquet_dir, f)
    mtime = datetime.fromtimestamp(os.path.getmtime(path))
    recent.append((f, mtime))

print('Sample files (first 10):')
for f, mtime in recent:
    print(f'  {f}: {mtime.strftime("%Y-%m-%d %H:%M:%S")}')

total = len(files)
print()
print(f'Total parquet files: {total}')

last_modified = max(datetime.fromtimestamp(os.path.getmtime(os.path.join(parquet_dir, f))) for f in files)
print(f'Latest download: {last_modified.strftime("%Y-%m-%d %H:%M:%S")}')

now = datetime.now()
age = (now - last_modified).total_seconds() / 60
print(f'Cache age: {age:.1f} minutes ago')

print()
print('Market hours check:')
print(f'Current time: {now.strftime("%Y-%m-%d %H:%M:%S")}')
print(f'Market close was at: {now.strftime("%Y-%m-%d 15:35")}')
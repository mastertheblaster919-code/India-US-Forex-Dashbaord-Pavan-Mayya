"""Debug Fyers download with full error"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from fyers_live import get_fyers
from datetime import datetime, timedelta

fyers = get_fyers()
if not fyers:
    print("No Fyers!")
    exit()

ticker = "RELIANCE-EQ"
base = ticker.replace("-EQ", "")
fyers_symbol = f"NSE:{base}-EQ"

end_date = datetime.now()
start_date = end_date - timedelta(days=730)

data = {
    "symbol": fyers_symbol,
    "resolution": "D",
    "date_format": "1",
    "range_from": start_date.strftime("%Y-%m-%d"),
    "range_to": end_date.strftime("%Y-%m-%d"),
    "cont_flag": "1"
}

print(f"Symbol: {fyers_symbol}")
res = fyers.history(data=data)

print(f"\nFull response: {res}")
print(f"\nError code: {res.get('code')}")
print(f"Error message: {res.get('message', 'N/A')}")
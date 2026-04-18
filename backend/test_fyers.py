import os
import logging
from fyers_apiv3 import fyersModel
from datetime import datetime, timedelta
import pandas as pd
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)
load_dotenv()

def test_download(ticker):
    app_id = os.getenv("FYERS_APP_ID")
    token_file = "fyers_token.txt"
    with open(token_file, "r") as f:
        token = f.read().strip()
    
    fyers = fyersModel.FyersModel(client_id=app_id, token=token, is_async=False, log_path="")
    
    base = ticker.replace("-EQ", "")
    fyers_symbol = f"NSE:{base}-EQ"
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=90) # Try 90 days
    
    data = {
        "symbol": fyers_symbol,
        "resolution": "D",
        "date_format": "1",
        "range_from": start_date.strftime("%Y-%m-%d"),
        "range_to": end_date.strftime("%Y-%m-%d"),
        "cont_flag": "1"
    }
    
    print(f"Requesting data for {fyers_symbol} from {data['range_from']} to {data['range_to']}")
    res = fyers.history(data=data)
    print(f"Response: {res}")

if __name__ == "__main__":
    test_download("DALBHARAT-EQ")

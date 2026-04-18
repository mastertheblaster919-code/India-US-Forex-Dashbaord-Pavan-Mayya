import requests
import json

# Test refresh endpoint
resp = requests.post("http://localhost:6001/api/refresh", json={"market": "IN", "tickers": []})
print("Status:", resp.status_code)
print("Response:", resp.text[:2000])

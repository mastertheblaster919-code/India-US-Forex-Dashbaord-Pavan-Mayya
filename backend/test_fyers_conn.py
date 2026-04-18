"""Test Fyers connection"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from fyers_live import get_fyers

fyers = get_fyers()
if fyers:
    print("Fyers connected!")
else:
    print("Fyers NOT connected")
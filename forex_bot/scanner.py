"""
FOREX Scanner Module
Based on Global Swing Command Center strategy
Scans 9 FOREX pairs with 4hr candles
"""
import os
import json
import csv
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime
import warnings
from config import CONFIG

warnings.filterwarnings("ignore")

# Signal log path
SIGNAL_LOG = CONFIG["settings"]["signal_log"]

def get_indicators(df: pd.DataFrame):
    """Calculate technical indicators for FOREX pairs"""
    c = df['Close']
    h = df['High']
    l = df['Low']
    o = df['Open']
    
    # RSI
    delta = c.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # EMA 50
    df['ema50'] = c.ewm(span=50, adjust=False).mean()
    df['dist_ema'] = (c - df['ema50']) / df['ema50'] * 100
    
    # Z-Score
    tp = (h + l + c) / 3
    vw = tp.rolling(20).mean()
    vs = tp.rolling(20).std()
    df['zscore'] = (c - vw) / vs.replace(0, np.nan)
    
    # ADX
    plus_dm = h.diff()
    minus_dm = -l.diff()
    plus_dm[plus_dm < 0] = 0
    minus_dm[minus_dm < 0] = 0
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.rolling(14).mean()
    plus_di = 100 * (plus_dm.rolling(14).mean() / atr)
    minus_di = 100 * (minus_dm.rolling(14).mean() / atr)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    df['adx'] = dx.rolling(14).mean()
    
    # ATR
    df['atr_pct'] = (atr / c * 100)
    df['atr_raw'] = atr
    
    # Heikin Ashi
    ha_close = (o + h + l + c) / 4
    ha_open = (o.shift(1) + c.shift(1)) / 2
    df['ha_green'] = (ha_close > ha_open).astype(float)
    
    # Returns
    df['r1'] = c.pct_change(1) * 100
    df['r5'] = c.pct_change(5) * 100
    
    return df


def calculate_confluence(df: pd.DataFrame, strat: str, direction: str) -> float:
    """
    Calculate confluence score based on strategy type
    Returns score 0-100
    """
    c = df.iloc[-1]
    score = 0.0
    
    if strat == "MOM":
        # Momentum strategy
        if c['r1'] > 0:
            score += 25
        if c['r1'] > 0.15:
            score += 10
        if c['Close'] > c['ema50']:
            score += 20
        if c['rsi'] > 40 and c['rsi'] < 70:
            score += 15
        if c['adx'] > 20:
            score += 10
        if c['atr_pct'] > 0.3:
            score += 10
        if c['r5'] > 0:
            score += 10
            
    elif strat == "MR":
        # Mean reversion
        if direction == "S":
            if c['rsi'] > 70:
                score += 30
            if c['rsi'] > 75:
                score += 10
            if c['zscore'] > 2.0:
                score += 25
            if c['zscore'] > 2.5:
                score += 10
            if c['r1'] > 0.5:
                score += 10
            if c['Close'] > c['ema50']:
                score += 15
        else:
            # Both sides
            if c['rsi'] < 30 or c['rsi'] > 70:
                score += 25
            if abs(c['zscore']) > 2.0:
                score += 25
            if (c['rsi'] < 30 and c['Close'] < c['ema50']) or (c['rsi'] > 70 and c['Close'] > c['ema50']):
                score += 15
            if abs(c['r1']) > 0.3:
                score += 10
                
    elif strat == "TRD":
        # Trend following
        if c['Close'] > c['ema50']:
            score += 25
        if c['r1'] > 0:
            score += 10
        if c['rsi'] > 45 and c['rsi'] < 75:
            score += 15
        if c['adx'] > 25:
            score += 20
        if c['adx'] > 35:
            score += 10
        if c['r5'] > 0:
            score += 10
        if c['Close'] > c['ema50'] * 1.005:
            score += 10
            
    elif strat == "HA":
        # Heikin Ashi trend
        if c['ha_green'] > 0.5:
            score += 25
        if c['Close'] > c['ema50']:
            score += 20
        if c['rsi'] > 45 and c['rsi'] < 75:
            score += 15
        if c['adx'] > 20:
            score += 10
        if c['r1'] > 0:
            score += 15
        if c['r5'] > 0:
            score += 10
        if c['atr_pct'] > 0.4:
            score += 5
    
    return min(score, 100.0)


def log_signal(sym, name, direction, price, sl, tp, score, indicators):
    """Log signal to CSV file"""
    os.makedirs(os.path.dirname(SIGNAL_LOG), exist_ok=True)
    now = datetime.now()
    denom_sl = abs(price - sl)
    denom_tp = abs(tp - price)
    rr = round(denom_tp / denom_sl, 2) if denom_sl > 0 else 0.0
    
    row = {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "symbol": sym,
        "name": name,
        "direction": direction,
        "price": round(price, 4),
        "stop_loss": round(sl, 4),
        "take_profit": round(tp, 4),
        "rr": rr,
        "score": round(score, 1),
        "rsi": round(float(indicators.get("rsi", 0) or 0), 1),
        "adx": round(float(indicators.get("adx", 0) or 0), 1),
        "outcome": "OPEN"
    }
    
    file_exists = os.path.exists(SIGNAL_LOG)
    with open(SIGNAL_LOG, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


def scan_all() -> list:
    """
    Scan all FOREX pairs and return signals
    """
    results = []
    current_prices = {}
    
    for ticker, info in CONFIG["symbols"].items():
        try:
            # Download 4hr data for 60 days
            df = yf.download(ticker, period="60d", interval="4h", progress=False)
            if df.empty:
                print(f"  No data for {ticker}")
                continue
            
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            
            df = get_indicators(df)
            df = df.dropna()
            
            if len(df) < 2:
                continue
            
            last = df.iloc[-1]
            current_prices[ticker] = float(last['Close'])
            
            # Calculate confluence score
            score = calculate_confluence(df, info['strat'], info['dir'])
            
            results.append({
                "symbol": ticker,
                "name": info["name"],
                "strat": info["strat"],
                "dir": info["dir"],
                "price": float(last["Close"]),
                "score": score,
                "atr_raw": float(last["atr_raw"]),
                "atr_pct": float(last["atr_pct"]),
                "rsi": float(last["rsi"]),
                "adx": float(last["adx"]),
                "zscore": float(last["zscore"]),
                "ema_dist": float(last["dist_ema"]),
                "ha_green": float(last["ha_green"]),
                "r1": float(last["r1"]),
                "r5": float(last["r5"]),
            })
            
        except Exception as e:
            print(f"  Error scanning {ticker}: {e}")
    
    return results, current_prices


def get_signals_above_threshold(min_score: int = 55) -> tuple:
    """
    Get signals above threshold with SL/TP calculated
    """
    results, current_prices = scan_all()
    signals = []
    
    for r in results:
        if r["score"] >= min_score:
            direction = "LONG" if r["dir"] in ["L", "B"] else "SHORT"
            atr = r["atr_raw"]
            sl_dist = atr * CONFIG["settings"]["sl_atr"]
            price = r["price"]
            
            if direction == "LONG":
                sl = price - sl_dist
                tp = price + sl_dist * CONFIG["settings"]["rr"]
            else:
                sl = price + sl_dist
                tp = price - sl_dist * CONFIG["settings"]["rr"]
            
            signals.append({
                **r,
                "direction": direction,
                "sl": sl,
                "tp": tp,
            })
    
    return signals, current_prices


if __name__ == "__main__":
    print("Testing FOREX Scanner...")
    signals, prices = get_signals_above_threshold(50)
    print(f"\nFound {len(signals)} signals above threshold:")
    for s in signals:
        print(f"  {s['name']}: Score {s['score']:.0f} | {s['direction']} | Price: {s['price']:.4f}")

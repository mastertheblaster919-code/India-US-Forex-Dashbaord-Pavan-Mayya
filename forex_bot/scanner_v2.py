"""
FOREX Scanner Module - Global Swing Command Center Strategy
2-Hour Timeframe | ML-Powered | 33 Instruments
"""
import os
import json
import csv
import pandas as pd
import numpy as np
import yfinance as yf
import xgboost as xgb
from datetime import datetime
import warnings
from config_full import CONFIG

warnings.filterwarnings("ignore")

# === ML MODEL LOADER ===
MODEL_PATH = os.path.join(os.path.dirname(__file__), "global_swing_xgb.json")
FEATURES_PATH = os.path.join(os.path.dirname(__file__), "model_features.json")

_model = None
_feature_list = None


def load_model():
    global _model, _feature_list
    if _model is None:
        if os.path.exists(MODEL_PATH):
            _model = xgb.XGBClassifier()
            _model.load_model(MODEL_PATH)
            with open(FEATURES_PATH) as f:
                _feature_list = json.load(f)
            return _model, _feature_list
        else:
            print("  [WARN] ML model not found - using confluence scoring")
            return None, None
    return _model, _feature_list


def infer_ml(features_dict, strat_type):
    """Run XGBoost inference. Returns ML probability [0.0 - 1.0]."""
    model, feature_list = load_model()
    if model is None:
        return 0.5  # Default 50% if no model
    
    for s in ['strat_HA', 'strat_MOM', 'strat_MR', 'strat_TRD']:
        features_dict[s] = 1.0 if s == f"strat_{strat_type}" else 0.0
    
    row = pd.DataFrame([features_dict])
    row = row.reindex(columns=feature_list, fill_value=0.0)
    row = row.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    
    prob = model.predict_proba(row)[0][1]
    return float(prob)


# === TELEGRAM NOTIFICATIONS ===
def send_telegram(message: str):
    if not CONFIG["telegram"]["enabled"]:
        return
    import requests
    token = CONFIG["telegram"].get("token", "")
    chat_id = CONFIG["telegram"].get("chat_id", "")
    if not token or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, data={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=10)
    except Exception as e:
        print(f"  [WARN] Telegram error: {e}")


# === SIGNAL LOGGER ===
SIGNAL_LOG = CONFIG["settings"]["signal_log"]


def log_signal(sym, name, direction, price, sl, tp, score, indicators):
    os.makedirs(os.path.dirname(SIGNAL_LOG) or "data", exist_ok=True)
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


# === INDICATORS ===
def get_indicators(df: pd.DataFrame):
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
    df['r12'] = c.pct_change(12) * 100
    df['r60'] = c.pct_change(60) * 100
    
    return df


# === CONFLUENCE SCORING (Fallback if no ML model) ===
def calculate_confluence(df: pd.DataFrame, strat: str, direction: str) -> float:
    """Calculate confluence score based on strategy type (0-100)"""
    c = df.iloc[-1]
    score = 0.0
    
    if strat == "MOM":
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
            if c['rsi'] < 30 or c['rsi'] > 70:
                score += 25
            if abs(c['zscore']) > 2.0:
                score += 25
            if abs(c['r1']) > 0.3:
                score += 10
                
    elif strat == "TRD":
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
            
    elif strat == "HA":
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
    
    return min(score, 100.0)


# === MAIN SCANNER ===
def scan_all() -> tuple:
    """
    Scan all 33 instruments on 2-hour timeframe
    Returns: (results list, current_prices dict)
    """
    results = []
    current_prices = {}
    timeframe = CONFIG["settings"].get("timeframe", "2h")
    
    print(f"\n{'='*60}")
    print(f"FOREX SCANNER - 2H TIMEFRAME - {datetime.now()}")
    print(f"{'='*60}")
    
    # Pre-load model
    try:
        load_model()
        print("  ML Model: Loaded")
    except:
        print("  ML Model: Using confluence scoring")
    
    for ticker, info in CONFIG["symbols"].items():
        try:
            print(f"  Scanning {info['name']}...", end=" ")
            
            # Download 1h data and resample to 2h
            df = yf.download(ticker, period="60d", interval="1h", progress=False)
            if df.empty:
                print("No data")
                continue
            
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            
            # Resample to 2h
            agg_dict = {'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'}
            df = df.resample('2h').agg(agg_dict).dropna()
            
            df = get_indicators(df)
            df = df.dropna()
            
            if len(df) < 2:
                print("Insufficient data")
                continue
            
            last = df.iloc[-1]
            current_prices[ticker] = float(last['Close'])
            
            # Build features for ML
            features_dict = {
                'rsi': float(last.get('rsi', 50)),
                'dist_ema': float(last.get('dist_ema', 0)),
                'zscore': float(last.get('zscore', 0)),
                'adx': float(last.get('adx', 20)),
                'atr_pct': float(last.get('atr_pct', 1)),
                'ha_green': float(last.get('ha_green', 0)),
                'r12': float(last.get('r12', 0)),
                'r60': float(last.get('r60', 0)),
            }
            
            # Get ML probability
            ml_prob = infer_ml(features_dict, info['strat'])
            score = round(ml_prob * 100, 1)
            
            results.append({
                "symbol": ticker,
                "name": info["name"],
                "type": info["type"],
                "strat": info["strat"],
                "dir": info["dir"],
                "price": float(last["Close"]),
                "score": score,
                "ml_prob": ml_prob,
                "atr_raw": float(last["atr_raw"]),
                "atr_pct": float(last["atr_pct"]),
                "rsi": float(last["rsi"]),
                "adx": float(last["adx"]),
                "zscore": float(last["zscore"]),
                "ema_dist": float(last["dist_ema"]),
                "ha_green": float(last["ha_green"]),
                "r12": float(last["r12"]),
                "r60": float(last["r60"]),
                "indicators": features_dict
            })
            
            print(f"Score: {score:.0f}%")
            
        except Exception as e:
            print(f"Error: {e}")
    
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

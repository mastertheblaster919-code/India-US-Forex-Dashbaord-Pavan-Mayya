"""
India Market Bot Scanner
VCP-based scanning for NSE stocks
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.dirname(__file__))

from config import CONFIG


def get_vcp_signals(min_score=60):
    """Scan India stocks using VCP logic from backend"""
    from engine import fetch_data, compute_indicators
    
    signals = []
    symbols = list(CONFIG["symbols"].keys())[:50]
    
    print(f"Scanning {len(symbols)} India stocks...")
    
    for symbol in symbols:
        try:
            df = fetch_data(symbol, period="1y", market="IN")
            if df is None or len(df) < 60:
                continue
            
            df = compute_indicators(df)
            
            if len(df) < 10:
                continue
            
            latest = df.iloc[-1]
            
            # VCP logic - use correct column names
            vcp_r1 = latest.get('VCP_R1', 0) or 0
            rsi = latest.get('RSI', 50) or 50
            adx = latest.get('ADX', 0) or 0
            close = latest.get('Close', 0) or latest.get('close', 0) or 0
            sma50 = latest.get('MA50', 0) or 0
            
            # Score calculation
            score = 0
            if vcp_r1 >= 8:
                score += 40
            elif vcp_r1 >= 5:
                score += 30
            elif vcp_r1 >= 3:
                score += 20
            
            if rsi < 70 and rsi > 30:
                score += 20
            
            if adx >= 25:
                score += 20
            
            if close > sma50 and sma50 > 0:
                score += 20
            
            if score >= min_score:
                signals.append({
                    "symbol": symbol,
                    "name": CONFIG["symbols"].get(symbol, {}).get("name", symbol),
                    "type": "STOCK",
                    "dir": "L",
                    "direction": "LONG",
                    "price": close,
                    "score": score,
                    "vcp_score": vcp_r1,
                    "rsi": rsi,
                    "adx": adx,
                    "sl": close * 0.97,
                    "tp": close * 1.06,
                })
                
        except Exception as e:
            continue
    
    signals.sort(key=lambda x: x['score'], reverse=True)
    return signals


if __name__ == "__main__":
    signals = get_vcp_signals(60)
    print(f"\nFound {len(signals)} signals above 60%")
    for s in signals[:10]:
        print(f"  {s['symbol']:12} | VCP: {s['vcp_score']:.0f} | RSI: {s['rsi']:.0f} | Score: {s['score']}")

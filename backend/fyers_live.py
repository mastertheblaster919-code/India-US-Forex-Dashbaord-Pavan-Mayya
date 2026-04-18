import os
import logging
import pandas as pd
from datetime import datetime
from fyers_apiv3 import fyersModel
from dotenv import load_dotenv
import db

log = logging.getLogger(__name__)
load_dotenv()
APP_ID = os.getenv("FYERS_APP_ID")
TOKEN_FILE = os.getenv("FYERS_TOKEN_FILE", "fyers_token.txt")
def get_token_path():
    if os.path.exists(TOKEN_FILE):
        return TOKEN_FILE
    # Try looking in the same directory as this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    alt_path = os.path.join(script_dir, TOKEN_FILE)
    if os.path.exists(alt_path):
        return alt_path
    # Try looking specifically in 'backend' if we are in root
    backend_path = os.path.join(os.getcwd(), "backend", TOKEN_FILE)
    if os.path.exists(backend_path):
        return backend_path
    return None
_fyers_instance = None
def get_fyers():
    global _fyers_instance
    if _fyers_instance:
        return _fyers_instance
    token_paths = [
        "fyers_token.txt",
        "backend/fyers_token.txt",
        os.path.join(os.path.dirname(__file__), "fyers_token.txt"),
        os.path.join(os.getcwd(), "fyers_token.txt"),
        os.path.join(os.getcwd(), "backend", "fyers_token.txt"),
    ]
    token_file = None
    for p in token_paths:
        if os.path.exists(p):
            token_file = p
            log.info(f"Fyers token found at: {p}")
            break
    if not token_file:
        log.error(f"Fyers token not found. searched: {token_paths}")
        return None
    try:
        with open(token_file, "r") as f:
            token = f.read().strip()
        _fyers_instance = fyersModel.FyersModel(client_id=APP_ID, token=token, is_async=False, log_path="")
        return _fyers_instance
    except Exception as e:
        log.error(f"Error initializing Fyers: {e}")
        return None
def get_live_quotes(tickers: list[str]) -> dict:
    """
    Fetch live quotes for a list of tickers from Fyers.
    tickers: list of symbols like ['RELIANCE', 'TCS']
    Returns: dict mapping 'NSE:SYMBOL-EQ' -> quote data
    """
    fyers = get_fyers()
    if not fyers:
        log.warning("Fyers not initialized (no token).")
        return {}
    # Map tickers to Fyers symbols
    # NSE:RELIANCE
    fyers_symbols = []
    symbol_map = {}
    for t in tickers:
        base = t.replace("-EQ", "")
        fs = f"NSE:{base}-EQ"
        fyers_symbols.append(fs)
        symbol_map[fs] = t
    results = {}
    # Fyers quotes API allows up to 50 symbols per request
    chunk_size = 50
    import time
    for i in range(0, len(fyers_symbols), chunk_size):
        chunk = fyers_symbols[i:i + chunk_size]
        try:
            res = fyers.quotes(data={"symbols": ",".join(chunk)})
            if res.get("s") == "ok" and res.get("d"):
                for quote in res["d"]:
                    if quote.get("s") == "ok":
                        results[quote['n']] = quote['v']
                    else:
                        log.warning(f"Quote error for symbol {quote.get('n')}: {quote.get('errmsg')}")
        except Exception as e:
            log.error(f"Error fetching quotes chunk: {e}")
        time.sleep(0.2) # Rate limiting
    log.info(f"Fetched {len(results)} live quotes from Fyers.")
    return results
def reset_instance():
    """
    Reset the cached Fyers instance to force re-initialization with new token.
    """
    global _fyers_instance
    _fyers_instance = None
    log.info("Fyers instance reset - will reinitialize on next call")
def get_live_ohlcv(ticker: str, market: str, quote: dict = None, period: str = "D", interval: str = "1D") -> pd.DataFrame | None:
    """
    Fetch local OHLCV and append today's quote data if available.
    Ensures a smooth transition from historical to live data.
    """
    from ohlcv_store import fetch_local
    df = fetch_local(ticker, market)
    if df is None or df.empty:
        # No local data available
        return None
    if quote:
        lp = quote.get("lp", 0)
        if lp <= 0: return df # invalid quote
        today = pd.Timestamp.now().normalize()
        # Calculate daily OHLC from quote if available, else fallback to lp
        o = quote.get("open_price") or lp
        h = quote.get("high_price") or lp
        l = quote.get("low_price") or lp
        v = quote.get("volume") or 0
        if df.index.max() < today:
            # Append today's row
            new_row = pd.DataFrame({
                "Open": [float(o)],
                "High": [float(h)],
                "Low": [float(l)],
                "Close": [float(lp)],
                "Volume": [int(v)]
            }, index=[today])
            df = pd.concat([df, new_row])
            # Ensure index is unique and sorted
            df = df[~df.index.duplicated(keep='last')]
            df = df.sort_index()
        else:
            # Update today's existing row
            last_idx = df.index.max()
            try:
                df.at[last_idx, "Close"] = float(lp)
                df.at[last_idx, "High"]  = float(max(df.at[last_idx, "High"], float(h)))
                df.at[last_idx, "Low"]   = float(min(df.at[last_idx, "Low"], float(l)))
                df.at[last_idx, "Volume"] = int(v) if v > 0 else df.at[last_idx, "Volume"]
            except Exception as e:
                log.warning(f"Error updating today row for {ticker}: {e}")
    return df


def run_hourly_watchlist_check():
    """
    Check active watchlist for breakout signals.
    For each ticker:
    1. Fetch latest 1H candle from Fyers
    2. Save to outputs/ohlcv/{market}/hourly/{ticker}.parquet
    3. Check breakout: close > pivot_price AND vol > 1.5x avg AND close in upper 40% of range
    4. If breakout: send alert and update status to 'triggered'
    """
    import os
    import pandas as pd
    from datetime import datetime

    market = "IN"
    hourly_dir = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", market.upper(), "hourly")
    os.makedirs(hourly_dir, exist_ok=True)

    try:
        from db import get_active_watchlist, update_watchlist_status
        from notifier import send_breakout_alert
        from engine import fetch_data
    except ImportError as e:
        log.error(f"Could not import required modules: {e}")
        return

    watchlist = get_active_watchlist()
    if not watchlist:
        log.info("No active watchlist entries to check.")
        return

    log.info(f"Running hourly watchlist check for {len(watchlist)} tickers...")

    fyers = get_fyers()
    if not fyers:
        log.warning("Fyers not initialized, skipping hourly check.")
        return

    for entry in watchlist:
        ticker = entry.get("ticker")
        pivot_price = entry.get("pivot_price", 0)
        if not ticker or not pivot_price:
            continue

        try:
            base = ticker.replace("-EQ", "")
            symbol = f"NSE:{base}-EQ"

            res = fyers.history(data={
                "symbol": symbol,
                "resolution": "60",
                "range": "1d",
                "date_format": "1"
            })

            if res.get("s") != "ok" or not res.get("c"):
                continue

            candles = res.get("candles", [])
            if not candles or len(candles) < 2:
                continue

            last_candle = candles[-1]
            dt = datetime.fromtimestamp(last_candle[0])
            o, h, l, c, v = last_candle[1], last_candle[2], last_candle[3], last_candle[4], last_candle[5]

            hourly_row = pd.DataFrame({
                "datetime": [dt],
                "Open": [o], "High": [h], "Low": [l], "Close": [c], "Volume": [v]
            })
            hourly_row.set_index("datetime", inplace=True)

            pq_path = os.path.join(hourly_dir, f"{ticker.replace('-EQ', '_')}_1h.parquet")
            existing = pd.DataFrame()
            if os.path.exists(pq_path):
                try:
                    existing = pd.read_parquet(pq_path)
                    existing = existing[existing.index < dt]
                    combined = pd.concat([existing, hourly_row])
                except Exception:
                    combined = hourly_row
            else:
                combined = hourly_row

            combined = combined[~combined.index.duplicated(keep="last")]
            combined.to_parquet(pq_path)

            avg_vol = combined["Volume"].tail(20).mean() if len(combined) >= 20 else combined["Volume"].mean()
            range_pct = (c - l) / (h - l) if (h - l) > 0 else 0.5

            if c > pivot_price and v > avg_vol * 1.5 and range_pct >= 0.6:
                log.info(f"BREAKOUT DETECTED: {ticker} @ {c} > pivot {pivot_price}")

                hourly_data = {
                    "pivot_crossed": pivot_price,
                    "vol_ratio": v / avg_vol if avg_vol > 0 else 0,
                    "range_pct": range_pct,
                    "close": c,
                    "volume": v,
                }

                entry["last_price"] = c
                send_breakout_alert(entry, hourly_data)
                db.update_watchlist_status(ticker, "triggered")

                place_gtt_bracket(fyers, ticker, c, entry.get("stop_price", 0), entry.get("target_price", 0))

        except Exception as e:
            log.error(f"Error checking {ticker}: {e}")
            continue

    log.info("Hourly watchlist check complete.")


_FYERS_FILLED_NOTIFIED: set = set()


def check_gtt_orders_filled(fyers_client) -> None:
    """
    Poll Fyers GTT order book for filled/executed orders.
    Fires send_order_filled Telegram alert for any newly-filled orders.
    Uses a module-level set to avoid notifying the same order twice.
    
    If an entry GTT is filled, it automatically places the OCO SL/TP GTT.
    """
    try:
        # For GTT, we use get_gtt_order instead of get_order_book
        result = fyers_client.get_gtt_order()
        if result.get("s") != "ok":
            return

        orders = result.get("data", []) or []
        newly_filled = []

        for order in orders:
            # GTT Status: 1: Active, 2: Triggered/Filled, 3: Cancelled, 4: Expired, 5: Rejected
            status = order.get("status")
            order_id = str(order.get("id", ""))
            side = order.get("side") # 1 for Buy, -1 for Sell
            
            if order_id in _FYERS_FILLED_NOTIFIED:
                continue

            if status == 2: # Triggered / Filled
                _FYERS_FILLED_NOTIFIED.add(order_id)
                symbol = order.get("symbol", "")
                ticker = symbol.replace("NSE:", "")
                
                # Extract fill details from orderInfo/leg1
                order_info = order.get("orderInfo", {})
                leg1 = order_info.get("leg1", {})
                
                fill_data = {
                    "ticker": symbol,
                    "price": leg1.get("price", 0),
                    "qty": leg1.get("qty", 0),
                    "order_id": order_id,
                    "status": "filled",
                }
                newly_filled.append(fill_data)

                # If it's a BUY order, it's likely an entry. Place OCO legs.
                if side == 1:
                    watchlist_entry = db.get_watchlist_entry(ticker)
                    if watchlist_entry:
                        sl = watchlist_entry.get("stop_price", 0)
                        tgt = watchlist_entry.get("target_price", 0)
                        qty = fill_data["qty"]
                        
                        if sl > 0 and tgt > 0:
                            log.info(f"Entry filled for {ticker}. Placing OCO GTT (SL={sl}, TGT={tgt})")
                            place_gtt_oco(fyers_client, ticker, sl, tgt, qty)
                        
                        # Update status and journal
                        db.update_watchlist_status(ticker, "filled")
                        db.add_to_trade_journal(fill_data, watchlist_entry)

        for fill in newly_filled:
            ticker = fill["ticker"]
            price = fill["price"]
            from notifier import send_order_filled
            send_order_filled(ticker, price, order_type=f"GTT Fill #{fill['order_id']}")

    except Exception as e:
        log.error(f"Error checking GTT fills: {e}")


def place_gtt_bracket(fyers_client, ticker: str, entry_price: float,
                       stop_price: float, target_price: float,
                       quantity: int = 1) -> dict:
    """
    Place a GTT (Good Till Triggered) bracket order on Fyers.

    A bracket order wraps a primary order with a take-profit (target)
    and stop-loss order, all linked together.

    Fyers API supports bracket orders via the order API.
    This solves the 'miss the entry' problem — place the order in the
    evening, it fills automatically during market hours while you're at work.

    Args:
        fyers_client: FyersModel instance
        ticker: Stock ticker (e.g., 'RELIANCE-EQ')
        entry_price: Price at which to enter (trigger price for GTT)
        stop_price: Stop loss price
        target_price: Take profit price
        quantity: Number of shares

    Returns:
        dict with order details or error
    """
    try:
        base = ticker.replace("-EQ", "")
        symbol = f"NSE:{base}-EQ"

        # GTT Order Payload for Single Leg Entry
        # Note: We place the entry first. Once filled, we would place SL/TP.
        # Fyers GTT v3 'type': 1 is Single, 2 is OCO.
        # We use CNC for delivery as VCP is usually a multi-day swing trade.
        
        gtt_payload = {
            "symbol": symbol,
            "side": 1,  # 1 for Buy
            "productType": "CNC",
            "type": 1,  # 1 for Single leg
            "orderInfo": {
                "leg1": {
                    "price": entry_price,
                    "triggerPrice": entry_price,
                    "qty": quantity
                }
            }
        }

        result = fyers_client.place_gtt_order(gtt_payload)

        if result.get("s") == "ok":
            gtt_id = result.get("data", {}).get("id")
            log.info(f"GTT Single order placed: {ticker} entry={entry_price} id={gtt_id}")
            # We'll store SL and TGT in the watchlist table (already done by the caller usually)
            return {"success": True, "order_id": gtt_id, "ticker": ticker}
        else:
            log.error(f"GTT order failed: {result.get('message', result)}")
            return {"success": False, "error": result.get("message", str(result))}

    except Exception as e:
        log.error(f"Error placing GTT order for {ticker}: {e}")
        return {"success": False, "error": str(e)}


def place_gtt_oco(fyers_client, ticker: str, stop_price: float, target_price: float, quantity: int) -> dict:
    """
    Place a GTT OCO (One-Cancels-Other) order for Stop Loss and Take Profit.
    Usually called after an entry GTT has been filled.
    """
    try:
        base = ticker.replace("-EQ", "")
        symbol = f"NSE:{base}-EQ"

        gtt_payload = {
            "symbol": symbol,
            "side": -1,  # -1 for Sell
            "productType": "CNC",
            "type": 2,  # 2 for OCO
            "orderInfo": {
                "leg1": {
                    "price": target_price,
                    "triggerPrice": target_price,
                    "qty": quantity
                },
                "leg2": {
                    "price": stop_price,
                    "triggerPrice": stop_price,
                    "qty": quantity
                }
            }
        }

        result = fyers_client.place_gtt_order(gtt_payload)
        if result.get("s") == "ok":
            gtt_id = result.get("data", {}).get("id")
            log.info(f"GTT OCO placed: {ticker} SL={stop_price} TGT={target_price} id={gtt_id}")
            return {"success": True, "order_id": gtt_id}
        else:
            log.error(f"GTT OCO failed: {result.get('message', result)}")
            return {"success": False, "error": result.get('message', str(result))}
    except Exception as e:
        log.error(f"Error placing GTT OCO for {ticker}: {e}")
        return {"success": False, "error": str(e)}


def get_gtt_orders(fyers_client) -> dict:
    """Get all active GTT orders."""
    try:
        result = fyers_client.get_order_book()
        if result.get("s") == "ok":
            orders = result.get("data", [])
            active = [o for o in orders if o.get("status") in [1, 2, 5]]
            return {"success": True, "active_orders": active, "total": len(active)}
        return {"success": False, "error": result.get("message", "unknown")}
    except Exception as e:
        log.error(f"Error fetching GTT orders: {e}")
        return {"success": False, "error": str(e)}


def cancel_gtt_order(fyers_client, order_id: str) -> dict:
    """Cancel a GTT order by order ID."""
    try:
        result = fyers_client.cancel_order(data={"id": order_id})
        if result.get("s") == "ok":
            log.info(f"GTT order cancelled: {order_id}")
            return {"success": True, "order_id": order_id}
        return {"success": False, "error": result.get("message", "unknown")}
    except Exception as e:
        log.error(f"Error cancelling GTT order {order_id}: {e}")
        return {"success": False, "error": str(e)}

import sys
import os
# Ensure the backend directory is always on sys.path (needed for uvicorn --reload subprocess)
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Load .env file
from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND_DIR, '.env'))

from config_loader import get_backend_port

import math
import numpy as np
import pandas as pd
import time
import json
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from typing import List
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from data_manager import list_cached_dates, load_scan_cache, _load_tickers
from engine import fetch_data, compute_indicators, DETECTOR, run_alpha_vcp_simulator, compute_universe_rs_rank
from ml_api import router as ml_router
from generate_cache import generate_cache as generate_cache_for_market
from ticker_metadata import get_metadata
from ohlcv_store import bulk_download, _store_status, fetch_local
import yfinance as yf
import intraday_engine
import telegram_alerts

# Pre-load Indian tickers for fast lookup in portfolio scan
INDIAN_TICKERS_BASE = {t.replace(".NS", "") for t in _load_tickers("IN")}

class RefreshRequest(BaseModel):
    market: str | None = None

class RefreshResult(BaseModel):
    market: str
    count: int
    date: str

class OHLCVDownloadRequest(BaseModel):
    market: str
    force: bool = False
    incremental: bool = False

class SendAlertRequest(BaseModel):
    message: str

def sanitize(obj):
    # numpy scalar types → native Python types
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        v = float(obj)
        return 0 if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, np.ndarray):
        return sanitize(obj.tolist())
    # native Python float NaN/Inf
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0
    # recurse into containers
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    return obj

app = FastAPI(title="Pavan Mayya VCP API")

@app.get("/api/test")
def test_endpoint():
    """Test endpoint to verify API is working"""
    return {"status": "ok", "message": "API is working", "ai_chat": "/api/ai/chat"}

@app.get("/")
def read_root():
    """Serve the frontend SPA."""
    static_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(static_path):
        return FileResponse(static_path)
    return {
        "message": "VCP Dashboard API",
        "docs": "/docs",
        "health": "/api/health"
    }

# Mount static frontend files at /static to serve assets
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include ML router
app.include_router(ml_router)

# Intraday scan status tracking
_INTRADAY_SCAN_STATUS = {
    "status": "idle",  # idle, scanning, done
    "progress": 0,
    "current_symbol": "",
    "started_at": None,
    "api_calls_used": 0
}

# APScheduler for auto-refresh
from apscheduler.schedulers.background import BackgroundScheduler
_intraday_scheduler = BackgroundScheduler()

@app.on_event("startup")
async def startup_event():
    """Initialize intraday engine and database on startup."""
    try:
        # Initialize SQLite if configured
        from config_loader import get_config
        db_config = get_config().get('database', {})
        if db_config.get('type') == 'sqlite':
            try:
                import db
                db.init_db_pool()
                db.init_tables()
                from data_manager import migrate_pkl_to_sqlite
                migrate_pkl_to_sqlite()
                print("SQLite database initialized and .pkl cache migrated")
            except Exception as e:
                print(f"Database initialization error: {e}")

        # Initialize intraday engine
        intraday_engine.load_stock_metadata()
        intraday_engine.build_intraday_watchlist()
        print("Intraday engine initialized on startup")
    except Exception as e:
        print(f"Startup error: {e}")

# ============================================================================
# INTRADAY TRADING ENDPOINTS
# ============================================================================

@app.get("/api/intraday/watchlist")
def get_intraday_watchlist():
    """Get current intraday watchlist."""
    watchlist = intraday_engine.INTRADAY_WATCHLIST
    
    # Format response
    formatted = []
    for stock in watchlist:
        meta = intraday_engine.STOCK_METADATA.get(stock.get('ticker', ''), {})
        formatted.append({
            "symbol": stock.get('ticker', ''),
            "score": stock.get('score', 0),
            "sector": meta.get('sector', ''),
            "market_cap": meta.get('market_cap', ''),
            "dist52": stock.get('pct_off_high', 0),
            "tight_rank": stock.get('tight', 0),
            "stage": stock.get('stage', 1)
        })
    
    return {
        "watchlist": formatted,
        "count": len(formatted),
        "generated_at": datetime.now().isoformat()
    }


@app.post("/api/intraday/scan")
def trigger_intraday_scan():
    """Trigger intraday scan on watchlist stocks."""
    global _INTRADAY_SCAN_STATUS
    
    if _INTRADAY_SCAN_STATUS["status"] == "scanning":
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    _INTRADAY_SCAN_STATUS["status"] = "scanning"
    _INTRADAY_SCAN_STATUS["progress"] = 0
    _INTRADAY_SCAN_STATUS["started_at"] = datetime.now().isoformat()
    
    try:
        results = intraday_engine.run_intraday_scan()
        signals_found = len([r for r in results if r.get('entry_signal')])
        
        _INTRADAY_SCAN_STATUS["status"] = "done"
        _INTRADAY_SCAN_STATUS["progress"] = 100
        
        # Save to SQLite
        try:
            from config_loader import get_config
            if get_config().get('database', {}).get('type') == 'sqlite':
                import db
                scan_time = datetime.now().isoformat()
                for r in results:
                    db.execute_update(
                        """INSERT OR REPLACE INTO intraday_signals 
                           (symbol, scan_time, intraday_score, entry_signal, entry_type, signals)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (r.get('symbol'), scan_time, r.get('intraday_score', 0),
                         1 if r.get('entry_signal') else 0, r.get('entry_type'), json.dumps(r))
                    )
        except Exception as db_err:
            print(f"SQLite save error: {db_err}")
        
        # Dispatch Telegram alerts
        try:
            config = get_intraday_config()
            import asyncio
            asyncio.run(telegram_alerts.dispatch_alerts(results, config))
        except Exception as te:
            print(f"Telegram alert dispatch error: {te}")
        
        return {
            "results": results,
            "scan_time": datetime.now().isoformat(),
            "stocks_scanned": len(results),
            "signals_found": signals_found,
            "api_calls_used": intraday_engine.API_CALLS_TODAY
        }
    except Exception as e:
        _INTRADAY_SCAN_STATUS["status"] = "idle"
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/intraday/results")
def get_intraday_results():
    """Get last scan results without triggering new scan."""
    return {
        "results": intraday_engine.LAST_SCAN_RESULT,
        "scan_time": intraday_engine.LAST_SCAN_TIME.isoformat() if intraday_engine.LAST_SCAN_TIME else None
    }


@app.get("/api/intraday/budget")
def get_intraday_budget():
    """Get API budget status."""
    return intraday_engine.get_api_budget_status()


@app.get("/api/intraday/chart/{symbol}/{resolution}")
def get_intraday_chart(symbol: str, resolution: str):
    """Get intraday chart data and signals for a symbol."""
    if resolution not in ["15", "60"]:
        raise HTTPException(status_code=400, detail="Resolution must be 15 or 60")
    
    # Fetch candles if not in cache
    df = intraday_engine.fetch_intraday_candles(symbol, resolution)
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    
    # Get signals if we have both timeframes
    df_15m = intraday_engine.CANDLE_CACHE.get(symbol, {}).get("15", pd.DataFrame())
    df_60m = intraday_engine.CANDLE_CACHE.get(symbol, {}).get("60", pd.DataFrame())
    
    signals = {}
    if not df_15m.empty:
        signals = intraday_engine.compute_intraday_signals(symbol, df_15m, df_60m)
        signals = intraday_engine._convert_numpy(signals)
    
    # Analyze with indicators
    res = DETECTOR.analyse(df, symbol)
    chart_df = res["df"].copy()
    chart_df.columns = [c.lower() for c in chart_df.columns]
    
    # Convert to list of dicts
    candles = []
    for idx, row in chart_df.iterrows():
        candles.append({
            "datetime": idx.isoformat() if hasattr(idx, 'isoformat') else str(idx),
            "open": float(row['open']),
            "high": float(row['high']),
            "low": float(row['low']),
            "close": float(row['close']),
            "volume": int(row['volume']),
            "rolling_score": float(row.get('rolling_score', 0))
        })
    
    return {"candles": candles, "signals": signals}


@app.get("/api/intraday/scan-status")
def get_intraday_scan_status():
    """Get current scan status for progress tracking."""
    return _INTRADAY_SCAN_STATUS


@app.post("/api/intraday/auto-refresh/toggle")
def toggle_intraday_auto_refresh(enabled: bool = False, interval_minutes: int = 15):
    """Toggle auto-refresh for intraday scans."""
    global _intraday_scheduler
    
    config = {
        "auto_refresh_15m": enabled and interval_minutes == 15,
        "auto_refresh_1h": enabled and interval_minutes == 60,
        "interval_minutes": interval_minutes
    }
    
    # Save config
    config_path = os.path.join(os.path.dirname(__file__), "outputs", "intraday_config.json")
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, 'w') as f:
        json.dump(config, f)
    
    if enabled:
        if not _intraday_scheduler.running:
            _intraday_scheduler.start()
        
        # Add job
        _intraday_scheduler.add_job(
            intraday_engine.run_intraday_scan,
            'interval',
            minutes=interval_minutes,
            id='intraday_scan'
        )
        next_run = _intraday_scheduler.get_job('intraday_scan').next_run_time
    else:
        _intraday_scheduler.remove_job('intraday_scan')
        next_run = None
    
    return {
        "auto_refresh": enabled,
        "interval_minutes": interval_minutes,
        "next_run": next_run.isoformat() if next_run else None
    }


@app.get("/api/intraday/config")
def get_intraday_config():
    """Get intraday configuration."""
    config_path = os.path.join(os.path.dirname(__file__), "outputs", "intraday_config.json")
    
    default_config = {
        "auto_refresh_15m": False,
        "auto_refresh_1h": False,
        "min_intraday_score": 60,
        "max_stocks_to_scan": 100,
        "send_telegram": False,
        "telegram_bot_token": "",
        "telegram_chat_id": "",
        "alert_on_strong_only": False
    }
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except:
            pass
    
    return default_config


@app.post("/api/intraday/config")
def save_intraday_config(config: dict):
    """Save intraday configuration."""
    config_path = os.path.join(os.path.dirname(__file__), "outputs", "intraday_config.json")
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    
    # Validate
    if config.get('interval_minutes', 15) not in [15, 60]:
        config['interval_minutes'] = 15
    
    with open(config_path, 'w') as f:
        json.dump(config, f)
    
    return config


@app.post("/api/intraday/build-metadata")
def build_intraday_metadata():
    """Build stock metadata from OHLCV files."""
    try:
        metadata = intraday_engine.build_stock_metadata()
        return {"success": True, "count": len(metadata)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/telegram/test")
def test_telegram():
    """Send test message to Telegram."""
    config = get_intraday_config()
    token = config.get('telegram_bot_token', '')
    chat_id = config.get('telegram_chat_id', '')
    
    if not token or not chat_id:
        raise HTTPException(status_code=400, detail="Telegram not configured")
    
    try:
        import requests
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        data = {
            "chat_id": chat_id, 
            "text": "VCP Dashboard connected! Intraday alerts are active.",
            "parse_mode": "HTML"
        }
        r = requests.post(url, json=data, timeout=15)
        result = r.json()
        
        if r.status_code == 200 and result.get("ok"):
            return {"success": True, "message": f"Connected! Bot: @PMIntraday_bot"}
        else:
            return {"success": False, "message": f"Failed: {result.get('description', r.text)}"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/health")
def health_check():
    return {
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "data_source": "yfinance",
        "features": {"scanner": True, "ml": True, "charts": True, "portfolio": True}
    }

@app.get("/api/status")
def get_status():
    today = datetime.now().strftime("%Y-%m-%d")
    markets = ["IN"]
    result = {}
    for market in markets:
        dates = list_cached_dates(market)
        if not dates:
            result[market] = {"last_date": None, "count": 0, "freshness": "none"}
            continue
        last_date = dates[0]
        data = load_scan_cache(market, last_date)
        count = len(data)
        try:
            delta = (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(last_date, "%Y-%m-%d")).days
        except Exception:
            delta = 999
        if delta == 0:
            freshness = "fresh"
        elif delta == 1:
            freshness = "stale"
        else:
            freshness = "old"
        result[market] = {"last_date": last_date, "count": count, "freshness": freshness, "days_ago": delta}
    return result

@app.get("/api/dates")
def get_dates(market: str = "IN"):
    dates = list_cached_dates(market)
    return {"market": market, "dates": dates}

@app.get("/api/tickers")
def get_tickers(market: str = "IN"):
    """Get all available tickers for a market."""
    tickers = _load_tickers(market)
    return {"market": market, "tickers": tickers}

@app.get("/api/scan")
def get_scan(market: str, date: str = ""):
    try:
        if not date:
            dates = list_cached_dates(market)
            if not dates:
                raise HTTPException(status_code=404, detail=f"No scan data found for {market}. Please run data refresh.")
            date = dates[0]

        results = load_scan_cache(market, date)
        if not results:
            raise HTTPException(status_code=404, detail=f"No scan data found for {market} on {date}. Please run data refresh.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading scan data: {str(e)}")

    # Backward compatibility normalization for older cache files
    normalized = []
    for r in results:
        if not isinstance(r, dict):
            continue

        scores = r.get("scores") or {}

        # Ensure always-present display fields
        r.setdefault("sector", "n/a")
        r.setdefault("cap", "n/a")
        r.setdefault("is_synthetic", False)

        # Older cache files may only contain these under `scores`
        if "tight" not in r:
            r["tight"] = scores.get("tightness", 0)
        if "wbase" not in r:
            r["wbase"] = scores.get("wbase", 0)

        # 6M return field support (new field). For legacy rows, fall back to 3M value.
        if "r126" not in r:
            r["r126"] = r.get("r63", 0)

        if not r.get("sector") or r["sector"] in {"n/a", "Unknown"} or not r.get("cap") or r["cap"] in {"n/a", "Unknown"}:
            metadata = get_metadata(r.get("ticker", ""), market)
            r["sector"] = metadata.get("sector", "Unknown")
            r["cap"] = metadata.get("cap", "Unknown")

        normalized.append(r)

    results = normalized
    results = sanitize(results)
    return {"market": market, "date": date, "count": len(results), "results": results}

@app.get("/api/chart")
def get_chart_data(ticker: str, timeframe: str = "D"):
    # Determine market
    market = "IN"
    df = None
    
    # For intraday timeframes, try to fetch from intraday data
    if timeframe != "D" and timeframe != "W" and timeframe != "M":
        try:
            # Try to get intraday data - keep -EQ suffix as that's how files are named
            intraday_path = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", "IN", "intraday", timeframe, f"{ticker}.parquet")
            if os.path.exists(intraday_path):
                df = pd.read_parquet(intraday_path)
                if df is not None and not df.empty:
                    print(f"[Chart] Using intraday {timeframe} data for {ticker}")
        except Exception as e:
            print(f"[Chart] Failed to load intraday data: {e}")
    
    # Base fetch (daily) if no intraday data
    if df is None or df.empty:
        df = fetch_data(ticker, market=market)
    
    # If Indian market, try to patch with live LTP from yfinance
    if market == "IN":
        try:
            base = ticker.replace("-EQ", "").replace(".NS", "")
            yf_ticker = yf.Ticker(f"{base}.NS")
            live = yf_ticker.fast_info
            lp = live.get('last_price') or live.get('previous_close')
            if lp and lp > 0:
                today = pd.Timestamp.now().normalize()
                if df.index.max() < today:
                    new_row = pd.DataFrame({
                        "Open": [float(lp)],
                        "High": [float(lp)],
                        "Low": [float(lp)],
                        "Close": [float(lp)],
                        "Volume": [0]
                    }, index=[today])
                    df = pd.concat([df, new_row])
                    df = df[~df.index.duplicated(keep='last')]
                    df = df.sort_index()
        except Exception:
            pass

    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="Ticker data not found locally.")
    
    res = DETECTOR.analyse(df, ticker)
    
    chart_df = res["df"].copy()
    chart_df.index.name = 'time'
    chart_df = chart_df.reset_index()
    
    # Ensure time column is datetime-like
    chart_df['time'] = pd.to_datetime(chart_df['time'])
    
    # For intraday data, include time; for daily, just date
    if timeframe != "D" and timeframe != "W" and timeframe != "M":
        # Intraday - include time in ISO format for lightweight-charts
        chart_df['time'] = chart_df['time'].dt.strftime('%Y-%m-%dT%H:%M:%S')
    else:
        # Daily - just date
        chart_df['time'] = chart_df['time'].dt.strftime('%Y-%m-%d')
    
    chart_df.columns = [c.lower() for c in chart_df.columns]
    chart_df = chart_df.replace([np.inf, -np.inf], np.nan).fillna(value=0)
    
    res_dict = sanitize({
        "ticker": res["ticker"],
        "score": res["score"],
        "scores": res["scores"],
        "checklist_str": res["checklist_str"],
        "stage": res["stage"],
        "contractions": res["contractions"],
        "signals": res["signals"],
        "signals_history": res.get("signals_history", {}),
        "trendlines": res.get("trendlines", {}),
        "data": chart_df.to_dict(orient="records"),
        "spark": res.get("spark"),
        "trend": res.get("trend"),
        "bbw_pctl": res.get("bbw_pctl"),
        "squeeze": res.get("squeeze"),
        "tight": res.get("tight"),
        "vdry": res.get("vdry"),
        "hndl": res.get("hndl"),
        "adx": res.get("adx"),
        "tier_enc": res.get("tier_enc"),
        "pdh_brk": res.get("pdh_brk"),
        "last_price": res.get("last_price"),
        "rsi": res.get("rsi"),
        "rs": res.get("rs"),
        "vol_ratio": res.get("vol_ratio"),
        "atr_pct": res.get("atr_pct"),
        "r1": res.get("r1"),
        "r5": res.get("r5"),
        "r21": res.get("r21"),
        "r63": res.get("r63"),
        "pct_off_high": res.get("pct_off_high"),
    })
    return res_dict

@app.post("/api/refresh")
async def refresh_data(req: RefreshRequest):
    markets = [req.market] if req.market else ["IN"]
    results = []
    for market in markets:
        # Step 1: Update last 5 trading days of OHLCV data from yfinance
        ohlcv_summary = {}
        try:
            from ohlcv_store import refresh_recent
            tickers = _load_tickers(market)
            print(f"[Refresh] Updating last 5 days OHLCV for {len(tickers)} tickers in {market}...")
            ohlcv_summary = await run_in_threadpool(refresh_recent, market, tickers, 10)
            print(f"[Refresh] OHLCV update done: {ohlcv_summary.get('done',0)} updated, {ohlcv_summary.get('failed',0)} failed")
        except Exception as e:
            print(f"[Refresh] OHLCV update error: {e}")
            ohlcv_summary = {"error": str(e)}

        # Step 2: Re-generate scan cache with the fresh OHLCV data
        count, date_str = await run_in_threadpool(generate_cache_for_market, market)
        results.append({
            "market": market,
            "count": count,
            "date": date_str,
            "ohlcv_updated": ohlcv_summary.get("done", 0),
            "ohlcv_failed": ohlcv_summary.get("failed", 0),
        })
    return {"results": results}

@app.get("/api/ohlcv/status")
def ohlcv_status():
    result = {}
    for market in ["IN", "US"]:
        tickers = _load_tickers(market)
        result[market] = _store_status(market, tickers)
    return result

@app.post("/api/ohlcv/download")
async def ohlcv_download(req: OHLCVDownloadRequest):
    tickers = _load_tickers(req.market)
    summary = await run_in_threadpool(
        bulk_download,
        req.market,
        tickers,
        6,           # workers
        req.force,
        req.incremental,
    )
    return summary

@app.get("/api/broker/status")
def broker_status():
    return {"data_source": "yfinance", "status": "active"}

@app.get("/api/broker/fyers/auth_url")
def fyers_auth_url():
    client_id = os.getenv("FYERS_APP_ID")
    redirect_uri = "https://www.google.com"  # Using user's current working redirect
    url = f"https://api-t1.fyers.in/api/v3/generate-authcode?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&state=None"
    return {"url": url}

class FyersLoginRequest(BaseModel):
    url: str

@app.post("/api/broker/fyers/login")
async def fyers_login(req: FyersLoginRequest):
    try:
        from fyers_apiv3 import fyersModel
        import urllib.parse as urlparse
        
        # Check if it's a URL or just a raw code
        if "auth_code=" in req.url:
            parsed = urlparse.urlparse(req.url)
            params = urlparse.parse_qs(parsed.query)
            auth_code = params.get("auth_code")
            if not auth_code:
                raise HTTPException(status_code=400, detail="Invalid URL: auth_code not found")
            auth_code = auth_code[0]
        else:
            # Assume it's the raw code
            auth_code = req.url.strip()
            
        if not auth_code:
            raise HTTPException(status_code=400, detail="Empty auth code provided")
        
        client_id_full = os.getenv("FYERS_APP_ID")
        client_id_base = client_id_full.split("-")[0] if client_id_full else ""
        secret_key = os.getenv("FYERS_SECRET_KEY")
        redirect_uri = os.getenv("FYERS_REDIRECT_URL", "https://www.google.com")
        
        # Try with full ID first
        def attempt_login(cid):
            s = fyersModel.SessionModel(
                client_id=cid,
                secret_key=secret_key,
                redirect_uri=redirect_uri,
                response_type="code",
                grant_type="authorization_code"
            )
            s.set_token(auth_code)
            return s.generate_token()

        response = attempt_login(client_id_full)
        if response.get("s") != "ok" and "hash" in str(response.get("message", "")).lower():
            print(f"DEBUG: Retrying with base client_id: {client_id_base}")
            response = attempt_login(client_id_base)
        
        print(f"DEBUG: Final Fyers response: {response}")
        
        if response.get("s") == "ok":
            token = response.get("access_token")
            token_file = os.getenv("FYERS_TOKEN_FILE", "fyers_token.txt")
            with open(token_file, "w") as f:
                f.write(token)
            return {"message": "yfinance migration complete - Fyers token storage no longer needed"}
        else:
            raise HTTPException(status_code=400, detail=f"Fyers error: {response.get('message')}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class HoldingScanRequest(BaseModel):
    ticker: str
    quantity: float = 0
    avg_cost: float = 0

class PortfolioScanRequest(BaseModel):
    holdings: List[HoldingScanRequest]

@app.post("/api/portfolio/scan")
async def scan_portfolio(req: PortfolioScanRequest):
    results = []
    
    # Fetch NIFTY benchmark data for RS calculation
    benchmark_df = None
    try:
        benchmark_df = fetch_data("NIFTY50-EQ", market="IN")
        if benchmark_df is None or benchmark_df.empty:
            benchmark_df = fetch_data("NIFTY-EQ", market="IN")
    except Exception:
        pass
    
    def process_holding(h: HoldingScanRequest):
        try:
            ticker = h.ticker.upper().strip()
            # If it's a base symbol found in Indian market, add -EQ
            if not ticker.endswith("-EQ") and not ticker.endswith(".BO") and not any(c.islower() for c in ticker):
                 if ticker in INDIAN_TICKERS_BASE:
                     ticker = ticker + "-EQ"

            market = "IN"
            df = fetch_data(ticker, market)
            if df is not None and not df.empty:
                res = DETECTOR.analyse(df, ticker, benchmark_df=benchmark_df)
                # Attach the user's data
                res["quantity"] = h.quantity
                res["avg_cost"] = h.avg_cost
                res["ltp"] = res.get("last_price", 0)
                res["open_pnl"] = (res["ltp"] - h.avg_cost) * h.quantity if h.avg_cost > 0 else 0
                return res
        except:
            pass
        return None

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(process_holding, h): h for h in req.holdings}
        for future in as_completed(futures):
            res = future.result()
            if res:
                if "df" in res: del res["df"]
                results.append(res)
    
    return {"holdings": sanitize(results)}

@app.get("/api/portfolio/local")
async def get_local_portfolio():
    from config_loader import get_config
    cfg = get_config()
    path = cfg.get("features", {}).get("local_holdings_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Local holdings file not found or path not configured. Path: {path}")
    
    try:
        import pandas as pd
        if path.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(path)
        else:
            df = pd.read_csv(path)
            
        # Normalize columns
        df.columns = [str(c).lower().strip() for c in df.columns]
        
        holdings = []
        for _, row in df.iterrows():
            # Support various Zerodha/Broker column names
            ticker = row.get("instrument") or row.get("ticker") or row.get("symbol") or row.get("tradingsymbol")
            qty = row.get("quantity") or row.get("qty") or row.get("qty.") or row.get("available qty.") or row.get("net qty.")
            price = row.get("avg_cost") or row.get("average_price") or row.get("avg. cost") or row.get("avg. price") or row.get("buy price")
            
            if ticker and not pd.isna(ticker):
                try:
                    holdings.append({
                        "ticker": str(ticker).strip(),
                        "quantity": float(str(qty).replace(",", "")) if qty and not pd.isna(qty) else 0,
                        "avg_cost": float(str(price).replace(",", "")) if price and not pd.isna(price) else 0
                    })
                except: continue
        
        if not holdings:
            return {"holdings": [], "message": "No valid holdings found in file."}

        req = PortfolioScanRequest(holdings=holdings)
        return await scan_portfolio(req)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading local holdings: {str(e)}")

@app.post("/api/alerts/send")
async def send_telegram_alert(req: SendAlertRequest):
    import requests
    
    token_str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id_str = os.getenv("TELEGRAM_CHAT_ID", "")
    
    if not token_str or not chat_id_str:
        raise HTTPException(status_code=400, detail="Telegram credentials missing in environment (.env)")
        
    tokens = [t.strip() for t in token_str.split(",") if t.strip()]
    chats = [c.strip() for c in chat_id_str.split(",") if c.strip()]
    
    errors = []
    successes = 0
    for i, token in enumerate(tokens):
        chat_id = chats[i] if i < len(chats) else chats[0]
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {"chat_id": chat_id, "text": req.message, "parse_mode": "HTML"}
        try:
            r = requests.post(url, data=payload, timeout=10)
            if r.status_code == 200:
                successes += 1
            else:
                errors.append(f"Chat {chat_id}: {r.text}")
        except Exception as e:
            errors.append(f"Chat {chat_id}: {str(e)}")
            
    if errors:
        return {"status": "partial_success", "message": "Some alerts failed", "errors": errors, "successes": successes}
        
    return {"status": "success", "message": f"Successfully sent to {successes} chats"}

@app.get("/api/simulate")
def simulate(market: str = "IN", min_score: float = 60.0):
    res = run_alpha_vcp_simulator(market, min_score)
    return sanitize(res)

@app.get("/api/scan/live")
async def get_live_scan(market: str = "IN"):
    if market != "IN":
        raise HTTPException(status_code=400, detail="Live scan currently only supported for India (yfinance)")
    
    tickers = _load_tickers("IN")
    
    # 1. Fetch live quotes for all IN tickers using yfinance with .NS suffix
    base_tickers = tickers  # Already in .NS format from _load_tickers
    
    def fetch_live_quotes_yf(ticker_list):
        quotes = {}
        for t in ticker_list:
            try:
                ticker_obj = yf.Ticker(t)
                info = ticker_obj.fast_info
                lp = info.get('last_price') or info.get('previous_close')
                if lp and lp > 0:
                    quotes[t] = {"lp": lp}
            except Exception:
                pass
        return quotes
    
    quotes = await run_in_threadpool(fetch_live_quotes_yf, base_tickers)
    
    if not quotes:
        raise HTTPException(status_code=500, detail="Failed to fetch live quotes from yfinance.")

    # 2. Fetch NIFTY benchmark data for RS calculation
    benchmark_df = None
    try:
        benchmark_df = fetch_data("^NSEI", market=market)
        if benchmark_df is None or benchmark_df.empty:
            benchmark_df = fetch_data("NIFTY50.NS", market=market)
    except Exception:
        pass

    # 3. Run analysis with live quotes
    results = []
    
    def process_live(ticker):
        try:
            base = ticker.replace(".NS", "")
            yf_ticker = f"{base}.NS"
            quote = quotes.get(yf_ticker)
            
            # Use local data and patch with live quote
            df = fetch_data(ticker, market=market)
            if df is not None and len(df) >= 60 and quote:
                lp = quote.get("lp", 0)
                if lp > 0:
                    today = pd.Timestamp.now().normalize()
                    if df.index.max() < today:
                        new_row = pd.DataFrame({
                            "Open": [float(lp)],
                            "High": [float(lp)],
                            "Low": [float(lp)],
                            "Close": [float(lp)],
                            "Volume": [0]
                        }, index=[today])
                        df = pd.concat([df, new_row])
                        df = df[~df.index.duplicated(keep='last')]
                        df = df.sort_index()
                res = DETECTOR.analyse(df, ticker=ticker, benchmark_df=benchmark_df)
                if "df" in res:
                    del res["df"]
                return res
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error processing live {ticker}: {e}")
        return None

    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(process_live, t): t for t in tickers}
        for future in as_completed(futures):
            try:
                res = future.result()
                if res:
                    results.append(res)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Thread error in live scan: {e}")

    results = compute_universe_rs_rank(results)

    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return {
        "market": market, 
        "date": date_str, 
        "live": True, 
        "count": len(results), 
        "total_attempted": len(tickers),
        "quotes_received": len(quotes),
        "results": sanitize(results)
    }

# ─── Position Management Endpoints ───────────────────────────────────────────
POSITIONS_FILE = os.path.join(os.path.dirname(__file__), "outputs", "positions.json")

class Position(BaseModel):
    id: str = ""
    ticker: str
    entry_price: float
    stop_loss: float
    target: float
    quantity: int
    entry_date: str = ""
    status: str = "active"  # active, closed, sl_hit, target_hit
    notes: str = ""

def _load_positions():
    if not os.path.exists(POSITIONS_FILE):
        return []
    try:
        with open(POSITIONS_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def _save_positions(positions):
    os.makedirs(os.path.dirname(POSITIONS_FILE), exist_ok=True)
    with open(POSITIONS_FILE, "w") as f:
        json.dump(positions, f, indent=2)

@app.get("/api/positions")
def get_positions():
    return {"positions": _load_positions()}

@app.post("/api/positions")
def add_position(position: Position):
    positions = _load_positions()
    position.id = position.id or str(uuid.uuid4())
    position.entry_date = position.entry_date or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    positions.append(position.dict())
    _save_positions(positions)
    return {"position": position.dict(), "message": "Position added successfully"}

@app.put("/api/positions/{position_id}")
def update_position(position_id: str, position: Position):
    positions = _load_positions()
    for i, pos in enumerate(positions):
        if pos["id"] == position_id:
            position.id = position_id
            positions[i] = position.dict()
            _save_positions(positions)
            return {"position": position.dict(), "message": "Position updated successfully"}
    raise HTTPException(status_code=404, detail="Position not found")

@app.delete("/api/positions/{position_id}")
def delete_position(position_id: str):
    positions = _load_positions()
    positions = [p for p in positions if p["id"] != position_id]
    _save_positions(positions)
    return {"message": "Position deleted successfully"}

@app.get("/api/positions/{position_id}/chart")
def get_position_chart(position_id: str, interval: str = "1h"):
    positions = _load_positions()
    position = next((p for p in positions if p["id"] == position_id), None)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    ticker = position["ticker"]
    market = "IN"
    
    # Fetch data with appropriate interval
    df = fetch_data(ticker, market=market)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="Data not found")
    
    # For 1HR interval, try to fetch from yfinance
    if interval == "1h":
        try:
            base = ticker.replace("-EQ", "").replace(".NS", "")
            yf_ticker = yf.Ticker(f"{base}.NS")
            df_1h = yf_ticker.history(period="5d", interval="1h")
            if df_1h is not None and not df_1h.empty:
                df = df_1h.rename(columns={'Open': 'Open', 'High': 'High', 'Low': 'Low', 'Close': 'Close', 'Volume': 'Volume'})
        except Exception as e:
            # Fallback to daily data
            pass
    
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="Data not found for interval")
    
    # Analyze with indicators
    res = DETECTOR.analyse(df, ticker)
    chart_df = res["df"].copy()
    chart_df.index.name = 'time'
    chart_df = chart_df.reset_index()
    chart_df['time'] = chart_df['time'].dt.strftime('%Y-%m-%d %H:%M:%S') if interval == "1h" else chart_df['time'].dt.strftime('%Y-%m-%d')
    chart_df.columns = [c.lower() for c in chart_df.columns]
    chart_df = chart_df.replace([np.inf, -np.inf], np.nan).fillna(value=0)
    
    return {
        "position": position,
        "data": chart_df.to_dict(orient="records"),
        "indicators": {
            "entry_price": position["entry_price"],
            "stop_loss": position["stop_loss"],
            "target": position["target"]
        }
    }


# ─── Watchlist Endpoints ────────────────────────────────────────────────────────

@app.get("/api/watchlist")
def get_watchlist():
    """Get all active watchlist entries."""
    from db import get_active_watchlist
    return get_active_watchlist()


@app.post("/api/watchlist/add")
def add_to_watchlist(request: dict):
    """Manually add a ticker to watchlist."""
    from db import insert_watchlist, get_watchlist_by_ticker
    ticker = request.get("ticker")
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker is required")
    existing = get_watchlist_by_ticker(ticker)
    if existing:
        return {"success": False, "message": f"{ticker} already in watchlist"}
    result = insert_watchlist({
        "ticker": ticker,
        "pivot_price": request.get("pivot_price", 0),
        "stop_price": request.get("stop_price", 0),
        "target_price": request.get("target_price", 0),
        "score": request.get("score", 0),
        "ml_prob": request.get("ml_prob"),
        "rs_rank": request.get("rs_rank"),
        "signals_fired": request.get("signals_fired", {}),
    })
    return {"success": True, "data": result}


@app.put("/api/watchlist/status")
def update_watchlist_status_endpoint(ticker: str, status: str):
    """Update status of a watchlist entry."""
    from db import update_watchlist_status
    if status not in ("active", "triggered", "expired", "stopped"):
        raise HTTPException(status_code=400, detail="Invalid status")
    count = update_watchlist_status(ticker, status)
    return {"success": count > 0, "updated": count}


@app.delete("/api/watchlist/{ticker}")
def delete_watchlist_endpoint(ticker: str):
    """Delete a watchlist entry."""
    from db import delete_watchlist
    count = delete_watchlist(ticker)
    return {"success": count > 0, "deleted": count}


@app.get("/api/alerts/history")
def get_alert_history_endpoint(limit: int = 50):
    """Get alert history. Returns last `limit` alerts."""
    from db import get_alert_history
    return get_alert_history(limit=limit)


@app.post("/api/watchlist/expire")
def expire_watchlist_endpoint():
    """Manually expire old watchlist entries."""
    from db import expire_old_watchlist
    count = expire_old_watchlist()
    return {"success": True, "expired": count}


@app.post("/api/journal/trade")
def add_journal_trade(request: dict):
    """Add a trade to the journal."""
    from db import insert_journal_trade
    required = ["ticker", "entry_date", "entry_price"]
    for field in required:
        if not request.get(field):
            raise HTTPException(status_code=400, detail=f"{field} is required")
    result = insert_journal_trade(request)
    return {"success": True, "data": result}


@app.get("/api/journal/trades")
def get_journal_trades(limit: int = 100, status: str = None):
    """Get trades from journal. Filter by status: open/closed/all."""
    from db import get_all_trades, get_open_trades
    if status == "open":
        trades = get_open_trades()
    else:
        trades = get_all_trades(limit)
    if status and status != "open" and status != "all":
        trades = [t for t in trades if t.get("status") == status]
    return {"trades": sanitize(trades), "count": len(trades)}


@app.post("/api/journal/close")
def close_journal_trade(request: dict):
    """Close an open trade with exit details."""
    from db import close_trade
    required = ["ticker", "exit_price", "exit_date"]
    for field in required:
        if not request.get(field):
            raise HTTPException(status_code=400, detail=f"{field} is required")
    pnl_pct = 0.0
    if request.get("entry_price"):
        pnl_pct = (request["exit_price"] - request["entry_price"]) / request["entry_price"] * 100
    pnl_realized = pnl_pct * request.get("quantity", 0) * request.get("entry_price", 0) / 100
    count = close_trade(
        ticker=request["ticker"],
        exit_price=request["exit_price"],
        exit_date=request["exit_date"],
        pnl_realized=pnl_realized,
        pnl_pct=pnl_pct,
        notes=request.get("notes", ""),
    )
    return {"success": count > 0, "closed": count}


@app.post("/api/journal/stop")
def stop_journal_trade(request: dict):
    """Mark a trade as stopped (hit stop loss)."""
    from db import update_trade_status
    ticker = request.get("ticker")
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker is required")
    count = update_trade_status(ticker, "stopped")
    return {"success": count > 0, "stopped": count}


@app.get("/api/journal/stats")
def get_journal_stats():
    """Get aggregate trade statistics."""
    from db import get_trade_stats
    stats = get_trade_stats()
    return {"stats": stats}


@app.get("/api/outcomes")
def get_outcomes(days: int = 365):
    """Get trade outcomes for ML retraining."""
    from db import get_outcomes_for_retrain
    outcomes = get_outcomes_for_retrain(days)
    return {"outcomes": sanitize(outcomes), "count": len(outcomes)}


@app.get("/api/gtt/orders")
def get_gtt_orders_endpoint():
    """Get all active GTT bracket orders - Not available with yfinance."""
    raise HTTPException(status_code=501, detail="GTT orders require Fyers API. Data source changed to yfinance.")


@app.post("/api/gtt/cancel/{order_id}")
def cancel_gtt_order_endpoint(order_id: str):
    """Cancel a GTT bracket order - Not available with yfinance."""
    raise HTTPException(status_code=501, detail="GTT orders require Fyers API. Data source changed to yfinance.")


@app.post("/api/gtt/place")
def place_gtt_order_endpoint(request: dict):
    """Manually place a GTT bracket order - Not available with yfinance."""
    raise HTTPException(status_code=501, detail="GTT orders require Fyers API. Data source changed to yfinance.")


if __name__ == "__main__":
    import uvicorn
    port = get_backend_port()
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)


# MiniMax API Integration
MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")

# NVIDIA API Integration (supports Llama, Mistral, etc.)
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# Google Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def get_nvidia_client(api_key: str):
    """Get NVIDIA API client using OpenAI SDK"""
    try:
        from openai import OpenAI
        return OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key
        )
    except ImportError:
        return None


def chat_with_nvidia(api_key: str, messages: list, model: str = "nvidia/llama-3.1-nemotron-70b-instruct") -> str:
    """Chat completion via NVIDIA NIM endpoints"""
    client = get_nvidia_client(api_key)
    if not client:
        raise Exception("OpenAI SDK not installed. Run: pip install openai")

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=1024
    )
    return response.choices[0].message.content


class MiniMaxClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.minimax.chat/v1"
    
    def chat_completion(self, messages: list, model: str = "MiniMax-Text-01") -> str:
        import requests
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.7
        }
        response = requests.post(
            f"{self.base_url}/text/chatcompletion_v2",
            headers=headers,
            json=payload,
            timeout=30
        )
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            raise Exception(f"MiniMax API error: {response.text}")


def chat_with_gemini(api_key: str, messages: list, model: str = "gemini-2.0-flash") -> str:
    """Chat completion via Google Gemini API"""
    import requests

    contents = []
    for msg in messages:
        if msg.get("role") == "system":
            continue
        contents.append({
            "role": "model" if msg.get("role") == "assistant" else "user",
            "parts": [{"text": msg.get("content", "")}]
        })

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {"contents": contents, "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024}}
    params = {"key": api_key}

    response = requests.post(url, json=payload, params=params, timeout=30)
    if response.status_code == 200:
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]
    else:
        raise Exception(f"Gemini API error: {response.text}")


@app.post("/api/ai/analyze-position")
async def analyze_position_with_ai(request: dict):
    """Analyze a position using NVIDIA (default) or MiniMax AI"""
    provider = request.get("provider", "nvidia")
    api_key = request.get("api_key") or NVIDIA_API_KEY or MINIMAX_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="API key required. Set NVIDIA_API_KEY or MINIMAX_API_KEY in .env")

    ticker = request.get("ticker", "")
    entry = request.get("entry_price", 0)
    sl = request.get("stop_loss", 0)
    target = request.get("target", 0)
    quantity = request.get("quantity", 0)
    chart_data = request.get("chart_data", [])

    prompt = f"""Analyze this trading position for NSE stock:

Ticker: {ticker}
Entry Price: Rs {entry}
Stop Loss: Rs {sl}
Target: Rs {target}
Quantity: {quantity}

Risk/Reward: 1:{((target - entry) / (entry - sl)) if (entry - sl) > 0 else 0:.2f}
Total Investment: Rs {entry * quantity}
Max Loss: Rs {(entry - sl) * quantity}
Max Profit: Rs {(target - entry) * quantity}

Recent Price Data (last 10 days):
{chr(10).join([f"Day {i+1}: O:{d.get('open', d.get('c', entry)):.2f} H:{d.get('high', d.get('c', entry)*1.01):.2f} L:{d.get('low', d.get('c', entry)*0.99):.2f} C:{d.get('close', d.get('c', entry)):.2f}" for i, d in enumerate(chart_data[-10:])])}

Please provide:
1. Brief market analysis for this stock
2. Technical outlook based on the price data
3. Risk assessment
4. Recommendation (Buy/Hold/Sell)
5. Any additional notes for trade management

Keep response concise and actionable. Use INR for currency."""

    messages = [
        {"role": "system", "content": "You are an expert stock market analyst with deep knowledge of technical analysis, fundamental analysis, and risk management. Provide clear, actionable insights."},
        {"role": "user", "content": prompt}
    ]

    try:
        if provider == "nvidia":
            result = chat_with_nvidia(api_key, messages)
        else:
            client = MiniMaxClient(api_key)
            result = client.chat_completion(messages)
        return {"analysis": result, "ticker": ticker, "provider": provider}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/analyze-stock")
async def analyze_stock_with_ai(request: dict):
    """Analyze a stock using NVIDIA (default) or MiniMax AI"""
    provider = request.get("provider", "nvidia")
    api_key = request.get("api_key") or NVIDIA_API_KEY or MINIMAX_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="API key required. Set NVIDIA_API_KEY or MINIMAX_API_KEY in .env")

    ticker = request.get("ticker", "")
    chart_data = request.get("chart_data", [])

    prompt = f"""Perform technical analysis on this NSE stock:

Ticker: {ticker}

Recent Price Data:
{chr(10).join([f"{d.get('time', 'N/A')}: O:{d.get('open', d.get('c', 0)):.2f} H:{d.get('high', d.get('c', 0)*1.01):.2f} L:{d.get('low', d.get('c', 0)*0.99):.2f} C:{d.get('close', d.get('c', 0)):.2f} V:{d.get('volume', 0)}" for d in chart_data[-15:]])}

Provide:
1. Trend analysis (bullish/bearish/sideways)
2. Key support and resistance levels
3. Technical indicators outlook (if data available)
4. Volume analysis
5. Entry/exit recommendations
6. Risk assessment

Be concise and practical. Use INR."""

    messages = [
        {"role": "system", "content": "You are an expert stock market analyst with deep knowledge of technical analysis."},
        {"role": "user", "content": prompt}
    ]

    try:
        if provider == "nvidia":
            result = chat_with_nvidia(api_key, messages)
        else:
            client = MiniMaxClient(api_key)
            result = client.chat_completion(messages)
        return {"analysis": result, "ticker": ticker, "provider": provider}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/chat")
async def ai_chat(request: dict):
    """General AI chat endpoint for asking market questions"""
    print(f"AI chat endpoint called with request: {request}")
    provider = request.get("provider", "gemini")
    api_key = request.get("api_key") or GEMINI_API_KEY or NVIDIA_API_KEY or MINIMAX_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="API key required. Set GEMINI_API_KEY, NVIDIA_API_KEY, or MINIMAX_API_KEY in .env")

    question = request.get("question", "")
    context = request.get("context", "")

    system_prompt = """You are an expert stock market analyst and trading assistant specializing in:
- VCP (Volatility Contraction Pattern) trading
- Indian NSE market
- Technical analysis (RSI, ADX, MACD, Bollinger Bands)
- Risk management and position sizing
- FOREX trading
- US S&P 500 stocks

Provide clear, actionable insights. Keep responses concise. Use INR for Indian stocks, USD for US stocks."""

    prompt = question
    if context:
        prompt = f"Context: {context}\n\nQuestion: {question}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt}
    ]

    try:
        if provider == "nvidia":
            result = chat_with_nvidia(api_key, messages)
        elif provider == "gemini":
            result = chat_with_gemini(api_key, messages)
        else:
            client = MiniMaxClient(api_key)
            result = client.chat_completion(messages)
        return {"response": result, "provider": provider}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Cache for breadth data
_BREADTH_CACHE = None
_BREADTH_CACHE_DATE = None

@app.get("/api/breadth-history")
def get_breadth_history(market: str = "IN", days: int = 500):
    """Calculate % of stocks above their 20 DMA for each day - real market breadth data."""
    global _BREADTH_CACHE, _BREADTH_CACHE_DATE
    import glob
    from datetime import datetime
    
    # Return cached data if less than 1 hour old
    if _BREADTH_CACHE is not None and _BREADTH_CACHE_DATE is not None:
        cache_age = (datetime.now() - _BREADTH_CACHE_DATE).total_seconds()
        if cache_age < 3600:
            return {"success": True, "data": _BREADTH_CACHE[:days], "total_days": len(_BREADTH_CACHE), "cached": True}
    
    ohlcv_dir = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", market)
    if not os.path.exists(ohlcv_dir):
        return {"success": False, "error": "No OHLCV data found"}
    
    # Get all parquet files - limit to 200 for speed
    parquet_files = glob.glob(os.path.join(ohlcv_dir, "*.parquet"))[:200]
    if not parquet_files:
        return {"success": False, "error": "No parquet files found"}
    
    # Load all stock data
    all_data = {}
    for f in parquet_files:
        try:
            ticker = os.path.basename(f).replace(".parquet", "")
            df = pd.read_parquet(f)
            df.index = pd.to_datetime(df.index).date
            if len(df) >= 25:
                all_data[ticker] = df
        except:
            continue
    
    if not all_data:
        return {"success": False, "error": "No valid data"}
    
    # Find common date range
    all_dates = set()
    for df in all_data.values():
        all_dates.update(df.index)
    all_dates = sorted(all_dates, reverse=True)[:min(days, 500)]
    
    if len(all_dates) < 30:
        return {"success": False, "error": f"Not enough historical data: only {len(all_dates)} days"}
    
    # Calculate % above 20 DMA for each date
    results = []
    for date in all_dates:
        above_20dma = 0
        total = 0
        for ticker, df in all_data.items():
            try:
                if date in df.index:
                    idx = list(df.index).index(date)
                    if idx >= 20:
                        prices = df['Close'].iloc[:idx+1]
                        sma20 = prices.rolling(20).mean().iloc[-1]
                        if prices.iloc[-1] > sma20:
                            above_20dma += 1
                        total += 1
            except:
                continue
        
        if total > 0:
            pct = (above_20dma / total) * 100
            results.append({
                "date": str(date),
                "pct_above_20dma": round(pct, 1),
                "stocks_above": above_20dma,
                "total_stocks": total
            })
    
    results.reverse()
    _BREADTH_CACHE = results
    _BREADTH_CACHE_DATE = datetime.now()
    return {"success": True, "data": results, "total_days": len(results)}


@app.get("/api/backtest")
def run_backtest(ticker: str, period: str = "1y", threshold: int = 60):
    """Run historical backtest for a ticker using REAL VCP strategy."""
    from engine import compute_indicators, DETECTOR
    
    # Map period to days
    period_days = {"2y": 730, "1y": 365, "6mo": 180}
    days = period_days.get(period, 365)
    
    # Load ticker data
    ohlcv_dir = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", "IN")
    ticker_file = os.path.join(ohlcv_dir, f"{ticker}.parquet")
    
    if not os.path.exists(ticker_file):
        return {"success": False, "error": f"No data for {ticker}"}
    
    try:
        df = pd.read_parquet(ticker_file)
        df = df.sort_index()
        
        if len(df) < 100:
            return {"success": False, "error": "Insufficient data for VCP backtest"}
        
        # Use REAL engine to compute indicators and detect VCP
        df = compute_indicators(df)
        
        # Get VCP scores for each day using the real detector
        df['vcp_score'] = 0.0
        for i in range(50, len(df)):
            try:
                window_df = df.iloc[:i+1].copy()
                result = DETECTOR.detect(window_df)
                df.iloc[i, df.columns.get_loc('vcp_score')] = result.get('score', 0) or 0
            except:
                df.iloc[i, df.columns.get_loc('vcp_score')] = 0
        
        # VCP Entry Signal: Score >= threshold AND in uptrend
        df['sma20'] = df['Close'].rolling(20).mean()
        df['sma50'] = df['Close'].rolling(50).mean()
        df['uptrend'] = (df['Close'] > df['sma20']) & (df['Close'] > df['sma50'])
        
        # Entry: VCP score >= threshold AND uptrend
        df['signal'] = ((df['vcp_score'] >= threshold) & df['uptrend']).astype(int)
        
        # Backtest with 5-day hold
        trades = []
        position = None
        cumulative_pnl = []
        total_pnl = 0
        wins = 0
        losses = 0
        
        for i in range(100, len(df) - 5):
            date = df.index[i]
            price = df.iloc[i]['Close']
            
            # Entry signal
            if position is None and df.iloc[i]['signal'] == 1:
                position = {'entry_date': str(date.date()), 'entry_price': price, 'vcp_score': df.iloc[i]['vcp_score']}
            
            # Exit after 5 days or if signal turns off
            elif position and (i >= len(df) - 6 or df.iloc[i]['signal'] == 0):
                exit_price = df.iloc[i + 1]['Close'] if i + 1 < len(df) else price
                pnl_pct = ((exit_price - position['entry_price']) / position['entry_price']) * 100
                
                trades.append({
                    'entry_date': position['entry_date'],
                    'exit_date': str(df.index[min(i + 1, len(df) - 1)].date()),
                    'entry_price': round(position['entry_price'], 2),
                    'exit_price': round(exit_price, 2),
                    'pnl': round(pnl_pct, 2),
                    'vcp_score': round(position['vcp_score'], 1)
                })
                
                total_pnl += pnl_pct
                cumulative_pnl.append(total_pnl)
                
                if pnl_pct > 0:
                    wins += 1
                else:
                    losses += 1
                
                position = None
        
        total_trades = len(trades)
        if total_trades == 0:
            return {"success": True, "total_trades": 0, "win_rate": 0, "avg_pnl": 0, "profit_factor": 0, "cumulative_pnl": [], "trades": [], "strategy": "VCP"}
        
        win_rate = (wins / total_trades) * 100
        avg_pnl = total_pnl / total_trades
        
        # Profit factor
        gross_profit = sum(t['pnl'] for t in trades if t['pnl'] > 0)
        gross_loss = abs(sum(t['pnl'] for t in trades if t['pnl'] < 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
        
        return {
            "success": True,
            "total_trades": total_trades,
            "win_rate": round(win_rate, 1),
            "avg_pnl": round(avg_pnl, 2),
            "profit_factor": round(profit_factor, 2),
            "cumulative_pnl": cumulative_pnl,
            "trades": trades,
            "strategy": "VCP"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# FOREX BOT API ENDPOINTS (Global Swing Command Center)
# ============================================================================

FOREX_BOT_PATH = os.path.join(os.path.dirname(__file__), "..", "forex_bot")


@app.get("/api/forex/scan")
def forex_scan():
    """Scan all FOREX instruments using ML model on 2hr timeframe"""
    try:
        import sys
        sys.path.insert(0, FOREX_BOT_PATH)
        from scanner_v2 import get_signals_above_threshold
        from config_full import CONFIG
        
        min_score = CONFIG["settings"]["min_score"]
        signals, _ = get_signals_above_threshold(min_score)
        return {"success": True, "signals": signals, "count": len(signals)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/forex/portfolio")
def forex_portfolio():
    """Get FOREX portfolio status"""
    try:
        import sys
        sys.path.insert(0, FOREX_BOT_PATH)
        from portfolio_v2 import Portfolio
        
        port = Portfolio()
        return {
            "success": True,
            "stats": port.get_stats(),
            "positions": port.get_positions()
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/forex/journal")
def forex_journal():
    """Get FOREX trade journal"""
    try:
        import sys
        sys.path.insert(0, FOREX_BOT_PATH)
        from journal_v2 import TradeJournal
        
        journal = TradeJournal()
        return {
            "success": True,
            "stats": journal.get_stats(),
            "entries": journal.get_entries(20)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/forex/config")
def forex_config():
    """Get FOREX bot configuration"""
    try:
        import sys
        sys.path.insert(0, FOREX_BOT_PATH)
        from config_full import CONFIG
        
        return {
            "success": True,
            "config": CONFIG["settings"],
            "symbols": CONFIG["symbols"],
            "symbol_count": len(CONFIG["symbols"])
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# Catch-all for SPA routing - MUST be at the end after all API routes
@app.get("/{path:path}")
async def serve_spa(path: str):
    """Serve the frontend for any non-API route."""
    # Skip API routes
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    # Skip static files
    if path.startswith("static/"):
        raise HTTPException(status_code=404, detail="File not found")
    # Skip assets (frontend JS/CSS)
    if path.startswith("assets/"):
        raise HTTPException(status_code=404, detail="File not found")
    # Serve SPA for all other routes
    static_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(static_path):
        return FileResponse(static_path)
    raise HTTPException(status_code=404, detail="Not found")

"""
Intraday Trading Engine for VCP Dashboard
Fetches intraday data from yfinance (.NS suffix for Indian stocks) and computes real-time trading signals.
"""
import os
import sys
import json
import pickle
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pytz

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================
SCAN_CACHE_DIR = os.path.join(os.path.dirname(__file__), "outputs", "scan_cache")
OHLCV_DIR = os.path.join(os.path.dirname(__file__), "outputs", "ohlcv", "IN")
METADATA_FILE = os.path.join(os.path.dirname(__file__), "outputs", "stock_metadata.json")
API_CALL_LIMIT = 100000
IST = pytz.timezone('Asia/Kolkata')


def _convert_numpy(obj):
    """Convert numpy types to Python types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_convert_numpy(i) for i in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

# ============================================================================
# MODULE-LEVEL CACHE VARIABLES
# ============================================================================
INTRADAY_WATCHLIST: List[Dict] = []
CANDLE_CACHE: Dict[str, Dict[str, pd.DataFrame]] = {}
API_CALLS_TODAY: int = 0
LAST_SCAN_RESULT: List[Dict] = []
LAST_SCAN_TIME: Optional[datetime] = None
STOCK_METADATA: Dict = {}

# ============================================================================
# 1. WATCHLIST BUILDER
# ============================================================================
def build_intraday_watchlist(date_str: Optional[str] = None) -> List[Dict]:
    """
    Read today's scan cache and filter for intraday watchlist.
    Filters: score >= 60, stage == 2, tight_rank >= 2, dist52 < 15
    Returns top 100 stocks sorted by score descending.
    """
    global INTRADAY_WATCHLIST
    
    if date_str is None:
        date_str = datetime.now(IST).strftime('%Y-%m-%d')
    
    cache_file = os.path.join(SCAN_CACHE_DIR, f"IN_{date_str}.pkl")
    
    logger.info(f"Building intraday watchlist from {cache_file}")
    
    if not os.path.exists(cache_file):
        logger.warning(f"Scan cache not found for {date_str}")
        INTRADAY_WATCHLIST = []
        return []
    
    try:
        with open(cache_file, 'rb') as f:
            scan_results = pickle.load(f)
        
        # Filter stocks based on criteria
        filtered = []
        for stock in scan_results:
            score = stock.get('score', 0)
            stage = stock.get('stage', 1)
            tight_rank = stock.get('tight', 0)
            dist52 = stock.get('pct_off_high', 100)
            
            if score >= 60 and stage == 2 and tight_rank >= 2 and dist52 < 15:
                filtered.append(stock)
        
        # Sort by score descending and take top 100
        filtered.sort(key=lambda x: x.get('score', 0), reverse=True)
        INTRADAY_WATCHLIST = filtered[:100]
        
        logger.info(f"Intraday watchlist built: {len(INTRADAY_WATCHLIST)} stocks")
        return INTRADAY_WATCHLIST
        
    except Exception as e:
        logger.error(f"Error building watchlist: {e}")
        INTRADAY_WATCHLIST = []
        return []


# ============================================================================
# 2. YFINANCE INTRADAY DATA FETCHER
# ============================================================================
def fetch_intraday_candles(symbol: str, resolution: str = "15", n_candles: int = 50) -> pd.DataFrame:
    """
    Fetch intraday candles from yfinance using .NS suffix for Indian stocks.
    resolution: "15" for 15-min, "60" for 1-hour
    Returns DataFrame with datetime, open, high, low, close, volume
    """
    global API_CALLS_TODAY, CANDLE_CACHE
    
    import yfinance as yf
    
    cache_key = f"{symbol}_{resolution}"
    
    # Check memory cache first
    if cache_key in CANDLE_CACHE:
        cached_df = CANDLE_CACHE[cache_key]
        # Return if cached in last 5 minutes
        if not cached_df.empty:
            cache_time = cached_df.attrs.get('cached_at', None)
            if cache_time and (datetime.now(IST) - cache_time).seconds < 300:
                logger.debug(f"Returning cached data for {cache_key}")
                return cached_df
    
    try:
        API_CALLS_TODAY += 1
        
        # Convert symbol to yfinance format with .NS suffix
        base_symbol = symbol.replace("-EQ", "").replace("NSE:", "").replace(".NS", "")
        yf_symbol = f"{base_symbol}.NS"
        
        # Map resolution to yfinance interval
        interval_map = {"15": "15m", "60": "1h", "5": "5m", "1": "1m"}
        yf_interval = interval_map.get(resolution, "15m")
        
        ticker_obj = yf.Ticker(yf_symbol)
        df = ticker_obj.history(period="5d", interval=yf_interval)
        
        if df is not None and not df.empty:
            df = df.rename(columns={'Open': 'open', 'High': 'high', 'Low': 'low', 'Close': 'close', 'Volume': 'volume'})
            df.index = df.index.tz_convert('Asia/Kolkata')
            df.attrs['cached_at'] = datetime.now(IST)
            
            # Store in cache
            if symbol not in CANDLE_CACHE:
                CANDLE_CACHE[symbol] = {}
            CANDLE_CACHE[symbol][resolution] = df
            
            logger.info(f"Fetched {len(df)} candles for {symbol} ({resolution}min)")
            return df
        else:
            logger.warning(f"No data for {symbol}")
            return pd.DataFrame()
            
    except Exception as e:
        logger.error(f"Error fetching candles for {symbol}: {e}")
        return pd.DataFrame()


# ============================================================================
# 3. API CALL BUDGET TRACKER
# ============================================================================
def get_api_budget_status() -> Dict:
    """Return API budget status dict."""
    global API_CALLS_TODAY
    
    remaining = API_CALL_LIMIT - API_CALLS_TODAY
    pct_used = (API_CALLS_TODAY / API_CALL_LIMIT) * 100 if API_CALL_LIMIT > 0 else 0
    
    return {
        "calls_used": API_CALLS_TODAY,
        "calls_remaining": remaining,
        "limit": API_CALL_LIMIT,
        "pct_used": round(pct_used, 2)
    }


def reset_api_counter_if_needed():
    """Reset API counter at midnight IST."""
    global API_CALLS_TODAY
    
    now = datetime.now(IST)
    if now.hour == 0 and now.minute == 0:
        API_CALLS_TODAY = 0
        logger.info("API counter reset for new day")


# ============================================================================
# 4. INTRADAY SIGNAL ENGINE
# ============================================================================
def calculate_vwap(df: pd.DataFrame) -> pd.Series:
    """Calculate VWAP with reset at market open (9:15 AM IST)."""
    typical_price = (df['high'] + df['low'] + df['close']) / 3
    cumsum_tp_vol = (typical_price * df['volume']).cumsum()
    cumsum_vol = df['volume'].cumsum()
    vwap = cumsum_tp_vol / cumsum_vol.replace(0, np.nan)
    return vwap


def calculate_ema(series: pd.Series, span: int) -> pd.Series:
    """Calculate EMA using pandas ewm."""
    return series.ewm(span=span, adjust=False).mean()


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Calculate Wilder's RSI."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)
    
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def compute_intraday_signals(symbol: str, df_15m: pd.DataFrame, df_1h: pd.DataFrame) -> Dict:
    """
    Compute all intraday signals for a symbol.
    Returns dict with all signals, scores, and entry recommendations.
    """
    signals = {'symbol': symbol}
    
    # Handle empty dataframes
    if df_15m.empty:
        logger.warning(f"No 15min data for {symbol}")
        return {**signals, 'error': 'no_data'}
    
    # ===================== 15-MINUTE SIGNALS =====================
    close = df_15m['close']
    high = df_15m['high']
    low = df_15m['low']
    open_ = df_15m['open']
    volume = df_15m['volume']
    
    # Calculate indicators
    ema9 = calculate_ema(close, 9)
    ema21 = calculate_ema(close, 21)
    ema50_15m = calculate_ema(close, 50)
    vwap_15m = calculate_vwap(df_15m)
    rsi_15m = calculate_rsi(close, 14)
    
    # EMA9 cross (last 3 candles)
    ema9_cross = False
    if len(ema9) >= 4:
        # Cross happened in last 3 candles
        for i in range(-3, 0):
            if ema9.iloc[i-1] <= ema21.iloc[i-1] and ema9.iloc[i] > ema21.iloc[i]:
                ema9_cross = True
                break
    signals['ema9_cross'] = ema9_cross
    
    # VWAP reclaim
    vwap_reclaim = False
    if len(close) >= 2:
        if close.iloc[-1] > vwap_15m.iloc[-1] and close.iloc[-2] < vwap_15m.iloc[-2]:
            vwap_reclaim = True
    signals['vwap_reclaim'] = vwap_reclaim
    
    # Volume surge 15m
    vol_avg = volume.iloc[-21:-1].mean() if len(volume) > 20 else volume.mean()
    volume_surge_15m = volume.iloc[-1] > 2 * vol_avg if vol_avg > 0 else False
    signals['volume_surge_15m'] = volume_surge_15m
    
    # Inside bar break
    inside_bar_break = False
    if len(df_15m) >= 2:
        prev = df_15m.iloc[-2]
        curr = df_15m.iloc[-1]
        is_inside = (curr['high'] < prev['high'] and curr['low'] > prev['low'])
        if is_inside and curr['high'] > prev['high']:
            inside_bar_break = True
    signals['inside_bar_break'] = inside_bar_break
    
    # EMA stack 15m
    ema_stack_15m = False
    if len(ema9) >= 1 and len(ema21) >= 1 and len(ema50_15m) >= 1:
        if ema9.iloc[-1] > ema21.iloc[-1] > ema50_15m.iloc[-1]:
            ema_stack_15m = True
    signals['ema_stack_15m'] = ema_stack_15m
    
    # RSI 15m
    signals['rsi_15m'] = round(rsi_15m.iloc[-1], 1) if len(rsi_15m) > 0 else 50
    
    # RSI momentum (rising for last 3)
    rsi_momentum = False
    if len(rsi_15m) >= 4:
        if rsi_15m.iloc[-1] > 55:
            if rsi_15m.iloc[-1] > rsi_15m.iloc[-2] > rsi_15m.iloc[-3]:
                rsi_momentum = True
    signals['rsi_momentum'] = rsi_momentum
    
    # Close above open (green candle)
    close_above_open = close.iloc[-1] > open_.iloc[-1] if len(close) > 0 else False
    signals['close_above_open'] = close_above_open
    
    # Candle strength
    candle_range = high.iloc[-1] - low.iloc[-1]
    candle_strength = (close.iloc[-1] - open_.iloc[-1]) / candle_range if candle_range > 0 else 0
    signals['candle_strength'] = round(candle_strength, 3)
    
    # ===================== 1-HOUR SIGNALS =====================
    if not df_1h.empty:
        close_1h = df_1h['close']
        high_1h = df_1h['high']
        low_1h = df_1h['low']
        
        ema20_1h = calculate_ema(close_1h, 20)
        ema50_1h = calculate_ema(close_1h, 50)
        vwap_1h = calculate_vwap(df_1h)
        rsi_1h = calculate_rsi(close_1h, 14)
        
        # EMA stack 1h
        ema_stack_1h = False
        if len(ema20_1h) >= 1 and len(ema50_1h) >= 1:
            if ema20_1h.iloc[-1] > ema50_1h.iloc[-1]:
                ema_stack_1h = True
        signals['ema_stack_1h'] = ema_stack_1h
        
        # RSI 1h
        signals['rsi_1h'] = round(rsi_1h.iloc[-1], 1) if len(rsi_1h) > 0 else 50
        
        # 1h trend (higher lows in last 3 candles)
        trend_1h = "down"
        if len(low_1h) >= 4:
            if low_1h.iloc[-1] > low_1h.iloc[-2] > low_1h.iloc[-3]:
                trend_1h = "up"
        signals['1h_trend'] = trend_1h
        
        # Above VWAP 1h
        signals['above_vwap_1h'] = close_1h.iloc[-1] > vwap_1h.iloc[-1] if len(close_1h) > 0 else False
        
        # Hourly breakout (15min close > 1h prev high)
        hourly_breakout = False
        if len(close) > 0 and len(high_1h) >= 2:
            if close.iloc[-1] > high_1h.iloc[-2]:
                hourly_breakout = True
        signals['hourly_breakout'] = hourly_breakout
    else:
        signals['ema_stack_1h'] = False
        signals['rsi_1h'] = 50
        signals['1h_trend'] = "down"
        signals['above_vwap_1h'] = False
        signals['hourly_breakout'] = False
    
    # ===================== COMPOSITE SCORE =====================
    score = 0
    if signals.get('ema_stack_1h', False):
        score += 20
    if signals.get('ema9_cross', False):
        score += 15
    if signals.get('vwap_reclaim', False):
        score += 15
    if signals.get('volume_surge_15m', False):
        score += 15
    if signals.get('rsi_momentum', False):
        score += 10
    if signals.get('inside_bar_break', False):
        score += 10
    if signals.get('hourly_breakout', False):
        score += 15
    
    signals['intraday_score'] = score
    
    # ===================== ENTRY SIGNAL =====================
    entry_signal = bool(score >= 60)
    signals['entry_signal'] = entry_signal
    
    if entry_signal:
        signals['entry_type'] = "STRONG" if score >= 80 else "MODERATE"
    else:
        signals['entry_type'] = None
    
    # Entry, stop loss, targets
    if len(close) > 0:
        entry = close.iloc[-1]
        signals['suggested_entry'] = round(entry, 2)
        
        # Stop loss: lowest low of last 5 candles
        stop_loss = low.iloc[-6:-1].min() if len(low) >= 6 else low.iloc[-1]
        signals['stop_loss'] = round(stop_loss, 2)
        
        # Targets
        risk = entry - stop_loss
        signals['target_1'] = round(entry + risk * 1.5, 2)  # 1.5R
        signals['target_2'] = round(entry + risk * 2.5, 2)  # 2.5R
        
        # Risk percentage
        signals['risk_pct'] = round((risk / entry) * 100, 2) if entry > 0 else 0
    else:
        signals['suggested_entry'] = 0
        signals['stop_loss'] = 0
        signals['target_1'] = 0
        signals['target_2'] = 0
        signals['risk_pct'] = 0
    
    return signals


# ============================================================================
# 5. BATCH SCANNER
# ============================================================================
def run_intraday_scan() -> List[Dict]:
    """
    Run intraday scan on watchlist stocks.
    Returns list of dicts with all signal data, sorted by score.
    """
    global LAST_SCAN_RESULT, LAST_SCAN_TIME, INTRADAY_WATCHLIST
    
    logger.info(f"Starting intraday scan on {len(INTRADAY_WATCHLIST)} stocks")
    
    # Rebuild watchlist if empty
    if not INTRADAY_WATCHLIST:
        build_intraday_watchlist()
    
    results = []
    api_calls_used = 0
    
    for stock in INTRADAY_WATCHLIST[:100]:  # Max 100 stocks
        symbol = stock.get('ticker', '')
        if not symbol:
            continue
        
        # Fetch 15min and 1h candles
        df_15m = fetch_intraday_candles(symbol, "15", 50)
        df_1h = fetch_intraday_candles(symbol, "60", 20)
        
        api_calls_used += 2
        
        # Compute signals
        signals = compute_intraday_signals(symbol, df_15m, df_1h)
        
        # Add VCP score from watchlist
        signals['vcp_score'] = stock.get('score', 0)
        signals['stage'] = stock.get('stage', 1)
        signals['tight_rank'] = stock.get('tight', 0)
        
        # Add sector and market cap
        meta = STOCK_METADATA.get(symbol, {})
        signals['sector'] = meta.get('sector', '')
        signals['market_cap'] = meta.get('market_cap', '')
        
        results.append(signals)
    
    # Sort by intraday score descending
    results.sort(key=lambda x: x.get('intraday_score', 0), reverse=True)
    
    LAST_SCAN_RESULT = results
    LAST_SCAN_TIME = datetime.now(IST)
    
    logger.info(f"Intraday scan complete. Used ~{api_calls_used} API calls. Found {len([r for r in results if r.get('entry_signal')])} entry signals.")
    
    # Convert numpy types to Python types for JSON serialization
    return [_convert_numpy(r) for r in results]


# ============================================================================
# 6. SECTOR AND MARKET CAP (STATIC ENRICHMENT)
# ============================================================================
def load_stock_metadata() -> Dict:
    """Load stock metadata from JSON file."""
    global STOCK_METADATA
    
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r') as f:
                STOCK_METADATA = json.load(f)
            logger.info(f"Loaded metadata for {len(STOCK_METADATA)} stocks")
        except Exception as e:
            logger.warning(f"Could not load metadata: {e}")
            STOCK_METADATA = {}
    else:
        logger.info("Metadata file not found, using empty metadata")
        STOCK_METADATA = {}
    
    return STOCK_METADATA


# ============================================================================
# STOCK METADATA BUILDER
# ============================================================================
# Top 50 Nifty stocks with sectors
NIFTY_SECTORS = {
    "RELIANCE-EQ": "Energy",
    "TCS-EQ": "IT",
    "HDFCBANK-EQ": "Finance",
    "INFOSYS-EQ": "IT",
    "ICICIBANK-EQ": "Finance",
    "HINDUNILVR-EQ": "FMCG",
    "ITC-EQ": "FMCG",
    "SBIN-EQ": "Finance",
    "BHARTIARTL-EQ": "Telecom",
    "BAJFINANCE-EQ": "Finance",
    "MARUTI-EQ": "Automobile",
    "KOTAKBANK-EQ": "Finance",
    "HCLTECH-EQ": "IT",
    "TITAN-EQ": "Consumer",
    "ASIANPAINT-EQ": "Chemical",
    "SUNPHARMA-EQ": "Healthcare",
    "TATASTEEL-EQ": "Metal",
    "ULTRACEMCO-EQ": "Cement",
    "NTPC-EQ": "Energy",
    "POWERGRID-EQ": "Energy",
    "NESTLEIND-EQ": "FMCG",
    "ONGC-EQ": "Energy",
    "COALINDIA-EQ": "Energy",
    "M&M-EQ": "Automobile",
    "ADANIPORTS-EQ": "Infrastructure",
    "AXISBANK-EQ": "Finance",
    "SHRIRAMFIN-EQ": "Finance",
    "GRASIM-EQ": "Cement",
    "HDFCLIFE-EQ": "Finance",
    "WIPRO-EQ": "IT",
    "TECHM-EQ": "IT",
    "JSWSTEEL-EQ": "Metal",
    "ADANIENT-EQ": "Metal",
    "CIPLA-EQ": "Healthcare",
    "DRREDDY-EQ": "Healthcare",
    "SBILIFE-EQ": "Finance",
    "BPCL-EQ": "Energy",
    "APOLLOHOSP-EQ": "Healthcare",
    "TATACONSUM-EQ": "FMCG",
    "DIVISLAB-EQ": "Healthcare",
    "BRITANNIA-EQ": "FMCG",
    "HEROMOTOCO-EQ": "Automobile",
    "ICICIPRULI-EQ": "Finance",
    "VEDL-EQ": "Metal",
    "IDEA-EQ": "Telecom",
    "BAJAJFINSV-EQ": "Finance",
    "INDUSINDBK-EQ": "Finance",
    "PIDILITIND-EQ": "Chemical",
    "SBICARDS-EQ": "Finance",
    "SIEMENS-EQ": "Industrial",
    "BERGERPAINT-EQ": "Chemical",
    "HAVELLS-EQ": "Electrical",
    "GODREJCP-EQ": "FMCG",
    "BOSCHLTD-EQ": "Automobile",
    "EICHERMOT-EQ": "Automobile",
    "MARICO-EQ": "FMCG",
    "COLPAL-EQ": "FMCG",
    "DABUR-EQ": "FMCG",
    "CADILAHC-EQ": "Healthcare",
    "BIOCON-EQ": "Healthcare",
    "GLAND-EQ": "Healthcare",
    "LUPIN-EQ": "Healthcare",
    "AUROPHARMA-EQ": "Healthcare",
    "ALKEM-EQ": "Healthcare",
    "TORNTPHARM-EQ": "Healthcare",
    "CONCOR-EQ": "Transport",
    "IRCTC-EQ": "Transport",
    "GAIL-EQ": "Energy",
    "IOC-EQ": "Energy",
    "HINDPETRO-EQ": "Energy",
    "MGL-EQ": "Energy",
    "GUJGASLTD-EQ": "Energy",
    "ADANIGAS-EQ": "Energy",
    "TATAPOWER-EQ": "Energy",
    "TORNTPOWER-EQ": "Energy",
    "JINDALSTEL-EQ": "Metal",
    "TATAELXSI-EQ": "IT",
    "L&TS-EQ": "Infrastructure",
    "ADANITRANS-EQ": "Infrastructure",
    "LTTS-EQ": "IT",
    "MINDTREE-EQ": "IT",
    "PERSISTENT-EQ": "IT",
    "TCS-EQ": "IT",
    "INFY-EQ": "IT",
    "WIPRO-EQ": "IT",
    "HCL-EQ": "IT",
    "TECHM-EQ": "IT",
    "MPHASIS-EQ": "IT",
    "COFORGE-EQ": "IT",
    "MUTHOOTFIN-EQ": "Finance",
    "MANAPPURAM-EQ": "Finance",
    "BANDHANBNK-EQ": "Finance",
    "IDFCFIRSTB-EQ": "Finance",
    "RBLBANK-EQ": "Finance",
    "FEDERALBNK-EQ": "Finance",
    "AUBANK-EQ": "Finance",
    "PNB-EQ": "Finance",
    "CANBK-EQ": "Finance",
    "UNIONBANK-EQ": "Finance",
    "IOB-EQ": "Finance",
    "BANKBARODA-EQ": "Finance",
    "INDIANB-EQ": "Finance",
    "YESBANK-EQ": "Finance",
}


def build_stock_metadata() -> Dict:
    """
    Build stock metadata from Parquet files.
    Estimates market cap based on avg volume * avg close.
    Uses sector mapping for known stocks, 'Unknown' for others.
    """
    global STOCK_METADATA
    
    logger.info("Building stock metadata from OHLCV files...")
    
    metadata = {}
    ohlcv_files = []
    
    if os.path.exists(OHLCV_DIR):
        ohlcv_files = [f for f in os.listdir(OHLCV_DIR) if f.endswith('.parquet')]
    
    logger.info(f"Found {len(ohlcv_files)} Parquet files")
    
    for fname in ohlcv_files:
        ticker = fname.replace('.parquet', '')
        filepath = os.path.join(OHLCV_DIR, fname)
        
        try:
            df = pd.read_parquet(filepath)
            if len(df) < 20:
                continue
            
            # Calculate avg volume and avg close
            avg_volume = df['Volume'].iloc[-60:].mean() if len(df) >= 60 else df['Volume'].mean()
            avg_close = df['Close'].iloc[-60:].mean() if len(df) >= 60 else df['Close'].mean()
            
            # Proxy for market cap: volume * close (in rupees)
            proxy_value = avg_volume * avg_close
            
            # Classify market cap
            if proxy_value > 500_000_000:  # > 50 Cr daily value = Large cap
                market_cap = "Large"
            elif proxy_value > 50_000_000:  # > 5 Cr = Mid cap
                market_cap = "Mid"
            else:
                market_cap = "Small"
            
            # Get sector from mapping
            sector = NIFTY_SECTORS.get(ticker, "Unknown")
            
            metadata[ticker] = {
                "sector": sector,
                "market_cap": market_cap
            }
            
        except Exception as e:
            logger.warning(f"Error processing {ticker}: {e}")
            continue
    
    # Save to file
    os.makedirs(os.path.dirname(METADATA_FILE), exist_ok=True)
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    STOCK_METADATA = metadata
    logger.info(f"Stock metadata built: {len(metadata)} stocks")
    
    return metadata


# ============================================================================
# INITIALIZATION
# ============================================================================
def initialize():
    """Initialize the intraday engine."""
    logger.info("Initializing intraday engine...")
    load_stock_metadata()
    build_intraday_watchlist()
    logger.info("Intraday engine initialized")


# Auto-initialize on import
if __name__ != "__main__":
    initialize()

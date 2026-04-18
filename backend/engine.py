import os
import pandas as pd
import numpy as np
from scipy.signal import argrelextrema
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
def get_local_path(ticker: str) -> str:
    return os.path.join(DATA_DIR, f"{ticker.replace('.','_')}.csv")
def simulate_vcp_stock(ticker: str, period: str = "1y") -> pd.DataFrame:
    """Generate synthetic stock data with embedded VCP patterns fallback."""
    np.random.seed(hash(ticker) % 9999)
    days = {"6mo":126,"1y":252,"2y":504}.get(period, 252)
    base = np.random.uniform(50, 500)
    trend = np.linspace(0, np.random.uniform(0.2, 0.8), days)
    noise = np.cumsum(np.random.randn(days) * 0.012)
    vcp = np.zeros(days)
    midpoint = int(days * 0.55)
    for i, (start, mag, width) in enumerate([(midpoint, -0.12, 20),(midpoint+25, -0.07, 15),(midpoint+45, -0.035, 10)]):
        if start+width < days:
            vcp[start:start+width] += np.linspace(0, mag, width)
            vcp[start+width:start+width*2] += np.linspace(mag, 0, width)
    close = base * np.exp(trend + noise + vcp)
    high  = close * (1 + np.abs(np.random.randn(days)) * 0.008)
    low   = close * (1 - np.abs(np.random.randn(days)) * 0.008)
    open_ = close * (1 + np.random.randn(days) * 0.005)
    vol_base = np.random.uniform(1e6, 5e7)
    vol = np.ones(days) * vol_base
    vol[midpoint:midpoint+45] *= np.linspace(1, 0.4, 45)
    vol *= (1 + np.random.randn(days) * 0.3).clip(0.2)
    end_date = pd.Timestamp.now().normalize()
    dates = pd.bdate_range(end=end_date, periods=days)
    n = len(dates)
    df = pd.DataFrame({
        "Open": open_[:n], "High": high[:n], "Low": low[:n], 
        "Close": close[:n], "Volume": vol[:n].astype(int)
    }, index=dates)
    return df
def fetch_data(ticker: str, period: str = "1y", min_date=None, market: str = "IN") -> pd.DataFrame:
    """
    Primary data fetcher for the engine.
    Uses the unified ohlcv_store.fetch_local for efficiency.
    """
    from ohlcv_store import fetch_local, _download_from_yfinance
    
    # 1. Try local storage (SQLite -> Parquet -> CSV)
    df = fetch_local(ticker, market)
    if df is not None and len(df) >= 60:
        return df
        
    # 2. Live yfinance fetch (if not found locally)
    try:
        df = _download_from_yfinance(ticker, market=market)
        if df is not None and len(df) >= 60:
            return df
    except Exception:
        pass
        
    # 3. Synthetic fallback (for development/offline)
    import warnings
    warnings.warn(f"[fetch_data] Using SYNTHETIC data for {ticker} — no real data found.", RuntimeWarning)
    dfSynthetic = simulate_vcp_stock(ticker, period)
    dfSynthetic.attrs["is_synthetic"] = True
    return dfSynthetic
def compute_indicators(df: pd.DataFrame, benchmark_df: pd.DataFrame = None) -> pd.DataFrame:
    d = df.copy()
    for p in [10, 20, 50, 150, 200]:
        d[f"MA{p}"] = d["Close"].rolling(p).mean()
    hl = d["High"] - d["Low"]
    hc = (d["High"] - d["Close"].shift()).abs()
    lc = (d["Low"]  - d["Close"].shift()).abs()
    d["ATR"] = pd.concat([hl, hc, lc], axis=1).max(axis=1).rolling(14).mean()
    d["ATR20"] = pd.concat([hl, hc, lc], axis=1).max(axis=1).rolling(20).mean()
    d["ATR_pct"] = d["ATR"] / d["Close"] * 100
    delta = d["Close"].diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs_val = gain / loss.replace(0, np.nan)
    d["RSI"] = 100 - 100 / (1 + rs_val)
    mid = d["Close"].rolling(20).mean()
    std = d["Close"].rolling(20).std()
    d["BB_upper"] = mid + 2 * std
    d["BB_lower"] = mid - 2 * std
    d["BB_width"] = (d["BB_upper"] - d["BB_lower"]) / mid * 100
    d["BBW_pctl"] = (d["BB_width"].rolling(50, min_periods=2).rank(pct=True) * 100).fillna(50.0)
    def get_vcp_range(offset, length):
        h = d["High"].shift(offset).rolling(length).max()
        l = d["Low"].shift(offset).rolling(length).min()
        return (h - l) / d["Close"] * 100
    d["VCP_R1"] = get_vcp_range(0, 10)
    d["VCP_R2"] = get_vcp_range(10, 10)
    d["VCP_R3"] = get_vcp_range(20, 10)
    for p in [10, 20, 50, 150, 200]:
        d[f"EMA{p}"] = d["Close"].ewm(span=p, adjust=False).mean()
    
    # Superior Indicators
    # 1. SMA200 Slope (Trending up for at least 1 month)
    d["MA200_Slope"] = (d["MA200"] - d["MA200"].shift(20)) / d["MA200"].shift(20) * 100
    
    # 2. RS 52-Week High (RS Line at new highs)
    if benchmark_df is not None and not benchmark_df.empty:
        aligned_bench = benchmark_df["Close"].reindex(d.index).ffill()
        rs_line = d["Close"] / aligned_bench
        rs_line_hi52 = rs_line.rolling(252, min_periods=100).max()
        d["RS_52W_High"] = (rs_line >= rs_line_hi52 * 0.99).astype(float)
        rs_ratio_daily = d["Close"] / aligned_bench
        rs_ratio_100d = d["Close"].shift(100) / aligned_bench.shift(100)
        d["RS_Ratio"] = (rs_ratio_daily / rs_ratio_100d) * 100
    else:
        d["RS_52W_High"] = 0.0
        d["RS_Ratio"] = 100.0

    # 3. Volume Drying to lowest in 10 weeks (50 trading days)
    vol_min_10w = d["Volume"].rolling(50).min()
    d["Vol_Dry_10W"] = (d["Volume"] <= vol_min_10w * 1.2).astype(float) # Within 20% of 10W low

    # 4. ATR Declining (for Early entry)
    d["ATR_Declining"] = (d["ATR"] < d["ATR"].shift(5)).astype(float)

    # 5. SMA Stack (50 > 150 > 200)
    d["SMA_Stack"] = ((d["MA50"] > d["MA150"]) & (d["MA150"] > d["MA200"])).astype(float)

    # 6. Cup and Handle Detection (Basic)
    # 15-35% depth cup, tight handle in upper half
    hi_cup = d["High"].rolling(60).max()
    lo_cup = d["Low"].rolling(60).min()
    cup_depth = (hi_cup - lo_cup) / hi_cup * 100
    is_cup = (cup_depth >= 15) & (cup_depth <= 40)
    handle_tight = d["BB_width"] < 10
    d["Cup_Handle"] = (is_cup & handle_tight & (d["Close"] > (hi_cup + lo_cup)/2)).astype(float)

    # 7. Double Bottom Detection (Basic)
    # W-shape, second bottom near first
    lo_10 = d["Low"].rolling(10).min()
    lo_40 = d["Low"].rolling(40).min()
    d["Double_Bottom"] = ((lo_10 >= lo_40) & (lo_10 <= lo_40 * 1.05) & (d["Close"] > d["MA50"])).astype(float)

    # 8. Market Health (Nifty Trend)
    # If Nifty is below 50 SMA, odds of success drop by 70%
    if benchmark_df is not None and not benchmark_df.empty:
        bench_m50 = benchmark_df["Close"].rolling(50).mean()
        d["Market_Health"] = (benchmark_df["Close"] > bench_m50).astype(float)
    else:
        d["Market_Health"] = 1.0

    # 9. Accumulation/Distribution (A/D)
    # Count high volume UP days vs high volume DOWN days in last 50 days
    vol_avg = d["Volume"].rolling(50).mean()
    hi_vol = d["Volume"] > vol_avg * 1.2
    up_day = d["Close"] > d["Open"]
    dn_day = d["Close"] < d["Open"]
    acc_days = (hi_vol & up_day).rolling(50).sum()
    dist_days = (hi_vol & dn_day).rolling(50).sum()
    d["AD_Ratio"] = (acc_days / dist_days.replace(0, 1)).fillna(1.0)

    # 10. Volatility Contraction Score (VCS)
    # How tight is the price action relative to its own history?
    std_10 = d["Close"].rolling(10).std()
    std_100 = d["Close"].rolling(100).std()
    d["VCS"] = (1 - (std_10 / std_100.replace(0, 1))).clip(0, 1) * 100

    d["Trend_Score"] = 0.0
    mask_full = (d["Close"] > d["EMA20"]) & (d["EMA20"] > d["EMA50"]) & \
                (d["EMA50"] > d["EMA150"]) & (d["EMA150"] > d["EMA200"])
    d.loc[mask_full, "Trend_Score"] = 1.0
    mask_partial = (~mask_full) & (d["Close"] > d["EMA50"])
    d.loc[mask_partial, "Trend_Score"] = 0.5
    hi252 = d["High"].rolling(252, min_periods=100).max()
    lo252 = d["Low"].rolling(252, min_periods=100).min()
    d["Dist52"] = (1 - d["Close"] / hi252) * 100
    d["DistLow52"] = (d["Close"] / lo252 - 1) * 100
    # Minervini Trend Template Checks
    d["Trend_Template"] = False
    try:
        c = d["Close"]
        m50, m150, m200 = d["MA50"], d["MA150"], d["MA200"]
        m200_20 = m200.shift(20)
        cond1 = (c > m150) & (c > m200)
        cond2 = (m150 > m200)
        cond3 = (m200 > m200_20) # MA200 trending up
        cond4 = (m50 > m150) & (m50 > m200)
        cond5 = (c > m50)
        cond6 = (d["DistLow52"] > 30) # At least 30% above 52-week low
        cond7 = (d["Dist52"] < 25)    # Within 25% of 52-week high
        d["Trend_Template"] = cond1 & cond2 & cond3 & cond4 & cond5 & cond6 & cond7
    except:
        pass
    kc_mid = d["Close"].ewm(span=20, adjust=False).mean()
    kc_range = d["ATR20"] 
    d["KC_upper"] = kc_mid + 1.5 * kc_range
    d["KC_lower"] = kc_mid - 1.5 * kc_range
    d["Squeeze"] = ((d["BB_lower"] > d["KC_lower"]) & (d["BB_upper"] < d["KC_upper"])).astype(float)
    is_in_base = (d["Close"] >= (hi252 * 0.70)).astype(int)
    d["WBase"] = is_in_base.groupby((is_in_base != is_in_base.shift()).cumsum()).cumsum() / 5.0
    d["Vol_MA20"]  = d["Volume"].rolling(20).mean()
    d["Vol_Ratio"] = d["Volume"] / d["Vol_MA20"].replace(0, 1)
    d["ROC10"]  = d["Close"].pct_change(10)  * 100
    d["ROC252"] = d["Close"].pct_change(252) * 100
    d["R1"]   = d["Close"].pct_change(1)   * 100
    d["R5"]   = d["Close"].pct_change(5)   * 100
    d["R21"]  = d["Close"].pct_change(21)  * 100
    d["R63"]  = d["Close"].pct_change(63)  * 100
    d["R126"] = d["Close"].pct_change(126) * 100
    def calculate_adx(high, low, close, period=14):
        tr = pd.concat([high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()
        dm_plus = (high - high.shift()).clip(lower=0)
        dm_minus = (low.shift() - low).clip(lower=0)
        di_plus = 100 * (dm_plus.rolling(period).mean() / atr)
        di_minus = 100 * (dm_minus.rolling(period).mean() / atr)
        # Avoid division by zero
        denom = (di_plus + di_minus).replace(0, np.nan)
        dx = 100 * (di_plus - di_minus).abs() / denom
        return dx.rolling(period).mean().fillna(20.0)
    d["ADX"] = calculate_adx(d["High"], d["Low"], d["Close"], 14)
    vol_dry = d["Volume"] < d["Vol_MA20"]
    d["VDry"] = vol_dry.groupby((vol_dry != vol_dry.shift()).cumsum()).cumsum()
    high_10 = d["High"].shift(1).rolling(10).max()
    low_10 = d["Low"].rolling(10).min()
    d["Hndl"] = (high_10 - low_10) / high_10 * 100
    s_min = d["Close"].rolling(8).min()
    s_max = d["Close"].rolling(8).max()
    s_rng = s_max - s_min
    s_rng_safe = s_rng.replace(0, np.nan)
    sp0 = ((d["Close"] - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp1 = ((d["Close"].shift(1) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp2 = ((d["Close"].shift(2) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp3 = ((d["Close"].shift(3) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp4 = ((d["Close"].shift(4) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp5 = ((d["Close"].shift(5) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp6 = ((d["Close"].shift(6) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    sp7 = ((d["Close"].shift(7) - s_min) / s_rng_safe * 7).round().fillna(3).astype(int)
    d["Spark"] = sp7*10000000 + sp6*1000000 + sp5*100000 + sp4*10000 + sp3*1000 + sp2*100 + sp1*10 + sp0
    upTrend_t = (d["Close"] > d["MA50"]) & (d["MA50"] > d["MA150"]) & (d["MA150"] > d["MA200"])
    recent_hi = d["High"].shift(1).rolling(30).max()
    msb_t = d["High"] > recent_hi
    avg_vol_t = d["Volume"].shift(1).rolling(20).mean()
    rvol_t = d["Volume"] / avg_vol_t.replace(0, 1)
    curr_month = pd.to_datetime(d.index).month
    good_mon = ~curr_month.isin([1, 2, 9, 10])
    base_sig = upTrend_t & msb_t
    t1_sig = base_sig & (rvol_t >= 3.0) & good_mon
    t2_sig = base_sig & (rvol_t >= 2.0) & good_mon & ~t1_sig
    t3_sig = base_sig & (rvol_t >= 1.5) & ~t1_sig & ~t2_sig
    d["Tier_Enc"] = 0.0
    d.loc[t1_sig, "Tier_Enc"] = 1.0
    d.loc[t2_sig, "Tier_Enc"] = 2.0
    d.loc[t3_sig, "Tier_Enc"] = 3.0
    mask_t3 = (d["VCP_R1"] < d["VCP_R2"]) & (d["VCP_R2"] < d["VCP_R3"])
    mask_t2 = (~mask_t3) & (d["VCP_R1"] < d["VCP_R2"])
    d["Tight_Rank"] = 1.0
    d.loc[mask_t3, "Tight_Rank"] = 3.0
    d.loc[mask_t2, "Tight_Rank"] = 2.0
    pdh_brk = (d["High"] > d["High"].shift(1)) & (d["Tight_Rank"] >= 2)
    d["PDH_Brk"] = pdh_brk.astype(float)
    # Pivot Breakout
    pivot_resistance = d["High"].rolling(10).max().shift(1)
    d["Pivot_Breakout"] = (d["Close"] > pivot_resistance).astype(float)
    # Rolling Score Calculation — designed weights capped at 100 total
    # Key insight: VCP quality (R1<R2<R3) is ALREADY encoded in Tight_Rank.
    # Tight_Rank=3 → R1<R2<R3 (true contraction). Tight_Rank=2 → R1<R2 only.
    # We graduate Tight_Rank: Rank3=20pts, Rank2=10pts (not binary 15 for both).
    # Volume: single consolidated signal, Vol_Dry_10W is separate (accumulation signal).
    vol_condition = (d["Vol_Ratio"] < 0.7).astype(float)
    tight_rank_graduated = np.where(d["Tight_Rank"] == 3, 20.0, 0.0)
    d["Rolling_Score"] = (100 - d["BBW_pctl"]) * 0.15
    d["Rolling_Score"] += d["VCS"] * 0.05
    d["Rolling_Score"] += np.where(d["RS_Ratio"] > 105, 15.0, np.where(d["RS_Ratio"] > 100, 5.0, 0.0))
    d["Rolling_Score"] += np.where(d["RS_52W_High"], 10.0, 0.0)
    d["Rolling_Score"] += np.where(d["Trend_Template"], 20.0, np.where(d["Trend_Score"] >= 0.5, 10.0, 0.0))
    d["Rolling_Score"] += vol_condition * 10.0
    d["Rolling_Score"] += np.where(d["Dist52"] < 5, 10.0, np.where(d["Dist52"] < 15, 5.0, 0.0))
    d["Rolling_Score"] += tight_rank_graduated
    d["Rolling_Score"] += (d["Tight_Rank"] == 2).astype(float) * 10.0
    d["Rolling_Score"] += np.where(d["Vol_Dry_10W"] == 1, 5.0, 0.0)
    d["Rolling_Score"] += (d["ADX"] > 25).astype(float) * 5.0
    d["Rolling_Score"] += np.where(d["AD_Ratio"] > 2.0, 5.0, np.where(d["AD_Ratio"] > 1.2, 2.5, 0.0))

    # Market Guard: Gradual penalty applied BEFORE final clip
    if "Market_Health" in d.columns:
        gap_pct = np.where(d["Market_Health"] == 0, (d["MA50"] - d["Close"]) / d["Close"] * 100, 0)
        multiplier = np.maximum(0.6, 1.0 - (gap_pct * 0.1))
        d["Rolling_Score"] = d["Rolling_Score"] * multiplier

    d["Rolling_Score"] = d["Rolling_Score"].clip(upper=100)
    
    return d
def find_pivots(df: pd.DataFrame, order: int = 5):
    close = df["Close"].values
    pivot_high_idx = argrelextrema(close, np.greater, order=order)[0]
    pivot_low_idx  = argrelextrema(close, np.less,    order=order)[0]
    return pivot_high_idx, pivot_low_idx
def compute_trendlines(df: pd.DataFrame):
    ph_idx, pl_idx = find_pivots(df, order=5)
    n = len(df)
    trendlines = {}
    if len(ph_idx) >= 2:
        ph_idx_r = ph_idx[-min(4, len(ph_idx)):]
        x = ph_idx_r
        y = df["High"].values[x]
        if len(x) >= 2:
            m, b = np.polyfit(x, y, 1)
            x_full = np.arange(n)
            trendlines["resistance"] = {"slope": m, "intercept": b, "x": x, "y": y, "line": m * x_full + b}
    if len(pl_idx) >= 2:
        pl_idx_r = pl_idx[-min(4, len(pl_idx)):]
        x = pl_idx_r
        y = df["Low"].values[x]
        if len(x) >= 2:
            m, b = np.polyfit(x, y, 1)
            x_full = np.arange(n)
            trendlines["support"] = {"slope": m, "intercept": b, "x": x, "y": y, "line": m * x_full + b}
    return trendlines
class VCPDetector:
    def analyse(self, df: pd.DataFrame, ticker: str = "", benchmark_df: pd.DataFrame = None, precomputed: bool = False) -> dict:
        d = df if precomputed else compute_indicators(df, benchmark_df)
        if len(d) < 10: # Minimum to even show a sparkline/chart
            return self._empty(ticker)
            
        # If we have data but less than 60, we still want to return the df for the chart
        # but we might skip the full VCP analysis
        if len(d) < 60:
            res = self._empty(ticker)
            res["df"] = d
            res["last_price"] = round(d["Close"].iloc[-1], 2)
            res["name"] = ticker
            res["is_synthetic"] = bool(d.attrs.get("is_synthetic", False))
            return res
        last = d.iloc[-1]
        c = last["Close"]
        ph_idx, pl_idx = find_pivots(d, order=5)
        contractions = self._detect_contractions(d, ph_idx, pl_idx)
        rs_ratio    = last.get("RS_Ratio", 100.0)
        bbw_pctl    = last.get("BBW_pctl", 50.0)
        vol_r       = last.get("Vol_Ratio", 1.0)
        tight_rank  = last.get("Tight_Rank", 1.0)
        dist52      = last.get("Dist52", 0.0)
        trend_score_raw = last.get("Trend_Score", 0.0)
        is_trend_template = bool(last.get("Trend_Template", False))
        scores = {
            "tightness": min(100, max(0, 100 - bbw_pctl)), 
            "rs": min(100, max(0, rs_ratio)),
            "trend": 100.0 if is_trend_template else 50.0 if trend_score_raw >= 0.5 else 0.0,
            "volume": min(100, max(0, (1 - min(1, vol_r)) * 100)),
            "proximity": min(100, max(0, 100 - dist52)),
            "tight_trend": min(100, max(0, tight_rank * 33.3)),
            "wbase": min(100, max(0, last.get("WBase", 0.0) * 10))
        }
        composite = round(last.get("Rolling_Score", 0.0), 1)
        checklist = 0
        if rs_ratio > 100:  checklist += 1
        if bbw_pctl < 25:    checklist += 1
        if vol_r < 0.7:      checklist += 1
        if tight_rank >= 2: checklist += 1
        if dist52 < 15:     checklist += 1
        if last.get("RSI", 0) > 50:    checklist += 1
        if is_trend_template: checklist += 1
        volume_surge = vol_r > 1.5
        price_surge  = last.get("ROC10", 0) > 3
        pivot_resistance = d["High"].rolling(10).max().shift(1).iloc[-1]
        pivot_breakout = c > pivot_resistance
        tl_breakout   = self._check_trendline_breakout(d)
        dma20_break   = (c > last.get("MA20", 0)) and (d["Close"].shift(1).iloc[-1] <= d["MA20"].shift(1).iloc[-1])
        # MSB (Market Structure Break) - based on swing high/low breaks
        # Similar to BOS (Break of Structure) from the TradingView code
        swing_high = d["High"].rolling(5).max().shift(1).iloc[-1]   # 5-period swing high
        swing_low = d["Low"].rolling(5).min().shift(1).iloc[-1]     # 5-period swing low
        msb_breakout = c > swing_high  # Bullish MSB
        msb_breakdown = c < swing_low   # Bearish MSB
        msb = msb_breakout or msb_breakdown
        signals_history = self._compute_historical_signals(d)
        signals_summary = self._summarize_signals(signals_history)
        res = {
            "ticker": ticker,
            "name": ticker,
            "status": "Neutral",
            "score": round(composite, 1),
            "scores": {k: round(v, 1) for k, v in scores.items()},
            "checklist_str": f"{checklist}/7",
            "checklist": checklist,
            "stage": self._classify_stage(d),
            "trend_template": is_trend_template,
            "dist_low": round(last.get("DistLow52", 0.0), 1),
            "contractions": contractions,
            "signals": {
                "volume_surge":   volume_surge,
                "price_surge":    price_surge,
                "tl_breakout":    tl_breakout,
                "pivot_breakout": pivot_breakout,
                "dma20_break":    dma20_break,
                "msb":            msb,
            },
            "signals_history": signals_history,
            "signals_summary": signals_summary,
            "trendlines": self._compute_trendlines_for_chart(d),
            "last_price": round(c, 2),
            "rsi": round(last.get("RSI", 0), 1),
            "vol_ratio": round(vol_r, 2),
            "atr_pct": round(last.get("ATR_pct", 0), 2),
            "r1": round(last.get("R1", 0), 1),
            "r5": round(last.get("R5", 0), 1),
            "r21": round(last.get("R21", 0), 1),
            "r63": round(last.get("R63", 0), 1),
            "r126": round(last.get("R126", 0), 1),
            "rs": round(last.get("RS_Ratio", 0), 1),
            "rs_1y": round(last.get("ROC252", 0), 1),
            "pct_off_high": round(dist52, 1),
            "pivot_resistance": round(pivot_resistance, 2),
            "spark": str(last.get("Spark", "")),
            "trend": last.get("Trend_Score", 0.0),
            "bbw_pctl": round(last.get("BBW_pctl", 0.0), 1),
            "squeeze": bool(last.get("Squeeze", False)),
            "tight": int(last.get("Tight_Rank", 1)),
            "vdry": int(last.get("VDry", 0)),
            "hndl": round(last.get("Hndl", 0.0), 1),
            "adx": round(last.get("ADX", 0.0), 1),
            "rs_52w_high": bool(last.get("RS_52W_High", False)),
            "vol_dry_10w": bool(last.get("Vol_Dry_10W", False)),
            "atr_declining": bool(last.get("ATR_Declining", False)),
            "sma_stack": bool(last.get("SMA_Stack", False)),
            "sma200_slope": round(last.get("MA200_Slope", 0.0), 2),
            "cup_handle": bool(last.get("Cup_Handle", False)),
            "double_bottom": bool(last.get("Double_Bottom", False)),
            "market_health": bool(last.get("Market_Health", True)),
            "ad_ratio": round(last.get("AD_Ratio", 1.0), 2),
            "vcs": round(last.get("VCS", 50.0), 1),
            "tier_enc": int(last.get("Tier_Enc", 0)),
            "pdh_brk": bool(last.get("PDH_Brk", False)),
            "is_synthetic": bool(d.attrs.get("is_synthetic", False)),
            "sector": "Unknown",
            "cap": "Unknown",
        }
        # Enrich with metadata - only get name, skip sector and cap
        try:
            from ticker_metadata import get_metadata
            m = "IN" if "-EQ" in ticker else "US"
            meta = get_metadata(ticker, m)
            if meta:
                res["name"] = meta.get("name", ticker)
                # Skip sector and market cap
                res["sector"] = "Unknown"
                res["cap"] = "Unknown"
        except:
            pass
        # Technical Status (e.g. 5MA Safe)
        try:
            ma5 = d["Close"].rolling(5).mean().iloc[-1]
            if c > ma5:
                res["status"] = "5MA Safe"
            else:
                res["status"] = "Below 5MA"
            if is_trend_template:
                res["status"] = "Trend Confirmed"
        except:
            pass
        # Also store the full dataframe for chart (will be scrubbed in generate_cache if needed)
        res["df"] = d
        return res
    def _classify_stage(self, df: pd.DataFrame) -> int:
        last = df.iloc[-1]
        c    = last["Close"]
        try:
            m50  = last["MA50"];  m150 = last["MA150"]; m200 = last["MA200"]
            # Stage 2: Strong Uptrend (perfect stack)
            if c > m50 and m50 > m150 and m150 > m200: return 2
            # Stage 4: Downtrend (below all MAs, both MAs declining)
            if c < m150 and m150 < m200 and c < m200: return 4
            # Stage 3: Topping (below MA50 but above MA200, MA150 > MA200)
            if c < m50 and c > m200 and m150 > m200: return 3
            # Stage 1: Basing
            return 1
        except:
            return 1
    def _detect_contractions(self, df, ph_idx, pl_idx) -> list:
        contractions = []
        combined = sorted([(i,"H") for i in ph_idx] + [(i,"L") for i in pl_idx])
        combined = [(i, t) for i, t in combined if i > len(df) - 180] 
        i = 0
        while i < len(combined) - 1:
            idx_h, th = combined[i]
            idx_l, tl = combined[i+1]
            if th == "H" and tl == "L":
                high_price = df["High"].values[idx_h]
                low_price  = df["Low"].values[idx_l]
                depth_pct  = (high_price - low_price) / high_price * 100
                length     = idx_l - idx_h
                vol_during = df["Volume"].values[idx_h:idx_l+1].mean() if idx_l > idx_h else 0
                vol_before = df["Volume"].values[max(0,idx_h-20):idx_h].mean()
                vol_ratio  = vol_during / vol_before if vol_before > 0 else 1.0
                if depth_pct > 1.5:
                    contractions.append({
                        "high_idx": int(idx_h), "low_idx": int(idx_l),
                        "high_price": round(high_price, 2),
                        "low_price":  round(low_price, 2),
                        "depth_pct":  round(depth_pct, 1),
                        "length_bars": int(length),
                        "vol_ratio":   round(vol_ratio, 2),
                    })
            i += 1
        return contractions[-4:] if contractions else []

    def _compute_historical_signals(self, d: pd.DataFrame) -> dict:
        signals_history = {
            "volume_surge": [],
            "price_surge": [],
            "pivot_breakout": [],
            "tl_breakout": [],
            "dma20_break": [],
            "msb": [],
        }

        if len(d) < 20:
            return signals_history

        close_vals = d["Close"].values
        high_vals = d["High"].values
        low_vals = d["Low"].values
        vol_vals = d["Volume"].values

        vol_r = (d["Vol_Ratio"] if "Vol_Ratio" in d.columns else pd.Series([1.0]*len(d), index=d.index)).values
        roc10 = (d["ROC10"] if "ROC10" in d.columns else pd.Series([0.0]*len(d), index=d.index)).values
        ma20  = (d["MA20"]  if "MA20"  in d.columns else pd.Series([0.0]*len(d), index=d.index)).values
        close_shifted = pd.Series(close_vals).shift(1).values

        pivot_resistance_arr = pd.Series(high_vals).rolling(10).max().shift(1).values
        swing_high_arr = pd.Series(high_vals).rolling(5).max().shift(1).values
        swing_low_arr = pd.Series(low_vals).rolling(5).min().shift(1).values

        ma20_shifted = pd.Series(ma20).shift(1).values

        for i in range(20, len(d)):
            c = close_vals[i]
            prev_c = close_shifted[i]

            if vol_r[i] > 1.5:
                signals_history["volume_surge"].append({
                    "time": d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]),
                    "value": float(round(c, 2))
                })

            if roc10[i] > 3:
                signals_history["price_surge"].append({
                    "time": d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]),
                    "value": float(round(c, 2))
                })

            if c > pivot_resistance_arr[i]:
                signals_history["pivot_breakout"].append({
                    "time": d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]),
                    "value": float(round(c, 2))
                })

            if c > ma20[i] and prev_c <= ma20_shifted[i]:
                signals_history["dma20_break"].append({
                    "time": d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]),
                    "value": float(round(c, 2))
                })

            if c > swing_high_arr[i] or c < swing_low_arr[i]:
                signals_history["msb"].append({
                    "time": d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]),
                    "value": float(round(c, 2)),
                    "type": "breakout" if c > swing_high_arr[i] else "breakdown"
                })

        return signals_history

    def _summarize_signals(self, signals_history: dict) -> dict:
        today = pd.Timestamp.now().normalize()
        summary = {}
        for signal_name, events in signals_history.items():
            if not events or not isinstance(events, list):
                summary[signal_name] = {
                    "first_date": None, "last_date": None,
                    "days_active": 0, "days_since_last": 999,
                    "entry_warning": "LATE", "active": False
                }
                continue
            dates = [pd.to_datetime(e["time"]) for e in events if e.get("time")]
            if not dates:
                summary[signal_name] = {
                    "first_date": None, "last_date": None,
                    "days_active": 0, "days_since_last": 999,
                    "entry_warning": "LATE", "active": False
                }
                continue
            dates_sorted = sorted(dates)
            first_date = dates_sorted[0]
            last_date = dates_sorted[-1]
            days_active = len(dates_sorted)
            days_since_last = (today - last_date).days if pd.notna(last_date) else 999
            if days_since_last <= 0:
                entry_warning = "FRESH"
            elif days_since_last <= 3:
                entry_warning = "EARLY"
            elif days_since_last <= 10:
                entry_warning = "WATCH"
            else:
                entry_warning = "LATE"
            summary[signal_name] = {
                "first_date": first_date.strftime("%Y-%m-%d") if pd.notna(first_date) else None,
                "last_date": last_date.strftime("%Y-%m-%d") if pd.notna(last_date) else None,
                "days_active": days_active,
                "days_since_last": days_since_last,
                "entry_warning": entry_warning,
                "active": days_since_last <= 3
            }
        active_count = sum(1 for s in summary.values() if s.get("days_since_last", 999) <= 5)
        summary["_confluence"] = active_count
        return summary

    def _compute_trendlines_for_chart(self, d: pd.DataFrame) -> dict:
        tl = compute_trendlines(d)
        result = {}
        if "resistance" in tl:
            line_data = tl["resistance"]["line"]
            times = [d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]) for i in range(len(d))]
            result["resistance"] = [{"time": times[i], "value": float(round(line_data[i], 2))} for i in range(len(d))]
        if "support" in tl:
            line_data = tl["support"]["line"]
            times = [d.index[i].strftime("%Y-%m-%d") if hasattr(d.index[i], 'strftime') else str(d.index[i]) for i in range(len(d))]
            result["support"] = [{"time": times[i], "value": float(round(line_data[i], 2))} for i in range(len(d))]
        return result

    def _check_trendline_breakout(self, df) -> bool:
        tl = compute_trendlines(df)
        if "resistance" not in tl: return False
        res_line = tl["resistance"]["line"]
        c  = df["Close"].values[-1]
        r  = res_line[-1]
        return c > r
    def _empty(self, ticker):
        return {
            "ticker": ticker, "name": "", "sector": "", "cap": "",
            "score": 0, "stage": 1,
            "signals": {
                "volume_surge": False, "price_surge": False,
                "tl_breakout": False, "pivot_breakout": False,
                "dma20_break": False, "msb": False,
            },
            "contractions": [], "details": {}, "scores": {},
            "checklist": 0, "checklist_str": "0/7",
            "last_price": 0, "rsi": 0, "vol_ratio": 1,
            "atr_pct": 0, "r1": 0, "r5": 0, "r21": 0, "r63": 0, "r126": 0,
            "rs": 0, "rs_1y": 0, "pct_off_high": 0,
            "pivot_resistance": 0, "df": pd.DataFrame(),
            "is_synthetic": False,
        }
DETECTOR = VCPDetector()

def compute_universe_rs_rank(results: list[dict]) -> list[dict]:
    if not results:
        return results
    r126_vals = pd.Series([r.get("r126", 0) for r in results])
    r21_vals = pd.Series([r.get("r21", 0) for r in results])
    r63_vals = pd.Series([r.get("r63", 0) for r in results])
    rank_r126 = r126_vals.rank(pct=True) * 100
    rank_r21 = r21_vals.rank(pct=True) * 100
    rank_r63 = r63_vals.rank(pct=True) * 100
    for i, r in enumerate(results):
        r["rs_rank_6m"] = round(rank_r126.iloc[i], 1)
        rs_composite = 0.40 * rank_r21.iloc[i] + 0.40 * rank_r63.iloc[i] + 0.20 * rank_r126.iloc[i]
        r["rs_composite"] = round(rs_composite, 1)
        bonus = 0
        if rank_r126.iloc[i] >= 90:
            bonus = 20
        elif rank_r126.iloc[i] >= 75:
            bonus = 10
        elif rank_r126.iloc[i] >= 50:
            bonus = 5
        r["rs_bonus"] = bonus
        base_score = r.get("score", 0)
        r["score"] = min(100, round(base_score + bonus, 1))
    results = [r for r in results if r.get("rs_rank_6m", 0) >= 50]
    return results

def run_alpha_vcp_simulator(market: str, min_score: float = 60.0, days_list: tuple = (1, 2, 5), limit: int = 10, stop_pct: float = 7.0, target_pct: float = 20.0) -> dict:
    # Minimal mock logic for simulation to avoid huge data loads in API
    # Normally this loops over the universe and calculates forward PnL
    # For now, we will simulate 5 mock picks for each day in days_list
    results_by_day = {}
    for days_ago in days_list:
        picks = []
        for i in range(limit):
            p = round(np.random.uniform(50, 200), 2)
            exit_price = round(p * np.random.uniform(0.9, 1.3), 2)
            ret_pct = ((exit_price - p) / p) * 100
            status = "Target Hit" if ret_pct > 0 else "Stop Loss"
            picks.append({
                "ticker": f"MOCK{i}_{days_ago}",
                "score": round(np.random.uniform(min_score, 99), 1),
                "entry_price": p,
                "exit_price": exit_price,
                "return_pct": round(ret_pct, 2),
                "status": status,
                "target": round(p * (1.0 + target_pct/100.0), 2),
                "stop": round(p * (1.0 - stop_pct/100.0), 2)
            })
        results_by_day[str(days_ago)] = picks
    return results_by_day

"""
Ticker metadata cache — sector, market-cap bucket, display name.
Uses a local JSON cache so yfinance is only hit once per ticker.
"""
import os
import json
import logging

log = logging.getLogger(__name__)

_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs", "ticker_metadata_cache.json")
_metadata_cache: dict = {}
_cache_loaded = False


# ── Helpers ────────────────────────────────────────────────────────────────────

def _cap_bucket(market_cap, market: str = "IN") -> str:
    """Convert raw market-cap (USD/INR) to a human-readable bucket."""
    if not market_cap or market_cap <= 0:
        return "Unknown"
    if market == "IN":
        # INR values — Zerodha / yfinance returns INR for .NS
        if market_cap >= 2e12:    return "Large Cap"   # > 20,000 Cr
        if market_cap >= 5e11:    return "Mid Cap"     # 5,000–20,000 Cr
        return "Small Cap"
    else:
        # USD values
        if market_cap >= 2e10:    return "Large Cap"
        if market_cap >= 2e9:     return "Mid Cap"
        return "Small Cap"


_SECTOR_MAP = {
    "technology":           "Technology",
    "information technology": "Technology",
    "software":             "Technology",
    "financial services":   "Financial Services",
    "financials":           "Financial Services",
    "banking":              "Financial Services",
    "banks":                "Financial Services",
    "healthcare":           "Healthcare",
    "health care":          "Healthcare",
    "pharmaceuticals":      "Healthcare",
    "consumer discretionary": "Consumer Discretionary",
    "consumer staples":     "Consumer Staples",
    "fmcg":                 "Consumer Staples",
    "energy":               "Energy",
    "oil & gas":            "Energy",
    "materials":            "Materials",
    "metals & mining":      "Materials",
    "industrials":          "Industrials",
    "capital goods":        "Industrials",
    "utilities":            "Utilities",
    "real estate":          "Real Estate",
    "communication":        "Communication Services",
    "telecom":              "Communication Services",
    "automobile":           "Consumer Discretionary",
    "auto":                 "Consumer Discretionary",
}


def _normalize_sector(raw: str) -> str:
    if not raw or str(raw).strip().lower() in ("", "nan", "none", "unknown"):
        return "Unknown"
    key = str(raw).strip().lower()
    for k, v in _SECTOR_MAP.items():
        if k in key:
            return v
    return str(raw).strip().title()


# ── Cache I/O ──────────────────────────────────────────────────────────────────

def _ensure_cache() -> None:
    global _cache_loaded
    if _cache_loaded:
        return
    os.makedirs(os.path.dirname(_CACHE_FILE), exist_ok=True)
    if os.path.exists(_CACHE_FILE):
        try:
            with open(_CACHE_FILE, "r", encoding="utf-8") as f:
                _metadata_cache.update(json.load(f))
        except Exception as e:
            log.warning(f"[metadata] cache load error: {e}")
    _cache_loaded = True


def _persist_cache() -> None:
    try:
        os.makedirs(os.path.dirname(_CACHE_FILE), exist_ok=True)
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_metadata_cache, f, indent=2)
    except Exception as e:
        log.warning(f"[metadata] cache save error: {e}")


# ── Fetchers ───────────────────────────────────────────────────────────────────

def _fetch_from_yfinance(ticker: str, market: str) -> dict:
    """Fetch metadata from yfinance (one-time per ticker, then cached)."""
    try:
        import yfinance as yf
        # Indian tickers use .NS suffix on yfinance
        if market == "IN":
            base = ticker.replace("-EQ", "").replace(".BO", "")
            yf_ticker = f"{base}.NS"
        else:
            yf_ticker = ticker

        info = yf.Ticker(yf_ticker).info
        name = info.get("longName") or info.get("shortName") or ticker
        sector = _normalize_sector(info.get("sector", "Unknown"))
        cap = _cap_bucket(info.get("marketCap"), market)
        return {"name": name, "sector": sector, "cap": cap}
    except Exception as e:
        log.debug(f"[metadata] yfinance fetch failed for {ticker}: {e}")
        return {"name": ticker, "sector": "Unknown", "cap": "Unknown"}


# ── Public API ─────────────────────────────────────────────────────────────────

def get_metadata(ticker: str, market: str = "IN") -> dict:
    """
    Return {name, sector, cap} for a ticker.
    Checks in-memory cache first, then disk cache, then yfinance.
    Results are persisted to disk for future runs.
    """
    _ensure_cache()

    # Normalise key: strip exchange suffix, upper-case
    key = ticker.replace("-EQ", "").replace(".NS", "").replace(".BO", "").upper().strip()

    cached = _metadata_cache.get(key)
    if cached and cached.get("sector", "Unknown") not in ("Unknown", "") \
               and cached.get("cap", "Unknown") not in ("Unknown", ""):
        return cached

    # Fetch fresh
    meta = _fetch_from_yfinance(ticker, market)
    _metadata_cache[key] = meta

    # Persist asynchronously — don't block the scan pipeline
    try:
        _persist_cache()
    except Exception:
        pass

    return meta

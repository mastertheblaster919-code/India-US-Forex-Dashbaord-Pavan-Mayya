"""
ML Intelligence API Endpoints for FastAPI
Provides XGBoost-based ML predictions and pattern matching via REST API.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import pandas as pd
import numpy as np
from datetime import datetime
import pickle
import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from statistics import mean
import warnings
warnings.filterwarnings('ignore')

# ML imports with graceful fallback
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    xgb = None

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    shap = None

from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import confusion_matrix, roc_auc_score

# Import existing infrastructure
from data_manager import list_cached_dates, load_scan_cache
from engine import fetch_data

router = APIRouter(prefix="/api/ml", tags=["ml"])

# ==============================================================================
# CONSTANTS
# ==============================================================================

FEATURE_NAMES = sorted([
    "score", "checklist", "bbw_pctl", "rs_ratio", "vol_ratio", "rsi", "adx",
    "dist52", "dist_low", "trend_template", "tight", "wbase", "sqz", "tier_enc", "pdh_brk", "atr_pct",
    "trend", "r1", "r5", "r21", "r63", "stage", "num_contractions",
    "avg_contraction_depth", "avg_contraction_length", "vol_dry_up_in_contractions",
    "tl_breakout", "pivot_breakout", "volume_surge", "price_surge", "dma20_break",
    "score_tightness", "score_rs", "score_trend", "score_volume", "score_proximity",
    "rs_52w_high", "vol_dry_10w", "atr_declining", "sma_stack", "sma200_slope", "cup_handle", "double_bottom"
])

HORIZONS = [2, 5, 10]
WINNER_THRESHOLDS = {2: 3.0, 5: 5.0, 10: 8.0}
STOP_PCT = 7.0

# In-memory model cache
MODEL_CACHE = {}
TRAINING_DATA_CACHE = {}

# ==============================================================================
# PYDANTIC MODELS
# ==============================================================================

class ScanResult(BaseModel):
    ticker: str
    name: str = ""
    sector: str = ""
    cap: str = ""
    score: float = 0
    stage: int = 1
    checklist: int = 0
    checklist_str: str = ""
    rsi: float = 50
    vol_ratio: float = 1.0
    atr_pct: float = 0
    rs_1y: float = 100
    pct_off_high: float = 0
    pivot_resistance: float = 0
    last_price: float = 0
    r1: float = 0
    r5: float = 0
    r21: float = 0
    r63: float = 0
    r126: float = 0
    rs: float = 100
    bbw_pctl: float = 50
    adx: float = 0
    vol_r: float = 1.0
    trend: float = 0
    atr_p: float = 0
    dist52: float = 50
    dist_low: float = 0
    trend_template: bool = False
    tight: float = 1
    wbase: float = 0
    sqz: float = 0
    vdry: int = 0
    hndl: float = 0
    tier_enc: int = 0
    pdh_brk: bool = False
    contractions: List[Dict] = Field(default_factory=list)
    signals: Dict[str, bool] = Field(default_factory=dict)
    scores: Dict[str, float] = Field(default_factory=dict)

class FeatureVector(BaseModel):
    features: Dict[str, float]
    ticker: str

class TrainingDatasetRequest(BaseModel):
    market_key: str
    horizons: List[int] = [2, 5, 10]
    winner_thresholds: Dict[int, float] = {2: 3.0, 5: 5.0, 10: 8.0}
    stop_pct: float = 7.0

class TrainingDatasetResponse(BaseModel):
    success: bool
    message: str
    total_samples: int = 0
    unique_tickers: int = 0
    date_range: str = ""
    winners: int = 0
    losers: int = 0

class ModelMetrics(BaseModel):
    horizon: int
    auc: float
    auc_std: float
    n_train: int
    n_winners: int
    n_losers: int
    feature_importance: Dict[str, float]

class TrainModelsResponse(BaseModel):
    success: bool
    message: str
    models: List[ModelMetrics] = []

class PredictionRequest(BaseModel):
    results: List[Dict[str, Any]]
    horizon: int = 5

class PredictionResult(BaseModel):
    ticker: str
    probabilities: Dict[int, float]
    top_features: List[Dict[str, Any]]
    shap_data: Optional[Dict] = None

class PredictionResponse(BaseModel):
    success: bool
    predictions: List[PredictionResult]

class SimilarSetup(BaseModel):
    ticker: str
    scan_date: str
    similarity: float
    stage: int
    label: int
    horizon: int
    features: Dict[str, float]

class PatternMatcherRequest(BaseModel):
    ticker: str
    features: Dict[str, float]
    market_key: str
    n_neighbors: int = 5
    horizon_filter: Optional[int] = None

class PatternMatcherResponse(BaseModel):
    success: bool
    similar_setups: List[SimilarSetup]
    winner_percentages: Dict[int, float]

class ModelHealthResponse(BaseModel):
    success: bool
    models: List[ModelMetrics]
    confusion_matrices: Dict[int, List[List[int]]]
    correlation_matrix: Optional[List[List[float]]] = None
    feature_names: List[str]

# ==============================================================================
# FEATURE ENGINEERING
# ==============================================================================

def build_feature_vector(res: dict) -> dict:
    """Extract feature vector from scan result."""
    contractions = res.get("contractions", [])
    if contractions:
        depths = [c.get("depth_pct", 0) for c in contractions]
        lengths = [c.get("length_bars", 0) for c in contractions]
        vol_ratios = [c.get("vol_ratio", 1.0) for c in contractions]
        avg_depth = mean(depths) if depths else 0
        avg_length = mean(lengths) if lengths else 0
        avg_vol_ratio = mean(vol_ratios) if vol_ratios else 1.0
    else:
        avg_depth = 0
        avg_length = 0
        avg_vol_ratio = 1.0
    
    signals = res.get("signals", {})
    scores = res.get("scores", {})
    
    # Helper to get value and ensure it's not NaN
    def safe_get(key, default=0):
        val = res.get(key, default)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return default
        return val
    
    def safe_get_dict(d, key, default=0):
        val = d.get(key, default)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return default
        return val

    return {
        "score": safe_get("score", 0),
        "checklist": safe_get("checklist", 0),
        "bbw_pctl": safe_get("bbw_pctl", 50),
        "rs_ratio": safe_get("rs", safe_get("rs_ratio", safe_get("rs_1y", 100))),
        "vol_ratio": safe_get("vol_r", safe_get("vol_ratio", 1.0)),
        "rsi": safe_get("rsi", 50),
        "adx": safe_get("adx", 0),
        "dist52": safe_get("dist52", safe_get("pct_off_high", 50)),
        "dist_low": safe_get("dist_low", 0),
        "trend_template": int(safe_get("trend_template", False)),
        "tight": safe_get("tight", 1),
        "wbase": safe_get("wbase", 0),
        "sqz": int(safe_get("sqz", int(safe_get("squeeze", False)))),
        "tier_enc": safe_get("tier_enc", 0),
        "pdh_brk": int(safe_get("pdh_brk", False)),
        "atr_pct": safe_get("atr_p", safe_get("atr_pct", 0)),
        "trend": safe_get("trend", 0),
        "r1": safe_get("r1", 0),
        "r5": safe_get("r5", 0),
        "r21": safe_get("r21", 0),
        "r63": safe_get("r63", 0),
        "stage": safe_get("stage", 1),
        "num_contractions": len(contractions),
        "avg_contraction_depth": avg_depth if not np.isnan(avg_depth) else 0,
        "avg_contraction_length": avg_length if not np.isnan(avg_length) else 0,
        "vol_dry_up_in_contractions": avg_vol_ratio if not np.isnan(avg_vol_ratio) else 1.0,
        "tl_breakout": int(safe_get_dict(signals, "tl_breakout", False)),
        "pivot_breakout": int(safe_get_dict(signals, "pivot_breakout", False)),
        "volume_surge": int(safe_get_dict(signals, "volume_surge", False)),
        "price_surge": int(safe_get_dict(signals, "price_surge", False)),
        "dma20_break": int(safe_get_dict(signals, "dma20_break", False)),
        "score_tightness": safe_get_dict(scores, "tightness", 50),
        "score_rs": safe_get_dict(scores, "rs", 50),
        "score_trend": safe_get_dict(scores, "trend", 50),
        "score_volume": safe_get_dict(scores, "volume", 50),
        "score_proximity": safe_get_dict(scores, "proximity", 50),
        # Superior Indicators
        "rs_52w_high": float(safe_get("rs_52w_high", 0)),
        "vol_dry_10w": float(safe_get("vol_dry_10w", 0)),
        "atr_declining": float(safe_get("atr_declining", 0)),
        "sma_stack": float(safe_get("sma_stack", 0)),
        "sma200_slope": float(safe_get("sma200_slope", 0)),
        "cup_handle": float(safe_get("cup_handle", 0)),
        "double_bottom": float(safe_get("double_bottom", 0)),
    }

# ==============================================================================
# TRAINING DATASET BUILDER
# ==============================================================================

def _get_entry_price_and_label(df: pd.DataFrame, scan_date_str: str, horizon: int, 
                                winner_threshold: float, stop_pct: float) -> tuple:
    """Find entry price and determine label based on forward performance."""
    try:
        scan_date = pd.Timestamp(scan_date_str).normalize()
        
        if scan_date not in df.index:
            valid_dates = df.index[df.index <= scan_date]
            if len(valid_dates) == 0:
                return None, None
            scan_date = valid_dates[-1]
        
        entry_idx = df.index.get_loc(scan_date)
        if entry_idx >= len(df) - 1:
            return None, None
        
        entry_price = df.iloc[entry_idx]["Close"]
        if pd.isna(entry_price) or entry_price <= 0:
            return None, None
        
        target_price = entry_price * (1 + winner_threshold / 100)
        stop_price = entry_price * (1 - stop_pct / 100)
        
        end_idx = min(entry_idx + horizon, len(df) - 1)
        forward_df = df.iloc[entry_idx + 1:end_idx + 1]
        
        if len(forward_df) == 0:
            return entry_price, None
        
        for _, row in forward_df.iterrows():
            if row["Low"] <= stop_price:
                return entry_price, 0
            if row["High"] >= target_price:
                return entry_price, 1
        
        return entry_price, None
    except Exception:
        return None, None


def _process_single_result(args: tuple) -> list:
    """Process a single scan result for all horizons."""
    r, scan_date, market_key, horizons, winner_thresholds, stop_pct = args
    
    rows = []
    
    # FILTER: Only train on stocks in a strong uptrend (Minervini Stage 2 logic)
    if r.get('stage', 1) != 2:
        return rows
    
    ticker = r.get("ticker")
    if not ticker:
        return rows
    
    try:
        df = fetch_data(ticker, "1y", market=market_key)
        if df is None or df.empty or len(df) < 60:
            return rows
        
        # New features from engine.py
        dist52 = r.get('dist52', r.get('pct_off_high', 0))
        dist_low = r.get('dist_low', 0)
        trend_template = int(r.get('trend_template', False))
        
        features = {
            "score": r.get('score', 0),
            "checklist": r.get('checklist', 0),
            "bbw_pctl": r.get('bbw_pctl', 50),
            "rs_ratio": r.get('rs', 100),
            "vol_ratio": r.get('vol_ratio', 1.0),
            "rsi": r.get('rsi', 50),
            "adx": r.get('adx', 20),
            "dist52": dist52,
            "dist_low": dist_low,
            "trend_template": trend_template,
            "tight": r.get('tight', 1),
            "wbase": r.get('wbase', 0),
            "sqz": int(r.get('squeeze', False)),
            "tier_enc": r.get('tier_enc', 0),
            "pdh_brk": int(r.get('pdh_brk', False)),
            "atr_pct": r.get('atr_pct', 0),
            "trend": r.get('trend', 0),
            "r1": r.get('r1', 0),
            "r5": r.get('r5', 0),
            "r21": r.get('r21', 0),
            "r63": r.get('r63', 0),
            "stage": r.get('stage', 1),
            "num_contractions": len(r.get("contractions", [])),
            "avg_contraction_depth": mean([c.get("depth_pct", 0) for c in r.get("contractions", [])]) if r.get("contractions") else 0,
            "avg_contraction_length": mean([c.get("length_bars", 0) for c in r.get("contractions", [])]) if r.get("contractions") else 0,
            "vol_dry_up_in_contractions": mean([c.get("vol_ratio", 1.0) for c in r.get("contractions", [])]) if r.get("contractions") else 1.0,
            "tl_breakout": int(r.get('signals', {}).get('tl_breakout', False)),
            "pivot_breakout": int(r.get('signals', {}).get('pivot_breakout', False)),
            "volume_surge": int(r.get('signals', {}).get('volume_surge', False)),
            "price_surge": int(r.get('signals', {}).get('price_surge', False)),
            "dma20_break": int(r.get('signals', {}).get('dma20_break', False)),
            "score_tightness": r.get('scores', {}).get('tightness', 0),
            "score_rs": r.get('scores', {}).get('rs', 0),
            "score_trend": r.get('scores', {}).get('trend', 0),
            "score_volume": r.get('scores', {}).get('volume', 0),
            "score_proximity": r.get('scores', {}).get('proximity', 0)
        }
        
        for horizon in horizons:
            entry_price, label = _get_entry_price_and_label(
                df, scan_date, horizon, winner_thresholds[horizon], stop_pct
            )
            
            if label is not None and entry_price is not None:
                row = {
                    "ticker": ticker,
                    "scan_date": scan_date,
                    "horizon": horizon,
                    "entry_price": entry_price,
                    "label": label,
                }
                row.update(features)
                rows.append(row)
    except Exception:
        pass
    
    return rows


async def build_training_dataset_async(market_key: str, horizons: list = None,
                                       winner_threshold_pct: dict = None,
                                       stop_pct: float = 7.0) -> pd.DataFrame:
    """Build training dataset from historical scan cache."""
    if horizons is None:
        horizons = HORIZONS
    if winner_threshold_pct is None:
        winner_threshold_pct = WINNER_THRESHOLDS
    
    cached_dates = list_cached_dates(market_key)
    if not cached_dates:
        return pd.DataFrame()
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    historical_dates = [d for d in cached_dates if d != today_str]
    
    # Limit to most recent 30 trading days to keep training time reasonable
    historical_dates = historical_dates[:30]
    
    if not historical_dates:
        return pd.DataFrame()
    
    all_rows = []
    
    for scan_date in historical_dates:
        try:
            results = load_scan_cache(market_key, scan_date)
            if not results:
                continue
            
            args_list = [
                (res, scan_date, market_key, horizons, winner_threshold_pct, stop_pct)
                for res in results
            ]
            
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = [executor.submit(_process_single_result, args) for args in args_list]
                for future in as_completed(futures):
                    try:
                        rows = future.result()
                        all_rows.extend(rows)
                    except Exception:
                        continue
        except Exception:
            continue
    
    if len(all_rows) < 50:
        return pd.DataFrame()
    
    return pd.DataFrame(all_rows)

# ==============================================================================
# MODEL TRAINING
# ==============================================================================

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs", "models")
os.makedirs(MODEL_DIR, exist_ok=True)


def _persist_models(models: dict, market_key: str) -> None:
    """Save trained models to disk for persistence across server restarts."""
    import pickle
    for horizon, model_data in models.items():
        model_copy = {
            "model": model_data["model"],
            "scaler": model_data["scaler"],
            "auc": model_data["auc"],
            "auc_std": model_data["auc_std"],
            "feature_importance": model_data["feature_importance"],
            "n_train": model_data["n_train"],
            "n_winners": model_data["n_winners"],
            "n_losers": model_data["n_losers"],
            "trained_at": datetime.now().isoformat(),
        }
        path = os.path.join(MODEL_DIR, f"vcp_model_{market_key}_H{horizon}.pkl")
        with open(path, "wb") as f:
            pickle.dump(model_copy, f)
    metadata_path = os.path.join(MODEL_DIR, f"vcp_models_{market_key}_meta.json")
    meta = {
        "market": market_key,
        "trained_at": datetime.now().isoformat(),
        "horizons": list(models.keys()),
        "aucs": {str(h): m["auc"] for h, m in models.items()},
    }
    with open(metadata_path, "w") as f:
        json.dump(meta, f, indent=2)


def _load_models(market_key: str) -> dict:
    """Load persisted models from disk."""
    import pickle
    models = {}
    metadata_path = os.path.join(MODEL_DIR, f"vcp_models_{market_key}_meta.json")
    if not os.path.exists(metadata_path):
        return models
    try:
        with open(metadata_path, "r") as f:
            meta = json.load(f)
        for horizon in HORIZONS:
            path = os.path.join(MODEL_DIR, f"vcp_model_{market_key}_H{horizon}.pkl")
            if os.path.exists(path):
                with open(path, "rb") as f:
                    model_data = pickle.load(f)
                models[horizon] = model_data
        return models
    except Exception:
        return models


def _get_cv_score_timeseries(X: np.ndarray, y: np.ndarray, model_template: xgb.XGBClassifier) -> tuple:
    """Get CV score using TimeSeriesSplit (proper for financial data).

    TimeSeriesSplit respects temporal ordering — no look-ahead bias.
    Unlike StratifiedKFold which randomly shuffles, this walks forward through time.
    """
    from sklearn.model_selection import TimeSeriesSplit
    tscv = TimeSeriesSplit(n_splits=min(5, len(X) // 20))
    auc_scores = []
    for train_idx, val_idx in tscv.split(X):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        if len(np.unique(y_train)) < 2 or len(np.unique(y_val)) < 2:
            continue
        m = model_template.__class__(**model_template.get_params())
        m.fit(X_train, y_train)
        try:
            from sklearn.metrics import roc_auc_score
            proba = m.predict_proba(X_val)[:, 1]
            auc = roc_auc_score(y_val, proba)
            auc_scores.append(auc)
        except Exception:
            continue
    return (float(np.mean(auc_scores)) if auc_scores else 0.5,
            float(np.std(auc_scores)) if auc_scores else 0.0)


def train_vcp_models(df_train: pd.DataFrame, market_key: str = "IN",
                     persist: bool = True) -> dict:
    """Train XGBoost models for each horizon using TimeSeriesSplit."""
    if not XGBOOST_AVAILABLE:
        return {}
    if df_train.empty or len(df_train) < 50:
        return {}
    models = {}
    for horizon in HORIZONS:
        df_h = df_train[df_train["horizon"] == horizon].copy()
        if len(df_h) < 30:
            continue
        df_h = df_h.sort_values("scan_date")
        X = df_h[FEATURE_NAMES].values
        y = df_h["label"].values
        if len(np.unique(y)) < 2:
            continue
        n_neg = np.sum(y == 0)
        n_pos = np.sum(y == 1)
        scale_pos_weight = n_neg / max(n_pos, 1)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        model = xgb.XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            eval_metric="logloss", random_state=42
        )
        auc_mean, auc_std = _get_cv_score_timeseries(X_scaled, y, model)
        model.fit(X_scaled, y)
        importance = pd.Series(
            model.feature_importances_, index=FEATURE_NAMES
        ).sort_values(ascending=False)
        models[horizon] = {
            "model": model, "scaler": scaler,
            "auc": auc_mean, "auc_std": auc_std,
            "feature_importance": importance.to_dict(),
            "n_train": len(df_h),
            "n_winners": int(n_pos), "n_losers": int(n_neg),
        }
    if persist and models:
        _persist_models(models, market_key)
    return models

# ==============================================================================
# PREDICTION
# ==============================================================================

def predict_with_models(results: List[dict], models: dict, horizon: int) -> List[PredictionResult]:
    """Generate predictions for scan results."""
    predictions = []
    
    for res in results:
        features = build_feature_vector(res)
        feature_vector = np.array([[features.get(f, 0) for f in FEATURE_NAMES]])
        
        probs = {}
        for h in HORIZONS:
            if h in models:
                model = models[h]["model"]
                scaler = models[h]["scaler"]
                
                try:
                    X_scaled = scaler.transform(feature_vector)
                    prob = model.predict_proba(X_scaled)[0][1]
                    if np.isnan(prob):
                        prob = 0.5
                except Exception:
                    prob = 0.5
                
                probs[h] = float(prob)
            else:
                probs[h] = 0.5
        
        # Get top features from feature importance
        top_features = []
        if horizon in models:
            importance = models[horizon]["feature_importance"]
            sorted_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:3]
            for feat, imp in sorted_features:
                val = features.get(feat, 0)
                top_features.append({
                    "name": feat,
                    "importance": float(imp),
                    "value": float(val)
                })
        
        predictions.append(PredictionResult(
            ticker=res.get("ticker", "Unknown"),
            probabilities=probs,
            top_features=top_features,
            shap_data=None  # Can be added if SHAP available
        ))
    
    return predictions

# ==============================================================================
# KNN PATTERN MATCHER
# ==============================================================================

def find_similar_setups(current_features: dict, df_train: pd.DataFrame, 
                       n_neighbors: int = 5, horizon_filter: int = None) -> pd.DataFrame:
    """Find K-nearest neighbors based on feature similarity."""
    if df_train.empty or len(df_train) < n_neighbors:
        return pd.DataFrame()
    
    df_query = df_train.copy()
    if horizon_filter is not None:
        df_query = df_query[df_query["horizon"] == horizon_filter]
    
    if len(df_query) < n_neighbors:
        df_query = df_train.copy()
    
    X_train = df_query[FEATURE_NAMES].values
    query_vector = np.array([[current_features.get(f, 0) for f in FEATURE_NAMES]])
    
    knn = NearestNeighbors(n_neighbors=min(n_neighbors, len(df_query)), metric="cosine")
    knn.fit(X_train)
    
    distances, indices = knn.kneighbors(query_vector)
    
    similar_setups = []
    for dist, idx in zip(distances[0], indices[0]):
        setup = df_query.iloc[idx].to_dict()
        similarity_pct = (1 - dist) * 100
        setup["similarity"] = similarity_pct
        setup["rank"] = len(similar_setups) + 1
        similar_setups.append(setup)
    
    return pd.DataFrame(similar_setups)

# ==============================================================================
# API ENDPOINTS
# ==============================================================================

@router.post("/build-dataset", response_model=TrainingDatasetResponse)
async def build_dataset(request: TrainingDatasetRequest, background_tasks: BackgroundTasks):
    """Build training dataset from historical scan cache."""
    try:
        df = await build_training_dataset_async(
            request.market_key,
            request.horizons,
            request.winner_thresholds,
            request.stop_pct
        )
        
        if df.empty:
            return TrainingDatasetResponse(
                success=False,
                message="Insufficient training data. Need at least 50 samples."
            )
        
        # Cache the training data
        cache_key = f"{request.market_key}"
        TRAINING_DATA_CACHE[cache_key] = df
        
        winners = int((df["label"] == 1).sum())
        losers = int((df["label"] == 0).sum())
        
        return TrainingDatasetResponse(
            success=True,
            message=f"Successfully built training dataset",
            total_samples=len(df),
            unique_tickers=df["ticker"].nunique(),
            date_range=f"{df['scan_date'].min()} to {df['scan_date'].max()}",
            winners=winners,
            losers=losers
        )
    except Exception as e:
        return TrainingDatasetResponse(
            success=False,
            message=f"Error building dataset: {str(e)}"
        )


@router.post("/train-models", response_model=TrainModelsResponse)
async def train_models(request: TrainingDatasetRequest):
    """Train XGBoost models for each horizon."""
    try:
        cache_key = f"{request.market_key}"
        
        # Get or build training data
        if cache_key not in TRAINING_DATA_CACHE:
            df = await build_training_dataset_async(
                request.market_key,
                request.horizons,
                request.winner_thresholds,
                request.stop_pct
            )
            if df.empty:
                return TrainModelsResponse(
                    success=False,
                    message="No training data available. Build dataset first."
                )
            TRAINING_DATA_CACHE[cache_key] = df
        else:
            df = TRAINING_DATA_CACHE[cache_key]
        
        # Train models
        models = train_vcp_models(df, market_key=request.market_key, persist=True)

        if not models:
            return TrainModelsResponse(
                success=False,
                message="Model training failed. Check dataset has both winners and losers."
            )

        # Cache models in memory + persist to disk
        MODEL_CACHE[cache_key] = models
        
        # Convert to response format
        model_metrics = []
        for horizon, m in models.items():
            model_metrics.append(ModelMetrics(
                horizon=horizon,
                auc=m["auc"],
                auc_std=m["auc_std"],
                n_train=m["n_train"],
                n_winners=m["n_winners"],
                n_losers=m["n_losers"],
                feature_importance=m["feature_importance"]
            ))
        
        return TrainModelsResponse(
            success=True,
            message=f"Successfully trained {len(models)} models",
            models=model_metrics
        )
    except Exception as e:
        return TrainModelsResponse(
            success=False,
            message=f"Error training models: {str(e)}"
        )


@router.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """Generate ML predictions for scan results.

    Loads models from disk if not in memory cache (survives server restart).
    """
    try:
        cache_key = request.market_key if hasattr(request, 'market_key') else "IN"
        if cache_key not in MODEL_CACHE:
            loaded = _load_models(cache_key)
            if loaded:
                MODEL_CACHE[cache_key] = loaded
            else:
                return PredictionResponse(
                    success=False,
                    predictions=[],
                    message="No trained models found. Train models first."
                )
        models = MODEL_CACHE[cache_key]
        
        # Results are already dicts
        predictions = predict_with_models(request.results, models, request.horizon)
        
        return PredictionResponse(
            success=True,
            predictions=predictions
        )
    except Exception as e:
        return PredictionResponse(
            success=False,
            predictions=[]
        )


@router.post("/pattern-match", response_model=PatternMatcherResponse)
async def pattern_match(request: PatternMatcherRequest):
    """Find similar historical setups using KNN."""
    try:
        cache_key = request.market_key
        if cache_key not in TRAINING_DATA_CACHE:
            return PatternMatcherResponse(
                success=False,
                similar_setups=[],
                winner_percentages={}
            )
        
        df_train = TRAINING_DATA_CACHE[cache_key]
        
        similar_df = find_similar_setups(
            request.features,
            df_train,
            request.n_neighbors,
            request.horizon_filter
        )
        
        if similar_df.empty:
            return PatternMatcherResponse(
                success=False,
                similar_setups=[],
                winner_percentages={}
            )
        
        # Convert to response format
        similar_setups = []
        for _, row in similar_df.iterrows():
            similar_setups.append(SimilarSetup(
                ticker=row.get("ticker", "Unknown"),
                scan_date=str(row.get("scan_date", "")),
                similarity=float(row.get("similarity", 0)),
                stage=int(row.get("stage", 1)),
                label=int(row.get("label", 0)),
                horizon=int(row.get("horizon", 2)),
                features={f: float(row.get(f, 0)) for f in FEATURE_NAMES[:10]}
            ))
        
        # Calculate winner percentages by horizon
        winner_pcts = {}
        for h in [2, 5, 10]:
            h_setups = similar_df[similar_df["horizon"] == h]
            if len(h_setups) > 0:
                winner_pcts[h] = float((h_setups["label"] == 1).mean() * 100)
        
        return PatternMatcherResponse(
            success=True,
            similar_setups=similar_setups,
            winner_percentages=winner_pcts
        )
    except Exception as e:
        return PatternMatcherResponse(
            success=False,
            similar_setups=[],
            winner_percentages={}
        )


@router.get("/model-health/{market_key}", response_model=ModelHealthResponse)
async def model_health(market_key: str):
    """Get model health metrics and diagnostics."""
    try:
        if market_key not in MODEL_CACHE:
            return ModelHealthResponse(
                success=False,
                models=[],
                confusion_matrices={},
                feature_names=FEATURE_NAMES
            )
        
        if market_key not in TRAINING_DATA_CACHE:
            return ModelHealthResponse(
                success=False,
                models=[],
                confusion_matrices={},
                feature_names=FEATURE_NAMES
            )
        
        models = MODEL_CACHE[market_key]
        df_train = TRAINING_DATA_CACHE[market_key]
        
        # Build model metrics
        model_metrics = []
        confusion_matrices = {}
        
        for horizon, m in models.items():
            model_metrics.append(ModelMetrics(
                horizon=horizon,
                auc=m["auc"],
                auc_std=m["auc_std"],
                n_train=m["n_train"],
                n_winners=m["n_winners"],
                n_losers=m["n_losers"],
                feature_importance=m["feature_importance"]
            ))
            
            # Compute confusion matrix
            df_h = df_train[df_train["horizon"] == horizon]
            if len(df_h) > 0:
                X = df_h[FEATURE_NAMES].values
                y_true = df_h["label"].values
                
                try:
                    X_scaled = m["scaler"].transform(X)
                    y_pred = m["model"].predict(X_scaled)
                    cm = confusion_matrix(y_true, y_pred).tolist()
                    confusion_matrices[horizon] = cm
                except Exception:
                    confusion_matrices[horizon] = [[0, 0], [0, 0]]
        
        # Compute correlation matrix
        corr_matrix = None
        if not df_train.empty:
            corr = df_train[FEATURE_NAMES].corr()
            corr_matrix = corr.values.tolist()
        
        return ModelHealthResponse(
            success=True,
            models=model_metrics,
            confusion_matrices=confusion_matrices,
            correlation_matrix=corr_matrix,
            feature_names=FEATURE_NAMES
        )
    except Exception as e:
        return ModelHealthResponse(
            success=False,
            models=[],
            confusion_matrices={},
            feature_names=FEATURE_NAMES
        )


@router.get("/status/{market_key}")
async def ml_status(market_key: str):
    """Get ML system status."""
    cached_dates = list_cached_dates(market_key)
    has_training_data = market_key in TRAINING_DATA_CACHE
    has_models = market_key in MODEL_CACHE
    
    training_data_info = None
    if has_training_data:
        df = TRAINING_DATA_CACHE[market_key]
        training_data_info = {
            "total_samples": len(df),
            "unique_tickers": df["ticker"].nunique(),
            "date_range": f"{df['scan_date'].min()} to {df['scan_date'].max()}",
            "winners": int((df["label"] == 1).sum()),
            "losers": int((df["label"] == 0).sum())
        }
    
    model_info = None
    if has_models:
        models = MODEL_CACHE[market_key]
        model_info = {
            "trained_models": len(models),
            "horizons": list(models.keys())
        }
    
    return {
        "market_key": market_key,
        "xgb_available": XGBOOST_AVAILABLE,
        "shap_available": SHAP_AVAILABLE,
        "cache_dates_available": len(cached_dates),
        "has_training_data": has_training_data,
        "has_models": has_models,
        "training_data": training_data_info,
        "models": model_info
    }


class CopyWinnerRequest(BaseModel):
    ticker: str
    market_key: str = "IN"
    n_similar: int = 10
    horizon: int = 5
    scan_date: str = ""  # Optional: specific date to use for copy winner


class CopyWinnerMatch(BaseModel):
    ticker: str
    name: str
    sector: str
    cap: str
    last_price: float
    score: float
    stage: int
    similarity: float
    ml_probability: float
    feature_comparison: Dict[str, Dict[str, float]]


class CopyWinnerResponse(BaseModel):
    success: bool
    message: str
    source_ticker: str
    source_features: Dict[str, float]
    matches: List[CopyWinnerMatch]
    generated_at: str


class PresetScanRequest(BaseModel):
    preset_id: str
    market_key: str = "IN"
    n_results: int = 20


class PresetMatch(BaseModel):
    ticker: str
    name: str
    sector: str
    cap: str
    last_price: float
    score: float
    stage: int
    match_score: float
    features: Dict[str, Any]


class PresetScanResponse(BaseModel):
    success: bool
    message: str
    preset_id: str
    preset_name: str
    matches: List[PresetMatch]
    generated_at: str


class TopPick(BaseModel):
    rank: int
    ticker: str
    name: str
    sector: str
    cap: str
    last_price: float
    score: float
    ml_probability: float
    avg_probability: float
    horizon: int
    top_features: List[Dict[str, Any]]
    stage: int
    checklist: int
    rsi: float
    rs_1y: float
    trend_template: bool = False
    dist_low: float = 0


class TopPicksResponse(BaseModel):
    success: bool
    message: str
    picks: List[TopPick] = []
    generated_at: str


@router.post("/top-picks/{market_key}", response_model=TopPicksResponse)
async def get_top_picks(market_key: str, request: PredictionRequest):
    """Get top 10 ML picks based on prediction probabilities."""
    try:
        if market_key not in MODEL_CACHE:
            return TopPicksResponse(
                success=False,
                message="No trained models available. Train models first.",
                picks=[],
                generated_at=datetime.now().isoformat()
            )
        
        models = MODEL_CACHE[market_key]
        
        # Results are already dicts
        results_dicts = request.results
        
        # PRE-FILTER: Strictly enforce Stage 2 trend for VCP Picking
        stage2_results = [r for r in results_dicts if r.get("stage") == 2 or r.get("trend_template")]
        use_results = stage2_results if len(stage2_results) >= 5 else results_dicts
        
        # Generate predictions for all results
        predictions = predict_with_models(use_results, models, request.horizon)
        
        # Combine predictions with result data and sort by ML probability
        picks_with_scores = []
        for pred, res in zip(predictions, use_results):
            avg_prob = sum(pred.probabilities.values()) / len(pred.probabilities) if pred.probabilities else 0.5
            picks_with_scores.append({
                "prediction": pred,
                "result": res,
                "avg_probability": avg_prob,
                "primary_probability": pred.probabilities.get(request.horizon, 0.5)
            })
        
        # Sort by primary horizon probability descending
        picks_with_scores.sort(key=lambda x: x["primary_probability"], reverse=True)
        
        # Take top 10
        top_picks = picks_with_scores[:10]
        
        # Build response
        picks_response = []
        for rank, pick_data in enumerate(top_picks, 1):
            res = pick_data["result"]
            pred = pick_data["prediction"]
            
            picks_response.append(TopPick(
                rank=rank,
                ticker=res.get("ticker", "Unknown"),
                name=res.get("name", ""),
                sector=res.get("sector", ""),
                cap=res.get("cap", ""),
                last_price=res.get("last_price", 0),
                score=res.get("score", 0),
                ml_probability=pick_data["primary_probability"],
                avg_probability=pick_data["avg_probability"],
                horizon=request.horizon,
                top_features=pred.top_features[:3],
                stage=res.get("stage", 1),
                checklist=res.get("checklist", 0),
                rsi=res.get("rsi", 50),
                rs_1y=res.get("rs_1y", 100),
                trend_template=bool(res.get("trend_template", False)),
                dist_low=float(res.get("dist_low", 0))
            ))
        
        return TopPicksResponse(
            success=True,
            message=f"Top {len(picks_response)} ML picks generated",
            picks=picks_response,
            generated_at=datetime.now().isoformat()
        )
    except Exception as e:
        return TopPicksResponse(
            success=False,
            message=f"Error generating top picks: {str(e)}",
            picks=[],
            generated_at=datetime.now().isoformat()
        )


@router.post("/copy-winner", response_model=CopyWinnerResponse)
async def copy_winner(request: CopyWinnerRequest):
    """
    Copy the Winner: Select a winning stock and find similar VCP setups
    from the current scan results using ML feature similarity (KNN).
    """
    try:
        cache_key = request.market_key

        # Load scan results - use provided date or latest
        from data_manager import list_cached_dates, load_scan_cache
        cached_dates = list_cached_dates(cache_key)
        if not cached_dates:
            return CopyWinnerResponse(
                success=False,
                message="No scan data available. Run a scan first.",
                source_ticker=request.ticker,
                source_features={},
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        # Use provided scan_date or fall back to latest
        if request.scan_date and request.scan_date in cached_dates:
            target_date = request.scan_date
        else:
            target_date = cached_dates[0]

        all_results = load_scan_cache(cache_key, target_date)
        if not all_results:
            return CopyWinnerResponse(
                success=False,
                message="No scan results found for latest date.",
                source_ticker=request.ticker,
                source_features={},
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        # Find the source ticker in scan results
        source_result = None
        for r in all_results:
            if r.get("ticker", "").upper() == request.ticker.upper():
                source_result = r
                break

        if not source_result:
            return CopyWinnerResponse(
                success=False,
                message=f"Ticker {request.ticker} not found in latest scan results.",
                source_ticker=request.ticker,
                source_features={},
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        # Build feature vector for the source stock
        source_features = build_feature_vector(source_result)

        # Build feature matrix for all other stocks in scan
        candidates = [r for r in all_results if r.get("ticker", "").upper() != request.ticker.upper()]
        if not candidates:
            return CopyWinnerResponse(
                success=False,
                message="No other stocks to compare against.",
                source_ticker=request.ticker,
                source_features=source_features,
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        # Build feature matrix with NaN handling
        candidate_features = []
        for r in candidates:
            fv = build_feature_vector(r)
            candidate_features.append(fv)

        # Convert to numpy arrays, replacing NaN with 0
        X_candidates = np.array([[fv.get(f, 0) if not np.isnan(fv.get(f, 0)) else 0 for f in FEATURE_NAMES] for fv in candidate_features])
        query_vector = np.array([[source_features.get(f, 0) if not np.isnan(source_features.get(f, 0)) else 0 for f in FEATURE_NAMES]])

        # Scale features for better distance computation
        scaler = StandardScaler()
        all_vectors = np.vstack([query_vector, X_candidates])
        all_scaled = scaler.fit_transform(all_vectors)
        query_scaled = all_scaled[0:1]
        candidates_scaled = all_scaled[1:]

        # KNN to find similar setups
        n_neighbors = min(request.n_similar, len(candidates))
        knn = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
        knn.fit(candidates_scaled)
        distances, indices = knn.kneighbors(query_scaled)

        # Get ML predictions if models are available
        has_models = cache_key in MODEL_CACHE
        models = MODEL_CACHE.get(cache_key, {})

        # Build response matches
        matches = []
        for dist, idx in zip(distances[0], indices[0]):
            candidate = candidates[idx]
            similarity = (1 - dist) * 100

            # ML probability
            ml_prob = 0.5
            if has_models and request.horizon in models:
                try:
                    fv = candidate_features[idx]
                    feat_vector = np.array([[fv.get(f, 0) for f in FEATURE_NAMES]])
                    model_data = models[request.horizon]
                    X_s = model_data["scaler"].transform(feat_vector)
                    ml_prob = float(model_data["model"].predict_proba(X_s)[0][1])
                    if np.isnan(ml_prob):
                        ml_prob = 0.5
                except Exception:
                    ml_prob = 0.5

            # Feature comparison (top 8 VCP-rich features)
            key_features = ["score", "tight", "bbw_pctl", "rs_ratio", "rsi", "adx", "vol_ratio", "stage"]
            comparison = {}
            for feat in key_features:
                comparison[feat] = {
                    "source": float(source_features.get(feat, 0)),
                    "match": float(candidate_features[idx].get(feat, 0))
                }

            matches.append(CopyWinnerMatch(
                ticker=candidate.get("ticker", "Unknown"),
                name=candidate.get("name", ""),
                sector=candidate.get("sector", "Unknown"),
                cap=candidate.get("cap", "Unknown"),
                last_price=float(candidate.get("last_price", 0)),
                score=float(candidate.get("score", 0)),
                stage=int(candidate.get("stage", 1)),
                similarity=float(similarity),
                ml_probability=ml_prob,
                feature_comparison=comparison
            ))

        # Sort by similarity descending
        matches.sort(key=lambda m: m.similarity, reverse=True)

        return CopyWinnerResponse(
            success=True,
            message=f"Found {len(matches)} similar setups to {request.ticker}",
            source_ticker=request.ticker,
            source_features={k: float(v) for k, v in source_features.items()},
            matches=matches,
            generated_at=datetime.now().isoformat()
        )

    except Exception as e:
        return CopyWinnerResponse(
            success=False,
            message=f"Error finding similar setups: {str(e)}",
            source_ticker=request.ticker,
            source_features={},
            matches=[],
            generated_at=datetime.now().isoformat()
        )


# Preset VCP Breakout configurations
PRESET_CONFIGS = {
    "vcp_classic": {
        "name": "Classic VCP",
        "features": {"score": 80, "tight": 80, "bbw_pctl": 20, "rs_ratio": 105, "vol_ratio": 1.2},
        "weights": {"score": 0.25, "tight": 0.25, "bbw_pctl": 0.2, "rs_ratio": 0.15, "vol_ratio": 0.15}
    },
    "vcp_early": {
        "name": "Early VCP",
        "features": {"score": 70, "tight": 70, "bbw_pctl": 30, "rs_ratio": 102, "stage": 2},
        "weights": {"score": 0.3, "tight": 0.2, "bbw_pctl": 0.2, "rs_ratio": 0.1, "stage": 0.2}
    },
    "squeeze_break": {
        "name": "Squeeze Break",
        "features": {"squeeze": 1, "bbw_pctl": 15, "vol_ratio": 1.5, "adx": 25},
        "weights": {"squeeze": 0.3, "bbw_pctl": 0.25, "vol_ratio": 0.25, "adx": 0.2}
    },
    "base_breakout": {
        "name": "Base Break",
        "features": {"wbase": 80, "tight": 75, "pdh_brk": 1, "score": 75},
        "weights": {"wbase": 0.25, "tight": 0.25, "pdh_brk": 0.25, "score": 0.25}
    },
    "momentum": {
        "name": "Momentum",
        "features": {"score": 85, "vol_ratio": 1.8, "rsi": 65, "adx": 30},
        "weights": {"score": 0.3, "vol_ratio": 0.25, "rsi": 0.2, "adx": 0.25}
    },
    "pullback": {
        "name": "Pullback",
        "features": {"score": 72, "dist_low": 5, "trend_template": 1, "tight": 65},
        "weights": {"score": 0.3, "dist_low": 0.2, "trend_template": 0.3, "tight": 0.2}
    },
    "tight_consolidation": {
        "name": "Tight Consolidation",
        "features": {"bbw_pctl": 10, "tight": 95, "score": 75},
        "weights": {"bbw_pctl": 0.4, "tight": 0.4, "score": 0.2}
    },
    "volume_surge": {
        "name": "Volume Surge",
        "features": {"vol_ratio": 2.0, "score": 70, "pdh_brk": 1},
        "weights": {"vol_ratio": 0.4, "score": 0.3, "pdh_brk": 0.3}
    },
    "rs_leader": {
        "name": "RS Leader",
        "features": {"rs_ratio": 110, "score": 75, "trend_template": 1},
        "weights": {"rs_ratio": 0.4, "score": 0.3, "trend_template": 0.3}
    },
    "stage2_fresh": {
        "name": "Stage 2 Fresh",
        "features": {"stage": 2, "score": 70, "trend_template": 1, "dist52": 15},
        "weights": {"stage": 0.3, "score": 0.3, "trend_template": 0.2, "dist52": 0.2}
    },
    "breakout_pivot": {
        "name": "Pivot Breakout",
        "features": {"pivot_breakout": 1, "score": 72, "tight": 70},
        "weights": {"pivot_breakout": 0.4, "score": 0.3, "tight": 0.3}
    },
    "dma20_break": {
        "name": "DMA20 Break",
        "features": {"score": 68, "tight": 65},
        "weights": {"score": 0.5, "tight": 0.5}
    },
    "low_float": {
        "name": "Low Float",
        "features": {"vol_ratio": 2.5, "score": 75, "rsi": 70},
        "weights": {"vol_ratio": 0.4, "score": 0.3, "rsi": 0.3}
    },
    "earnings_gap": {
        "name": "Gap Up",
        "features": {"score": 70, "tight": 60},
        "weights": {"score": 0.5, "tight": 0.5}
    },
    "base_canvas": {
        "name": "Canvas",
        "features": {"wbase": 100, "tight": 70, "score": 72},
        "weights": {"wbase": 0.4, "tight": 0.3, "score": 0.3}
    },
    "sector_leader": {
        "name": "Sector Leader",
        "features": {"rs_ratio": 108, "score": 78, "adx": 25},
        "weights": {"rs_ratio": 0.4, "score": 0.3, "adx": 0.3}
    },
    "cup_handle": {
        "name": "Cup & Handle",
        "features": {"wbase": 60, "tight": 75, "score": 73},
        "weights": {"wbase": 0.3, "tight": 0.4, "score": 0.3}
    },
    "double_bottom": {
        "name": "Double Bottom",
        "features": {"score": 68, "tight": 65},
        "weights": {"score": 0.5, "tight": 0.5}
    },
}


@router.post("/preset-scan", response_model=PresetScanResponse)
async def preset_scan(request: PresetScanRequest):
    """
    Scan for stocks matching a preset VCP breakout setup.
    """
    try:
        if request.preset_id not in PRESET_CONFIGS:
            return PresetScanResponse(
                success=False,
                message=f"Unknown preset: {request.preset_id}",
                preset_id=request.preset_id,
                preset_name="",
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        config = PRESET_CONFIGS[request.preset_id]
        target_features = config["features"]
        weights = config["weights"]

        # Load scan results
        from data_manager import list_cached_dates, load_scan_cache
        cached_dates = list_cached_dates(request.market_key)
        if not cached_dates:
            return PresetScanResponse(
                success=False,
                message="No scan data available. Run a scan first.",
                preset_id=request.preset_id,
                preset_name=config["name"],
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        latest_date = cached_dates[0]
        all_results = load_scan_cache(request.market_key, latest_date)
        if not all_results:
            return PresetScanResponse(
                success=False,
                message="No scan results found.",
                preset_id=request.preset_id,
                preset_name=config["name"],
                matches=[],
                generated_at=datetime.now().isoformat()
            )

        # Score each stock against the preset
        scored = []
        for r in all_results:
            score = 0
            matched_features = {}
            for feat, target_val in target_features.items():
                actual = r.get(feat, 0)
                if feat == "squeeze" or feat == "pdh_brk" or feat == "trend_template":
                    # Binary feature - full match if 1
                    match = float(actual == target_val or (target_val == 1 and actual >= 1))
                elif feat == "stage":
                    # Stage should match exactly
                    match = 1.0 if actual == target_val else 0.0
                else:
                    # Numeric - calculate proximity (0-1)
                    if target_val > 0:
                        proximity = min(1.0, actual / target_val)
                    else:
                        proximity = 0.0
                    match = proximity
                
                weight = weights.get(feat, 0.1)
                score += match * weight * 100
                matched_features[feat] = actual

            scored.append({
                "ticker": r.get("ticker", "Unknown"),
                "name": r.get("name", ""),
                "sector": r.get("sector", "Unknown"),
                "cap": r.get("cap", "Unknown"),
                "last_price": float(r.get("last_price", 0)),
                "score": float(r.get("score", 0)),
                "stage": int(r.get("stage", 1)),
                "match_score": score,
                "features": matched_features
            })

        # Sort by match score
        scored.sort(key=lambda x: x["match_score"], reverse=True)
        top_matches = scored[:request.n_results]

        matches = [PresetMatch(**m) for m in top_matches]

        return PresetScanResponse(
            success=True,
            message=f"Found {len(matches)} stocks matching {config['name']} setup",
            preset_id=request.preset_id,
            preset_name=config["name"],
            matches=matches,
            generated_at=datetime.now().isoformat()
        )

    except Exception as e:
        return PresetScanResponse(
            success=False,
            message=f"Error scanning preset: {str(e)}",
            preset_id=request.preset_id,
            preset_name="",
            matches=[],
            generated_at=datetime.now().isoformat()
        )


@router.post("/learn")
async def run_learn_loop(market_key: str = "IN", use_journal_outcomes: bool = True):
    """
    CLOSED-LOOP LEARN — the most important part of the system.

    Steps:
    1. Pull actual trade outcomes from journal (last 90 days)
    2. Compute signal-level expectancy (which signals actually made money)
    3. Compute feature importance by outcome
    4. Retrain models incorporating actual outcomes
    5. Update scoring weights based on what worked

    This is the 'Learn → Improve' step in:
    Pull → Analyze → Track → Execute → Journal → Learn → Improve → Repeat
    """
    try:
        learn_results = {
            "outcomes_pulled": 0,
            "winners": 0,
            "losers": 0,
            "win_rate": 0.0,
            "avg_winner_pct": 0.0,
            "avg_loser_pct": 0.0,
            "expectancy_by_signal": {},
            "feature_expectancy": {},
            "models_retrained": 0,
            "new_aucs": {},
            "insights": [],
        }

        if use_journal_outcomes:
            try:
                from db import get_outcomes_for_retrain
                outcomes = get_outcomes_for_retrain(days=90)
                learn_results["outcomes_pulled"] = len(outcomes)

                if len(outcomes) < 20:
                    learn_results["insights"].append(
                        f"Only {len(outcomes)} outcomes in journal. Need 20+ for meaningful Learn. "
                        "Keep logging trades!"
                    )
                else:
                    winners = [o for o in outcomes if o.get("label") == 1]
                    losers = [o for o in outcomes if o.get("label") == 0]
                    learn_results["winners"] = len(winners)
                    learn_results["losers"] = len(losers)
                    learn_results["win_rate"] = round(len(winners) / len(outcomes) * 100, 1)

                    if winners:
                        win_pnls = [o.get("pnl_pct", 0) for o in winners if o.get("pnl_pct")]
                        learn_results["avg_winner_pct"] = round(sum(win_pnls) / len(win_pnls), 2)
                    if losers:
                        loss_pnls = [o.get("pnl_pct", 0) for o in losers if o.get("pnl_pct")]
                        learn_results["avg_loser_pct"] = round(sum(loss_pnls) / len(loss_pnls), 2)

                    signal_types = {}
                    for o in outcomes:
                        sig = o.get("signal_type", "unknown") or "unknown"
                        if sig not in signal_types:
                            signal_types[sig] = {"wins": 0, "total": 0, "pnls": []}
                        signal_types[sig]["total"] += 1
                        if o.get("label") == 1:
                            signal_types[sig]["wins"] += 1
                        pnl = o.get("pnl_pct", 0) or 0
                        signal_types[sig]["pnls"].append(pnl)

                    for sig, data in signal_types.items():
                        win_rate = data["wins"] / data["total"] * 100 if data["total"] > 0 else 0
                        avg_pnl = sum(data["pnls"]) / len(data["pnls"]) if data["pnls"] else 0
                        expectancy = (win_rate / 100 * avg_pnl) - ((1 - win_rate / 100) * abs(avg_pnl) if avg_pnl < 0 else 0)
                        learn_results["expectancy_by_signal"][sig] = {
                            "win_rate": round(win_rate, 1),
                            "count": data["total"],
                            "avg_pnl_pct": round(avg_pnl, 2),
                            "expectancy": round(expectancy, 3),
                        }

                    learn_results["insights"].append(
                        f"Journal Learn: {len(winners)} winners, {len(losers)} losers "
                        f"({learn_results['win_rate']}% win rate)"
                    )

            except Exception as e:
                learn_results["insights"].append(f"Could not load journal outcomes: {e}")

        cache_key = market_key
        if cache_key not in TRAINING_DATA_CACHE:
            df = await build_training_dataset_async(market_key)
            if df.empty:
                return {
                    "success": False,
                    "message": "No training data. Run scan and build dataset first.",
                    "details": learn_results,
                }
            TRAINING_DATA_CACHE[cache_key] = df

        df = TRAINING_DATA_CACHE[cache_key]
        models = train_vcp_models(df, market_key=market_key, persist=True)
        if models:
            MODEL_CACHE[cache_key] = models
            learn_results["models_retrained"] = len(models)
            for h, m in models.items():
                learn_results["new_aucs"][h] = round(m["auc"], 3)

        learn_results["insights"].append(
            f"Models retrained with {len(df)} samples. AUCs: {learn_results['new_aucs']}"
        )

        try:
            from notifier import _send_telegram_message
            insights_text = "\n".join(f"  {i}" for i in learn_results["insights"][:6])
            msg = (
                f"🧠 <b>Learn Loop Complete</b>\n\n"
                f"📊 {learn_results['outcomes_pulled']} outcomes | "
                f"WR: {learn_results['win_rate']:.0f}% | "
                f"W: {learn_results['winners']} L: {learn_results['losers']}\n\n"
                f"{insights_text}\n\n"
                f"<i>Models updated. System getting smarter.</i>"
            )
            _send_telegram_message(msg)
        except Exception:
            pass

        return {
            "success": True,
            "message": f"Learn loop complete. {learn_results['models_retrained']} models retrained.",
            "details": learn_results,
            "learned_at": datetime.now().isoformat(),
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Learn loop failed: {str(e)}",
            "details": {},
        }


@router.get("/learn-insights")
async def get_learn_insights(market_key: str = "IN"):
    """
    Get Learn insights without retraining — analyze what the data says.
    """
    try:
        insights = {"signal_expectancy": {}, "summary": ""}

        try:
            from db import get_outcomes_for_retrain
            outcomes = get_outcomes_for_retrain(days=90)
            if len(outcomes) < 10:
                return {"success": True, "insights": insights, "summary": "Not enough journal data yet."}

            winners = [o for o in outcomes if o.get("label") == 1]
            insights["summary"] = (
                f"{len(outcomes)} trades: {len(winners)} winners "
                f"({len(winners)/len(outcomes)*100:.0f}%), "
                f"{len(outcomes)-len(winners)} losers."
            )

            for o in outcomes:
                sig = o.get("signal_type", "unknown") or "unknown"
                if sig not in insights["signal_expectancy"]:
                    insights["signal_expectancy"][sig] = {"wins": 0, "total": 0, "avg_win": [], "avg_loss": []}
                insights["signal_expectancy"][sig]["total"] += 1
                if o.get("label") == 1:
                    insights["signal_expectancy"][sig]["wins"] += 1
                    pnl = o.get("pnl_pct", 0) or 0
                    insights["signal_expectancy"][sig]["avg_win"].append(pnl)
                else:
                    pnl = o.get("pnl_pct", 0) or 0
                    insights["signal_expectancy"][sig]["avg_loss"].append(abs(pnl))

            for sig, data in insights["signal_expectancy"].items():
                wr = data["wins"] / data["total"] * 100 if data["total"] > 0 else 0
                avg_w = sum(data["avg_win"]) / len(data["avg_win"]) if data["avg_win"] else 0
                avg_l = sum(data["avg_loss"]) / len(data["avg_loss"]) if data["avg_loss"] else 0
                exp = (wr/100 * avg_w) - ((1 - wr/100) * avg_l)
                data["win_rate"] = round(wr, 1)
                data["avg_win_pct"] = round(avg_w, 2)
                data["avg_loss_pct"] = round(avg_l, 2)
                data["expectancy"] = round(exp, 3)
                del data["avg_win"]
                del data["avg_loss"]

        except Exception as e:
            insights["summary"] = f"Journal error: {e}"

        return {"success": True, "insights": insights}

    except Exception as e:
        return {"success": False, "message": str(e)}

# VCP Dashboard India (NSE Market Scanner)

A full-stack VCP (Volatility Contraction Pattern) scanner and ML-powered stock analysis dashboard for the Indian NSE market.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Dashboard](#running-the-dashboard)
- [How to Use](#how-to-use)
  - [Daily Workflow](#daily-workflow)
  - [ML Intelligence](#ml-intelligence)
  - [Copy the Winner](#copy-the-winner)
  - [Intraday Trading](#intraday-trading)
  - [AI Analysis](#ai-analysis)
  - [Portfolio Management](#portfolio-management)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Data Storage](#data-storage)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **VCP Scanner** — Scans 500+ NSE stocks for volatility contraction patterns daily
- **Intraday Trading** — Real-time intraday signal scanning with Telegram alerts
- **Chart Analysis** — Interactive candlestick charts with technical indicators
- **Heatmap & Stats** — Visual sector/cap heatmaps of scan results
- **Simulation** — Alpha VCP trading simulation engine
- **Backtest / Forward Perf** — Historical backtesting and forward performance tracking
- **Portfolio** — Track your holdings and scan them for VCP setups
- **ML Intelligence** — XGBoost models to predict VCP breakout winners
- **Top 10 ML Picks** — AI-ranked stocks with highest win probability
- **Copy the Winner** — Select a stock and find similar VCP setups using ML (KNN)
- **Broker Integration** — Fyers API for live quotes and OHLCV data
- **Alerts** — Telegram alert integration for intraday signals

## Tech Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Backend  | Python, FastAPI, Uvicorn                      |
| Frontend | React 19, Vite, TypeScript, TailwindCSS       |
| ML       | XGBoost, scikit-learn, SHAP                   |
| Data     | Fyers API v3, Parquet (local OHLCV store)     |
| Charts   | Lightweight Charts (TradingView)              |

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **Fyers API** credentials (App ID + access token)

## Setup

### 1. Clone and install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Fyers API

Create a `.env` file in the `backend/` folder:

```env
FYERS_APP_ID=your_fyers_app_id
FYERS_TOKEN_FILE=fyers_token.txt
```

Place your Fyers access token in `backend/fyers_token.txt`.

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Download initial OHLCV data

On first run, use the **"Full Download"** button in the sidebar to download 2 years of historical OHLCV data for all NSE tickers. This is a one-time setup (~20-30 minutes).

## Running the Dashboard

### Option A: Use the batch file (Windows)

```bash
run.bat
```

This starts both backend and frontend in one command. The dashboard opens at **http://localhost:3000**.

### Option B: Start manually

**Terminal 1 — Backend:**
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 6001 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Then open **http://localhost:3000** in your browser.

## Ports

| Service  | Port |
|----------|------|
| Backend  | 6001 |
| Frontend | 3000 |

## How to Use

### Daily Workflow

1. **Launch Dashboard** - Run `run.bat` or start backend/frontend manually
2. **Refresh Data** - Click **"Refresh Data (Last 5 Days)"** in the sidebar
   - Downloads latest OHLCV from Fyers for all tickers
   - Merges with existing local data (no duplication)
   - Re-runs VCP scan on all tickers
3. **Review Results** - Check Scanner tab for VCP opportunities
4. **Intraday Scan** - Use Intraday tab for real-time signals during market hours

### ML Intelligence

1. Go to the **ML Intelligence** tab
2. Click **"Rebuild Dataset"** to build training data from historical scan caches
3. Click **"Train XGBoost Models"** to train prediction models
4. Once trained, ML predictions appear automatically in Scanner, Top 10 ML Picks, and Copy the Winner tabs

### Copy the Winner

1. Go to the **Copy Winner** tab
2. Select a stock you like from the dropdown
3. Choose a horizon (2D / 5D / 10D)
4. Click **"Find Similar"** — ML finds stocks with similar VCP characteristics
5. Expand any match to see a feature-by-feature comparison

### Intraday Trading

The **Intraday** tab (2nd tab) provides real-time intraday signal scanning:

1. **Watchlist** - Automatically built from daily VCP scan (score >= 60, stage 2, tight_rank >= 2, dist52 < 15)
2. **Scan** - Click **"Refresh Now"** to scan all watchlist stocks for intraday signals
3. **Signals** - Computed from 15-min and 1-hour candles:
   - EMA9/EMA21 crossover
   - VWAP reclaim
   - Volume surge (2x avg)
   - Inside bar breakout
   - EMA stack alignment
   - RSI momentum (>55 and rising)
   - 1H breakout
4. **Composite Score** - Weighted score (0-100), entry signal at >= 60
5. **Auto-refresh** - Toggle 15-min or 1-hour auto-scan during market hours
6. **Telegram Alerts** - Configure bot in **Bot Config** panel to receive entry alerts

#### Bot Configuration

Click the **Gear icon** in the Intraday tab to configure:

- **Telegram Bot Token** - Get from @BotFather
- **Chat ID** - Get from @userinfobot
- **Strong signals only** - Only alert on score >= 80
- **Min score threshold** - 60-100
- **Auto-refresh intervals** - 15-min or 1-hour

#### API Budget

The dashboard tracks Fyers API usage (100,000 calls/day limit). Each intraday scan uses ~2 API calls per stock.

### AI Analysis

Use MiniMax AI to analyze positions or stocks:

1. Go to **Portfolio** tab
2. Click the **Sparkles icon** on any position
3. Enter your MiniMax API key when prompted
4. Get AI-powered analysis with entry/stop/target recommendations

### Portfolio Management

1. **Holdings Tab** - Upload CSV/Excel with your holdings or sync from local file
2. **Manual Tab** - Add positions manually with entry price, stop loss, target
3. Scan all holdings for VCP setups to find breakout candidates

### OHLCV Data Store

- **Full Download** — Downloads 2 years of history for all missing tickers
- **Daily Update** — Incremental update for tickers that are behind
- **Refresh Data** — Smart 5-day refresh that keeps everything current

## Project Structure

```
vcp_dashboard_india/
├── backend/
│   ├── main.py              # FastAPI server + API routes
│   ├── engine.py             # VCP detection engine + indicators
│   ├── intraday_engine.py    # Intraday signal engine
│   ├── telegram_alerts.py    # Telegram alert dispatcher
│   ├── ml_api.py             # ML Intelligence API (XGBoost, KNN)
│   ├── generate_cache.py     # Scan cache generator
│   ├── ohlcv_store.py        # Local parquet OHLCV store
│   ├── fyers_live.py         # Fyers API integration
│   ├── data_manager.py       # Scan cache I/O
│   ├── ticker_metadata.py    # Ticker name/sector/cap metadata
│   ├── config_loader.py      # Config file loader
│   ├── requirements.txt      # Python dependencies
│   └── outputs/
│       ├── ohlcv/IN/         # Parquet files per ticker
│       └── scan_cache/       # Daily scan cache (pickle)
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main app component
│   │   ├── api.ts            # Backend API client
│   │   ├── types.ts          # TypeScript types
│   │   └── components/       # React components
│   ├── package.json
│   └── vite.config.ts
├── config.json               # App configuration
├── run.bat                   # One-click launcher (Windows)
└── README.md
```

## Configuration

Edit `config.json` to change ports or feature flags:

```json
{
  "backend": { "host": "0.0.0.0", "port": 6001 },
  "frontend": { "port": 3000 },
  "features": {
    "ml_enabled": true,
    "cache_enabled": true,
    "local_holdings_path": "E:\\holdings.csv"
  }
}
```

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Fyers API (required for live data)
FYERS_APP_ID=your_fyers_app_id
FYERS_SECRET_KEY=your_fyers_secret_key
FYERS_TOKEN_FILE=fyers_token.txt
FYERS_REDIRECT_URL=https://www.google.com

# Optional: Telegram alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional: MiniMax AI for stock analysis
MINIMAX_API_KEY=your_minimax_api_key
```

## API Endpoints

### Core Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with Fyers status |
| GET | `/api/status` | Data freshness status per market |
| GET | `/api/dates` | List available scan dates |
| GET | `/api/tickers` | List all available tickers |
| GET | `/api/scan` | Get scan results for a date |
| GET | `/api/chart` | Get chart data with indicators |
| POST | `/api/refresh` | Refresh OHLCV and regenerate scan |

### Broker Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/broker/status` | Check Fyers connection status |
| GET | `/api/broker/fyers/auth_url` | Get Fyers OAuth URL |
| POST | `/api/broker/fyers/login` | Complete OAuth login |

### Portfolio & Positions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/portfolio/scan` | Scan holdings for VCP setups |
| GET | `/api/portfolio/local` | Load holdings from CSV/Excel |
| GET | `/api/positions` | Get all positions |
| POST | `/api/positions` | Add new position |
| PUT | `/api/positions/{id}` | Update position |
| DELETE | `/api/positions/{id}` | Delete position |

### ML Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ml/status/{market}` | Check ML dataset/model status |
| POST | `/api/ml/build-dataset` | Build training dataset |
| POST | `/api/ml/train-models` | Train XGBoost models |
| POST | `/api/ml/predict` | Get ML predictions |
| POST | `/api/ml/copy-winner` | Find similar VCP patterns |
| POST | `/api/ml/top-picks` | Get top ML-ranked stocks |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/alerts/send` | Send Telegram alert |

### Intraday Trading
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/intraday/watchlist` | Get filtered watchlist from daily scan |
| POST | `/api/intraday/scan` | Trigger intraday scan on watchlist |
| GET | `/api/intraday/results` | Get last scan results |
| GET | `/api/intraday/budget` | Get API usage status |
| GET | `/api/intraday/chart/{symbol}/{resolution}` | Get 15min/60min candles + signals |
| GET | `/api/intraday/scan-status` | Get scan progress status |
| POST | `/api/intraday/auto-refresh/toggle` | Toggle auto-refresh (15/60 min) |
| GET | `/api/intraday/config` | Get intraday configuration |
| POST | `/api/intraday/config` | Save intraday configuration |
| POST | `/api/intraday/build-metadata` | Build stock metadata from OHLCV |
| POST | `/api/telegram/test` | Test Telegram bot connection |

## Data Storage

```
backend/outputs/
  ohlcv/
    IN/
      RELIANCE-EQ.parquet    # Daily OHLCV data (2 years)
      TCS-EQ.parquet
      ...
  scan_cache/
    IN_2026-04-16.pkl       # Daily scan results
    IN_2026-04-15.pkl
    ...
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check Python version (`python --version` >= 3.11). Run `pip install -r backend/requirements.txt`. |
| Frontend won't start | Run `npm install` in the `frontend/` folder. |
| No scan data | Click **"Refresh Data"** in the sidebar. Ensure Fyers token is valid. |
| OHLCV download fails | Check `backend/.env` has correct `FYERS_APP_ID`. Check `backend/fyers_token.txt` exists and is not expired. |
| ML models not working | Go to ML Intelligence tab -> click "Rebuild Dataset" -> then "Train Models". |
| Port conflict | Edit `config.json` and `frontend/vite.config.ts` to change ports. |
| Fyers token expired | Re-authenticate via the Broker tab or manually update `fyers_token.txt` |
| Import errors | Ensure all dependencies installed: `pip install -r backend/requirements.txt` |
| Telegram alerts not working | Verify bot token in Bot Config panel. Test with "Test Telegram" button. |
| Intraday scan returns no results | Ensure daily scan has been run first. Watchlist is built from daily VCP scan results. |
| API rate limit reached | Wait for next day (Fyers limit: 100,000 calls/day) or reduce scan frequency. |

## Contributing

Contributions are welcome! Please ensure:
- Python code passes type hints and has no import errors
- TypeScript code compiles without errors (`npx tsc --noEmit`)
- Test functionality before submitting changes

## Deploying to Railway

### Prerequisites
- [Railway](https://railway.app) account
- Fyers API credentials (for production data)
- Telegram Bot Token (optional, for alerts)

### Quick Deploy

1. Click the button below to deploy to Railway:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/your-repo/vcp_dashboard_india)

2. Configure environment variables in Railway dashboard:
   - `FYERS_APP_ID` - Your Fyers App ID
   - `FYERS_SECRET_KEY` - Your Fyers Secret Key
   - `FYERS_TOKEN_FILE` - Set to empty, you'll authenticate via web
   - `FYERS_REDIRECT_URL` - Set to your Railway app URL
   - `TELEGRAM_BOT_TOKEN` - Optional, for alerts
   - `TELEGRAM_CHAT_ID` - Optional

3. Deploy the backend first, then build and deploy the frontend:
   ```bash
   # Backend runs on port $PORT (Railway provides this)
   cd backend
   pip install -r requirements.txt
   python -m uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

### Manual Railway Setup

1. Create `railway.json` in project root:
   ```json
   {
     "$schema": "https://railway.app/schema.json",
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "numReplicas": 1,
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 10
     }
   }
   ```

2. Create `backend/Procfile`:
   ```
   web: cd backend && pip install -r requirements.txt && python -m uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

3. Update `config.json` for Railway:
   ```json
   {
     "backend": { "host": "0.0.0.0", "port": 8080 },
     "frontend": { "port": 3000 }
   }
   ```

### Note
For production, consider using a managed database (PostgreSQL) instead of SQLite. Update the `database` config in `config.json` accordingly.

## License

MIT License - Free for personal and commercial use.

---

**Author:** Pavan Mayya
**Version:** 1.0.0
**Last Updated:** April 2026

import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
});

export const fetchDates = async (market: string) => {
    const { data } = await api.get(`/dates?market=${market}`);
    return data.dates;
};

export const fetchTickers = async (market: string) => {
    const { data } = await api.get(`/tickers?market=${market}`);
    return data.tickers as string[];
};

export const fetchScan = async (market: string, date?: string) => {
    const { data } = await api.get('/scan', { params: { market, date } });
    return (data.results ?? []) as any[];
};

export const fetchBreadthHistory = async (market: string = 'IN', days: number = 500) => {
    const { data } = await api.get('/breadth-history', { params: { market, days } });
    return data as { success: boolean; data?: { date: string; pct_above_20dma: number; stocks_above: number; total_stocks: number }[]; total_days?: number; error?: string };
};

export const fetchBacktest = async (ticker: string, period: string = '1y', threshold: number = 60) => {
    const { data } = await api.get('/backtest', { params: { ticker, period, threshold } });
    return data as { success: boolean; total_trades?: number; win_rate?: number; avg_pnl?: number; profit_factor?: number; cumulative_pnl?: number[]; trades?: { entry_date: string; exit_date: string; entry_price: number; exit_price: number; pnl: number }[]; error?: string };
};

export const fetchLiveScan = async (market: string) => {
    const { data } = await api.get('/scan/live', { params: { market } });
    return (data.results ?? []) as any[];
};

export const fetchChartData = async (ticker: string, timeframe: string = 'D') => {
    const { data } = await api.get(`/chart?ticker=${ticker}&timeframe=${timeframe}`);
    return data;
};

export const fetchSimulate = async (market: string) => {
    const { data } = await api.get(`/simulate?market=${market}`);
    return data;
};

// ML Intelligence API
export const fetchMLStatus = async (market: string) => {
    const { data } = await api.get(`/ml/status/${market}`);
    return data;
};

export const buildMLDataset = async (market: string, horizons: number[] = [2, 5, 10]) => {
    const { data } = await api.post('/ml/build-dataset', {
        market_key: market,
        horizons,
        winner_thresholds: { 2: 3.0, 5: 5.0, 10: 8.0 },
        stop_pct: 7.0
    });
    return data;
};

export const trainMLModels = async (market: string, horizons: number[] = [2, 5, 10]) => {
    const { data } = await api.post('/ml/train-models', {
        market_key: market,
        horizons,
        winner_thresholds: { 2: 3.0, 5: 5.0, 10: 8.0 },
        stop_pct: 7.0
    });
    return data;
};

export const fetchMLPredictions = async (results: any[], horizon: number = 5) => {
    const { data } = await api.post('/ml/predict', {
        results,
        horizon
    });
    return data;
};

export const fetchPatternMatches = async (ticker: string, features: Record<string, number>, market: string, n_neighbors: number = 5) => {
    const { data } = await api.post('/ml/pattern-match', {
        ticker,
        features,
        market_key: market,
        n_neighbors
    });
    return data;
};

export const fetchModelHealth = async (market: string) => {
    const { data } = await api.get(`/ml/model-health/${market}`);
    return data;
};

export const fetchTopMLPicks = async (market: string, results: any[], horizon: number = 5) => {
    const { data } = await api.post(`/ml/top-picks/${market}`, {
        results,
        horizon
    });
    return data;
};

export const refreshCache = async (market: string) => {
    const { data } = await api.post('/refresh', { market });
    return data;
};

export const fetchStatus = async () => {
    const { data } = await api.get('/status');
    return data as Record<string, { last_date: string | null; count: number; freshness: 'fresh' | 'stale' | 'old' | 'none'; days_ago: number }>;
};

export const fetchOHLCVStatus = async () => {
    const { data } = await api.get('/ohlcv/status');
    return data as Record<string, { total: number; present: number; stale: number; missing: number; coverage_pct: number }>;
};

export const downloadOHLCV = async (market: string, options: { force?: boolean; incremental?: boolean } = {}) => {
    const { data } = await api.post('/ohlcv/download', { market, ...options });
    return data as { market: string; total: number; done: number; failed: number; date: string };
};

export const fetchBrokerStatus = async () => {
    const { data } = await api.get('/broker/status');
    return data as { fyers: { linked: boolean; updated_at: string | null } };
};

export const fetchFyersAuthUrl = async () => {
    const { data } = await api.get('/broker/fyers/auth_url');
    return data as { url: string };
};

export const loginFyers = async (url: string) => {
    const { data } = await api.post('/broker/fyers/login', { url });
    return data;
};

export const scanPortfolio = async (holdings: { ticker: string; quantity: number; avg_cost: number }[]) => {
    const { data } = await api.post('/portfolio/scan', { holdings });
    return data;
};

export const fetchLocalPortfolio = async () => {
    const { data } = await api.get('/portfolio/local');
    return data;
};

export const sendTelegramAlert = async (message: string) => {
    const { data } = await api.post('/alerts/send', { message });
    return data;
};

export const fetchCopyWinner = async (ticker: string, market: string, nSimilar: number = 10, horizon: number = 5, scanDate: string = '') => {
    const { data } = await api.post('/ml/copy-winner', {
        ticker,
        market_key: market,
        n_similar: nSimilar,
        horizon,
        scan_date: scanDate
    });
    return data;
};

export const fetchPresetScan = async (presetId: string, market: string = 'IN', nResults: number = 20) => {
    const { data } = await api.post('/ml/preset-scan', {
        preset_id: presetId,
        market_key: market,
        n_results: nResults
    });
    return data;
};

export const aiChat = async (question: string, context?: string, provider: string = 'nvidia') => {
    const { data } = await api.post('/ai/chat', { question, context, provider });
    return data as { response: string; provider: string };
};

export const analyzeStockWithAI = async (ticker: string, chartData: any[] = [], provider: string = 'nvidia') => {
    const { data } = await api.post('/ai/analyze-stock', { ticker, chart_data: chartData, provider });
    return data as { analysis: string; ticker: string; provider: string };
};

export const analyzePositionWithAI = async (position: {
    ticker: string;
    entry_price: number;
    stop_loss: number;
    target: number;
    quantity: number;
    chart_data?: any[];
}, provider: string = 'nvidia') => {
    const { data } = await api.post('/ai/analyze-position', { ...position, provider });
    return data as { analysis: string; ticker: string; provider: string };
};

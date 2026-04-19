// ─── Global App State Types ─────────────────────────────────────────────────

export type MarketType = 'US' | 'IN' | 'FOREX';
export type SortField =
    | 'VCP SCORE' | 'CHECKLIST' | 'RSI' | 'VOL RATIO' | 'PRICE'
    | 'TICKER' | 'STAGE' | 'R1%' | 'R5%' | '3M' | '6M' | 'RS' | 'ADX'
    | 'TIGHT' | 'WBASE' | 'TIER';
export type SortOrder = 'desc' | 'asc';
export type TabKey = 'scanner' | 'chart' | 'heatmap' | 'simulation' | 'backtest' | 'forward' | 'portfolio' | 'ml' | 'top10' | 'broker' | 'copywinner' | 'alerts' | 'intraday' | 'risk' | 'journal' | 'breadth' | 'forex' | 'watchlist' | 'ai';

export interface ScanFilters {
    stages: number[];
    minChecklist: number;
    rsiRange: [number, number];
    minVolRatio: number;
    maxPctOffHigh: number;
    signals: string[];
    sortBy: SortField;
    sortOrder: SortOrder;
}

export interface SidebarState {
    market: MarketType;
    sectors: string[];
    marketCaps: string[];
    minVcpScore: number;
    scanDate: string;
    chartHeight: number;
    liveSimEnabled: boolean;
    refreshInterval: number;
}

export interface ScanResult {
    ticker: string;
    sector: string;
    cap: string;
    stage: number;
    last_price: number;
    score: number;
    checklist_str: string;
    rsi: number;
    vol_ratio: number;
    pct_off_high: number;
    r1_pct: number;
    r5_pct: number;
    ret_3m: number;
    ret_6m: number;
    rs: number;
    adx: number;
    tight: number;
    wbase: number;
    tier: string;
    signals: string[];
}

export interface BacktestResult {
    total_trades: number;
    win_rate: number;
    avg_pnl: number;
    profit_factor: number;
    cumulative_pnl: number[];
    trades: any[];
    chart_data: any;
}

export interface ForwardTrackingResult {
    summary: any;
    daily_alpha: any[];
    ledger: any[];
}

export interface PortfolioPosition {
    ticker: string;
    company_name?: string;
    status: string; // e.g. "5MA Safe"
    holding_days: number;
    pnl_pct: number;
    pnl_value: number;
    pnl_absolute_label: string; // e.g. "+3.4R" or "+3.4L"
    entry_price: number;
    current_price: number;
    is_active: boolean;
    stage: number;
    vcp_score: number;
    quantity: number;
    avg_cost: number;
}

export interface PortfolioSummary {
    position_count: number;
    invested_amount: number;
    invested_label: string;
    days_pnl_value: number;
    days_pnl_pct: number;
    total_pnl_value: number;
    total_pnl_pct: number;
    open_risk_pct: number;
    open_risk_value: number;
    locked_profit_value: number;
}

import type React from 'react';
import {
    ChevronLeft, ChevronRight, CalendarDays, RefreshCw,
    Search, ToggleLeft, ToggleRight, Activity, Download, DatabaseZap
} from 'lucide-react';
import type { SidebarState } from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────
const ALL_SECTORS = [
    'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
    'Consumer Staples', 'Energy', 'Industrials', 'Materials',
    'Real Estate', 'Utilities', 'Communication Services'
];
const ALL_CAPS = ['Mega Cap', 'Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'];

// ─── Types ───────────────────────────────────────────────────────────────────
interface MarketStatus {
    last_date: string | null;
    count: number;
    freshness: 'fresh' | 'stale' | 'old' | 'none';
    days_ago: number;
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface OHLCVMarketStatus {
    total: number;
    present: number;
    stale: number;
    missing: number;
    coverage_pct: number;
}

interface SidebarProps {
    state: SidebarState;
    onChange: (patch: Partial<SidebarState>) => void;
    onScanNow: () => void;
    onRefreshData: (market?: string) => void;
    isScanning: boolean;
    refreshing?: boolean;
    refreshSummary?: { market: string; date: string; count: number; ohlcv_updated?: number; ohlcv_failed?: number }[] | null;
    marketStatus?: Record<string, MarketStatus>;
    filteredCount?: number;
    totalCount?: number;
    ohlcvStatus?: Record<string, OHLCVMarketStatus>;
    downloadingOHLCV?: boolean;
    onDownloadOHLCV?: (market: string, incremental: boolean) => void;
    dates: string[] | undefined;
    selectedDateIdx: number;
    onDateIdxChange: (idx: number) => void;
    availableSectors?: string[];
    availableCaps?: string[];
    isLiveScan?: boolean;
    onLiveScanToggle?: (val: boolean) => void;
}

// ─── Small reusable controls ────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5">{children}</p>;
}

function SliderControl({
    label, value, min, max, step, unit, onChange
}: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div>
            <SectionLabel>{label}</SectionLabel>
            <div className="flex items-center gap-2">
                <input
                    type="range" min={min} max={max} step={step} value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="sidebar-slider flex-1"
                />
                <span className="text-xs font-mono text-primary w-12 text-right">{value}{unit || ''}</span>
            </div>
        </div>
    );
}

function MultiSelect({
    label, options, selected, onChange
}: {
    label: string; options: string[]; selected: string[];
    onChange: (v: string[]) => void;
}) {
    const allSelected = selected.length === options.length;
    const toggleAll = () => onChange(allSelected ? [] : [...options]);
    const toggle = (o: string) => {
        onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
    };
    return (
        <div>
            <SectionLabel>{label}</SectionLabel>
            <div className="bg-[#0d0d15] rounded-lg border border-border/50 max-h-36 overflow-y-auto custom-scrollbar">
                <button
                    onClick={toggleAll}
                    className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-primary/10 border-b border-border/30 transition-colors"
                >
                    {allSelected ? '✓ All Selected' : 'Select All'}
                </button>
                {options.map(o => (
                    <label
                        key={o}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-[#1a1a28] cursor-pointer transition-colors"
                    >
                        <input
                            type="checkbox" checked={selected.includes(o)}
                            onChange={() => toggle(o)}
                            className="sidebar-checkbox"
                        />
                        <span className="text-slate-300">{o}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

// ─── Freshness dot ───────────────────────────────────────────────────────────
function FreshnessBadge({ status }: { status?: MarketStatus }) {
    if (!status) return null;
    const dot: Record<string, string> = {
        fresh: 'bg-emerald-400',
        stale: 'bg-amber-400',
        old: 'bg-red-400',
        none: 'bg-slate-500',
    };
    const label: Record<string, string> = {
        fresh: 'Today',
        stale: 'Yesterday',
        old: `${status.days_ago}d ago`,
        none: 'No data',
    };
    return (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className={`w-2 h-2 rounded-full ${dot[status.freshness]} shrink-0`} />
            <span className="font-mono">{status.last_date ?? '—'}</span>
            <span className="ml-auto text-slate-500">{label[status.freshness]}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{status.count} stocks</span>
        </div>
    );
}

// ─── Main Sidebar ───────────────────────────────────────────────────────────
export default function Sidebar({
    state, onChange, onScanNow, onRefreshData,
    isScanning, refreshing, refreshSummary,
    marketStatus, filteredCount, totalCount,
    ohlcvStatus, downloadingOHLCV, onDownloadOHLCV,
    dates, selectedDateIdx, onDateIdxChange,
    availableSectors, availableCaps,
    isLiveScan, onLiveScanToggle
}: SidebarProps) {

    const handleDateNav = (delta: number) => {
        if (!dates) return;
        const newIdx = selectedDateIdx + delta;
        if (newIdx >= 0 && newIdx < dates.length) onDateIdxChange(newIdx);
    };

    const handleToday = () => {
        if (dates && dates.length > 0) onDateIdxChange(0);
    };

    const currentDate = dates?.[selectedDateIdx] || '—';

    return (
        <aside className="sidebar-root">
            {/* ── Logo / Brand ──────────────────────────────────────────── */}
            <div className="sidebar-brand">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                        <Activity className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
                            VCP Pro
                        </h1>
                        <p className="text-[9px] text-slate-500 tracking-wider uppercase">Market Scanner</p>
                    </div>
                </div>
            </div>

            {/* ── Market Selector ──────────────────────────────────────────── */}
            <div className="sidebar-section">
                <SectionLabel>Select Market</SectionLabel>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => onChange({ market: 'IN' })}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                            state.market === 'IN' 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
                            : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                        }`}
                    >
                        INDIA
                    </button>
                    <button
                        onClick={() => onChange({ market: 'US' })}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                            state.market === 'US' 
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' 
                            : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                        }`}
                    >
                        USA
                    </button>
                    <button
                        onClick={() => onChange({ market: 'FOREX' })}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                            state.market === 'FOREX' 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' 
                            : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                        }`}
                    >
                        FOREX
                    </button>
                </div>
            </div>

            <div className="sidebar-scroll custom-scrollbar">
                {/* ── Market ──────────────────────────────────────────────── */}

                {state.market === 'IN' && (
                    <div className="sidebar-section">
                        <SectionLabel>Live Data Mode</SectionLabel>
                        <button
                            onClick={() => onLiveScanToggle?.(!isLiveScan)}
                            className={`sidebar-toggle ${isLiveScan ? 'sidebar-toggle-on' : ''}`}
                        >
                            {isLiveScan
                                ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">FYERS LIVE</span></>
                                : <><ToggleLeft className="w-5 h-5 text-slate-500" /><span className="text-slate-500">OFF (EOD)</span></>
                            }
                        </button>
                    </div>
                )}

                {/* FOREX Bot Controls */}
                {state.market === 'FOREX' && (
                    <div className="sidebar-section">
                        <SectionLabel>FOREX Bot (2H)</SectionLabel>
                        <div className="space-y-2">
                            <a
                                href="http://localhost:5001"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-600 hover:to-orange-600 transition-all"
                            >
                                <Activity className="w-4 h-4" />
                                Open FOREX Dashboard
                            </a>
                            <div className="text-[9px] text-slate-500 text-center">
                                ML Scanner | Portfolio | Journal
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Sectors ────────────────────────────────────────────── */}
                <div className="sidebar-section">
                    <MultiSelect
                        label="Filter the universe by sector"
                        options={availableSectors?.length ? availableSectors : ALL_SECTORS} selected={state.sectors}
                        onChange={s => onChange({ sectors: s })}
                    />
                </div>

                {/* ── Market Cap ─────────────────────────────────────────── */}
                <div className="sidebar-section">
                    <MultiSelect
                        label="Filter by market capitalization bucket"
                        options={availableCaps?.length ? availableCaps : ALL_CAPS} selected={state.marketCaps}
                        onChange={c => onChange({ marketCaps: c })}
                    />
                </div>

                {/* ── Data Freshness ─────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SectionLabel>Data freshness</SectionLabel>
                    <div className="space-y-1.5 bg-[#0d0d15] rounded-lg border border-border/50 px-2.5 py-2">
                        {(['IN', 'US', 'FOREX'] as const).map(m => (
                            <div key={m} className="space-y-0.5">
                                <p className="text-[9px] uppercase tracking-widest text-slate-600">{m === 'IN' ? 'India (NSE)' : m === 'US' ? 'USA (NASDAQ)' : 'Forex'}</p>
                                <FreshnessBadge status={marketStatus?.[m]} />
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => onRefreshData(state.market)}
                        disabled={refreshing}
                        className="sidebar-btn sidebar-btn-primary w-full mt-2"
                    >
                        {refreshing
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Updating OHLCV &amp; Scanning…</>
                            : <><RefreshCw className="w-3.5 h-3.5" /> Refresh Data (Last 5 Days)</>
                        }
                    </button>
                    {refreshing && (
                        <p className="text-[9px] text-amber-400/70 mt-1 text-center">
                            Downloading last 5 days from Fyers → Re-scanning all tickers…
                        </p>
                    )}
                    {refreshSummary && refreshSummary.length > 0 && !refreshing && (
                        <div className="mt-2 space-y-1">
                            {refreshSummary.map(r => (
                                <div key={r.market} className="bg-emerald-500/10 border border-emerald-500/20 rounded px-2.5 py-1.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-emerald-400 font-semibold">{r.market}</span>
                                        <span className="text-slate-400 font-mono">{r.date}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] mt-1">
                                        <span className="text-slate-300">{r.count} scanned</span>
                                        {(r.ohlcv_failed ?? 0) > 0 && (
                                            <span className="text-red-400">{r.ohlcv_failed} failed</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Results Count ──────────────────────────────────────── */}
                {totalCount !== undefined && (
                    <div className="sidebar-section">
                        <div className="flex items-center justify-between bg-[#0d0d15] rounded-lg border border-border/50 px-2.5 py-2">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Matching stocks</span>
                            <span className="text-xs font-mono font-bold text-primary">
                                {filteredCount ?? 0}
                                <span className="text-slate-500 font-normal"> / {totalCount}</span>
                            </span>
                        </div>
                    </div>
                )}

                {/* ── OHLCV Data Store ────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SectionLabel>Local OHLCV store (2y)</SectionLabel>
                    <div className="space-y-1.5 bg-[#0d0d15] rounded-lg border border-border/50 px-2.5 py-2">
                        {(['IN', 'US', 'FOREX'] as const).map(m => {
                            const s = ohlcvStatus?.[m];
                            const pct = s?.coverage_pct ?? 0;
                            const bar = pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                            return (
                                <div key={m} className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-500 uppercase tracking-widest">{m === 'IN' ? 'India (NSE)' : m === 'US' ? 'USA (NASDAQ)' : 'Forex'}</span>
                                        <span className="text-slate-400 font-mono">
                                            {s ? `${s.present + s.stale} / ${s.total}` : 'â'}
                                            <span className="text-slate-600 ml-1">{s ? `(${pct}%)` : ''}</span>
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <button
                            onClick={() => onDownloadOHLCV?.(state.market, false)}
                            disabled={downloadingOHLCV}
                            className="sidebar-btn sidebar-btn-outline text-[10px]"
                            title="Download full 2y history for missing tickers"
                        >
                            {downloadingOHLCV
                                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Downloading…</>
                                : <><Download className="w-3 h-3" /> Full Download</>
                            }
                        </button>
                        <button
                            onClick={() => onDownloadOHLCV?.(state.market, true)}
                            disabled={downloadingOHLCV}
                            className="sidebar-btn sidebar-btn-outline text-[10px]"
                            title="Append only new rows since last stored date"
                        >
                            {downloadingOHLCV
                                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Updating…</>
                                : <><DatabaseZap className="w-3 h-3" /> Daily Update</>
                            }
                        </button>
                    </div>
                </div>

// ... (rest of the code remains the same)
                {/* ── Min VCP Score ──────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SliderControl
                        label="Set minimum VCP score threshold"
                        value={state.minVcpScore} min={0} max={100} step={5}
                        onChange={v => onChange({ minVcpScore: v })}
                    />
                </div>

                {/* ── Scan Date ──────────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SectionLabel>Pick the date to analyze</SectionLabel>
                    <div className="flex items-center gap-1.5 bg-[#0d0d15] rounded-lg border border-border/50 p-1.5">
                        <button onClick={() => handleDateNav(1)} className="sidebar-icon-btn" title="Previous day">
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 text-center font-mono text-xs font-semibold text-primary truncate">{currentDate}</div>
                        <button onClick={() => handleDateNav(-1)} className="sidebar-icon-btn" title="Next day">
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                        <button onClick={handleToday} className="sidebar-pill sidebar-pill-muted">
                            <CalendarDays className="w-3 h-3" /> Today
                        </button>
                        <input
                            type="date" value={state.scanDate}
                            onChange={e => onChange({ scanDate: e.target.value })}
                            className="sidebar-date-picker"
                        />
                    </div>
                </div>

                {/* ── Chart Height ───────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SliderControl
                        label="Adjust chart display height"
                        value={state.chartHeight} min={400} max={1200} step={50} unit="px"
                        onChange={v => onChange({ chartHeight: v })}
                    />
                </div>

                {/* ── Live Simulation ────────────────────────────────────── */}
                <div className="sidebar-section">
                    <SectionLabel>Enable auto-refresh trading simulation</SectionLabel>
                    <button
                        onClick={() => onChange({ liveSimEnabled: !state.liveSimEnabled })}
                        className={`sidebar-toggle ${state.liveSimEnabled ? 'sidebar-toggle-on' : ''}`}
                    >
                        {state.liveSimEnabled
                            ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">LIVE</span></>
                            : <><ToggleLeft className="w-5 h-5 text-slate-500" /><span className="text-slate-500">OFF</span></>
                        }
                    </button>
                    {state.liveSimEnabled && (
                        <div className="mt-2">
                            <SliderControl
                                label="Set auto-refresh frequency (seconds)"
                                value={state.refreshInterval} min={10} max={60} step={5} unit="s"
                                onChange={v => onChange({ refreshInterval: v })}
                            />
                        </div>
                    )}
                </div>


            </div>

            {/* ── Sticky bottom actions ─────────────────────────────────── */}
            <div className="sidebar-actions">
                <button onClick={onScanNow} disabled={isScanning} className="sidebar-btn sidebar-btn-primary w-full">
                    {isScanning
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning…</>
                        : <><Search className="w-4 h-4" /> SCAN NOW</>
                    }
                </button>
            </div>
        </aside>
    );
}

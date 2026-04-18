import { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowUp, ArrowDown, Filter, Search, ChevronDown, Plus } from 'lucide-react';
import ChartTooltip from './ChartTooltip';
import AddPositionDialog from './AddPositionDialog';

// ─── Signal helpers ───────────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<string, { key: string; icon: string; label: string }> = {
    'volume_surge': { key: 'volume_surge', icon: '🔥', label: 'VOL' },
    'msb': { key: 'msb', icon: '📈', label: 'MSB' },
    'pivot_breakout': { key: 'pivot_breakout', icon: '💥', label: 'PVT' },
    'tl_breakout': { key: 'tl_breakout', icon: '📉', label: 'TL' },
    'dma20_break': { key: 'dma20_break', icon: '〽️', label: '20MA' },
    'price_surge': { key: 'price_surge', icon: '🚀', label: 'PRC' },
};
const SIGNAL_KEYS = Object.keys(SIGNAL_CONFIG);

const WARNING_COLORS: Record<string, string> = {
    FRESH: 'bg-emerald-500/90 text-white',
    EARLY: 'bg-yellow-500/80 text-black',
    WATCH: 'bg-orange-500/70 text-white',
    LATE: 'bg-red-500/50 text-white/70',
};
const WARNING_BAR_COLORS: Record<string, string> = {
    FRESH: 'bg-emerald-400',
    EARLY: 'bg-yellow-400',
    WATCH: 'bg-orange-400',
    LATE: 'bg-red-400/50',
};
const WARNING_EMOJI: Record<string, string> = {
    FRESH: '🟢', EARLY: '🟡', WATCH: '🟠', LATE: '🔴'
};

// ─── Constants & formatting ───────────────────────────────────────────────────
const STAGE_COLORS: Record<number, string> = {
    1: 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/60',
    2: 'bg-blue-900/40 text-blue-400 border border-blue-800/60',
    3: 'bg-amber-900/40 text-amber-400 border border-amber-800/60',
    4: 'bg-red-900/40 text-red-400 border border-red-800/60',
};

function pctColor(v: number) {
    if (v > 0) return 'text-emerald-400';
    if (v < 0) return 'text-red-400';
    return 'text-slate-400';
}
function scoreGradient(s: number) {
    if (s >= 80) return 'bg-emerald-500/20 text-emerald-300';
    if (s >= 60) return 'bg-blue-500/20 text-blue-300';
    if (s >= 40) return 'bg-amber-500/20 text-amber-300';
    return 'bg-red-500/20 text-red-300';
}
function rsRankColor(v: number | null) {
    if (v == null) return 'text-slate-500';
    if (v >= 90) return 'text-emerald-400';
    if (v >= 75) return 'text-lime-400';
    if (v >= 50) return 'text-yellow-400';
    return 'text-red-400';
}
function tightColor(v: number | null) {
    if (v == null) return 'bg-slate-800 text-slate-400';
    return v >= 2 ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-700 text-slate-400';
}
function wbaseColor(v: number | null) {
    if (v == null) return 'bg-slate-800 text-slate-400';
    if (v >= 4) return 'bg-emerald-500/30 text-emerald-300';
    if (v >= 2) return 'bg-yellow-500/30 text-yellow-300';
    return 'bg-slate-700 text-slate-400';
}

// ─── Tooltip Components ──────────────────────────────────────────────────────
function SignalTooltip({ sigKey, summary }: { sigKey: string; summary: any }) {
    if (!summary || !SIGNAL_CONFIG[sigKey]) return null;
    const cfg = SIGNAL_CONFIG[sigKey];
    const s = summary[sigKey];
    if (!s || s.days_active === 0) return null;
    const warning = s.entry_warning || 'LATE';
    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg shadow-2xl p-3 z-50 animate-fade-in">
            <div className="text-[11px] font-bold text-white border-b border-[#2a2a2a] pb-1.5 mb-2">
                {cfg.icon} {cfg.label}
            </div>
            <div className="space-y-1 text-[10px] font-mono">
                <div className="flex justify-between"><span className="text-slate-500">First fired:</span><span className="text-slate-300">{s.first_date || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Last fired:</span><span className="text-slate-300">{s.last_date || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Days active:</span><span className="text-slate-300">{s.days_active}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Days ago:</span><span className="text-slate-300">{s.days_since_last}</span></div>
            </div>
            <div className="mt-2 pt-1.5 border-t border-[#2a2a2a] text-[10px] font-bold text-center">
                {warning}{WARNING_EMOJI[warning]} {warning === 'FRESH' ? 'Act now' : warning === 'EARLY' ? 'Still valid' : warning === 'WATCH' ? 'Be cautious' : 'Likely missed'}
            </div>
            {s.days_since_last <= 14 && (
                <div className="mt-2">
                    <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                            className={`h-full ${WARNING_BAR_COLORS[warning]} transition-all`}
                            style={{ width: `${Math.min(100, (s.days_since_last / 14) * 100)}%` }}
                        />
                    </div>
                    <div className="text-[9px] text-slate-500 text-right mt-0.5">{s.days_since_last}d ago</div>
                </div>
            )}
        </div>
    );
}

function ChecklistTooltip({ result }: { result: any }) {
    const checks = [
        { label: 'RS Ratio > 100', pass: (result?.rs ?? 0) > 100 },
        { label: 'BBW Percentile < 25', pass: (result?.bbw_pctl ?? 100) < 25 },
        { label: 'Vol Ratio < 0.7', pass: (result?.vol_ratio ?? 1) < 0.7 },
        { label: 'Tight Rank >= 2', pass: (result?.tight ?? 0) >= 2 },
        { label: 'Dist 52W High < 15%', pass: (result?.pct_off_high ?? 100) < 15 },
        { label: 'RSI > 50', pass: (result?.rsi ?? 0) > 50 },
        { label: 'Trend Template', pass: result?.trend_template },
    ];
    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg shadow-2xl p-3 z-50 animate-fade-in">
            <div className="text-[11px] font-bold text-white border-b border-[#2a2a2a] pb-1.5 mb-2">CHECKLIST</div>
            <div className="space-y-1">
                {checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className={c.pass ? 'text-emerald-400' : 'text-red-400'}>{c.pass ? '✅' : '❌'}</span>
                        <span className={c.pass ? 'text-slate-300' : 'text-slate-500'}>{c.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SignalBadges({ result }: { result: any }) {
    const [hoveredSig, setHoveredSig] = useState<string | null>(null);
    const summary = result?.signals_summary || {};
    const history = result?.signals_history || {};
    const confluence = summary._confluence || 0;
    const activeSigs = SIGNAL_KEYS.filter(k => history[k] && Array.isArray(history[k]) && history[k].length > 0);
    if (activeSigs.length === 0) return <span className="text-slate-600 text-[9px]">—</span>;
    return (
        <div className="relative">
            <div className="flex gap-1 flex-wrap">
                {activeSigs.map(sigKey => {
                    const cfg = SIGNAL_CONFIG[sigKey];
                    const s = summary[sigKey] || {};
                    const warning = s.entry_warning || 'LATE';
                    return (
                        <div key={sigKey} className="relative"
                            onMouseEnter={() => setHoveredSig(sigKey)}
                            onMouseLeave={() => setHoveredSig(null)}
                        >
                            <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold ${WARNING_COLORS[warning]} cursor-help`}>
                                {cfg.icon} {cfg.label}
                            </span>
                            {hoveredSig === sigKey && <SignalTooltip sigKey={sigKey} summary={summary} />}
                        </div>
                    );
                })}
            </div>
            <div className={`mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${confluence >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                CONF {confluence}/{activeSigs.length}
            </div>
        </div>
    );
}

function RsRankSparkbar({ value }: { value: number | null }) {
    if (value == null) return <span className="text-slate-500">—</span>;
    const pct = value / 100;
    const color = value >= 90 ? 'bg-emerald-400' : value >= 75 ? 'bg-lime-400' : value >= 50 ? 'bg-yellow-400' : 'bg-red-400';
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${pct * 100}%` }} />
            </div>
            <span className={`text-[10px] font-mono font-bold w-8 text-right ${rsRankColor(value)}`}>{value.toFixed(0)}</span>
        </div>
    );
}

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = [
    { label: 'TICKER', sortKey: 'ticker' },
    { label: 'STG', sortKey: 'stage' },
    { label: 'PRICE', sortKey: 'last_price' },
    { label: 'SCORE', sortKey: 'score' },
    { label: 'CHECK', sortKey: 'checklist' },
    { label: 'RSI', sortKey: 'rsi', hasFilter: true },
    { label: 'VOL R', sortKey: 'vol_ratio', hasFilter: true },
    { label: '%OFFHI', sortKey: 'pct_off_high', hasFilter: true },
    { label: 'RS RK', sortKey: 'rs_rank_6m' },
    { label: 'TIGHT', sortKey: 'tight' },
    { label: 'WBASE', sortKey: 'wbase' },
    { label: 'TREND', sortKey: 'trend_template', hasFilter: true },
    { label: 'LOW%', sortKey: 'dist_low', hasFilter: true },
    { label: '3M', sortKey: 'r63' },
    { label: '6M', sortKey: 'r126' },
    { label: 'SIGNALS', sortKey: null, hasFilter: true },
    { label: 'SYNTH', sortKey: 'is_synthetic' },
    { label: 'ACTION', sortKey: null },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface ScannerTabProps {
    results: any[] | undefined;
    loading: boolean;
    selectedTicker: string | undefined;
    onSelectTicker: (t: string) => void;
}

export default function ScannerTab({ results, loading, selectedTicker, onSelectTicker }: ScannerTabProps) {
    // Sorting state
    const [sortBy, setSortBy] = useState<string>('score');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Filtering state
    const [stages, setStages] = useState<number[]>([1, 2, 3, 4]);
    const [rsiMin, setRsiMin] = useState<number>(0);
    const [rsiMax, setRsiMax] = useState<number>(100);
    const [minVolRatio, setMinVolRatio] = useState<number>(0);
    const [maxPctOffHigh, setMaxPctOffHigh] = useState<number>(100);
    const [signalFilters, setSignalFilters] = useState<string[]>([]);

    // Hover & Sticky Tooltip state
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
    const [stickyTicker, setStickyTicker] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const hoverTimerRef = useRef<any>(null);
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);

    // UI state for active filter popover
    const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
    const filterRef = useRef<HTMLDivElement>(null);

    // Add Position Dialog state
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [dialogTicker, setDialogTicker] = useState('');
    const [dialogPrice, setDialogPrice] = useState(0);

    // Scan timeframe state
    const [scanTimeframe, setScanTimeframe] = useState<'1d' | '1h'>('1d');

    // Close filter popover on clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setActiveFilterCol(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="text-center">
                        <span className="text-sm text-slate-400 block">Processing 800+ stocks through VCP engine...</span>
                        <span className="text-[10px] text-slate-500 block mt-1">Live Fyers data scan typically takes 15-30 seconds</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Filter Data ─────────────────────────────────────────────────────────
    let rows = (results ?? []).filter((r: any) => {
        if (!stages.includes(r.stage)) return false;
        const rsi = r.rsi ?? 50;
        if (rsi < rsiMin || rsi > rsiMax) return false;
        if ((r.vol_ratio ?? 0) < minVolRatio) return false;
        if ((r.pct_off_high ?? 100) > maxPctOffHigh) return false;
        return true;
    });

    // ── Sort Data ───────────────────────────────────────────────────────────
    if (sortBy) {
        rows = [...rows].sort((a: any, b: any) => {
            const av = a[sortBy] ?? 0, bv = b[sortBy] ?? 0;
            const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
            return sortOrder === 'desc' ? -cmp : cmp;
        });
    }

    // ── Toggles ─────────────────────────────────────────────────────────────
    const toggleSort = (colKey: string | null) => {
        if (!colKey) return;
        if (sortBy === colKey) {
            setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(colKey);
            setSortOrder('desc');
        }
    };

    const hasActiveFilter = (label: string) => {
        if (label === 'STG' && stages.length < 4) return true;
        if (label === 'RSI' && (rsiMin > 0 || rsiMax < 100)) return true;
        if (label === 'VOL R' && minVolRatio > 0) return true;
        if (label === '%OFFHI' && maxPctOffHigh < 100) return true;
        if (label === 'SIGNALS' && signalFilters.length > 0) return true;
        return false;
    };

    const handleMouseEnter = (e: React.MouseEvent, ticker: string) => {
        if (stickyTicker) return;
        const x = e.clientX;
        const y = e.clientY;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoveredTicker(ticker);
            setTooltipPos({ x, y });
        }, 150);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredTicker(null);
    };

    const handleTickerClick = (e: React.MouseEvent, ticker: string) => {
        e.stopPropagation();
        setStickyTicker(ticker === stickyTicker ? null : ticker);
        setHoveredTicker(null);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        onSelectTicker(ticker);
    };

    const handleAddToPositions = (e: React.MouseEvent, ticker: string, price: number) => {
        e.stopPropagation();
        setDialogTicker(ticker);
        setDialogPrice(price);
        setIsAddDialogOpen(true);
    };

    const handleAddPosition = async (position: {
        ticker: string;
        entry_price: number;
        stop_loss: number;
        target: number;
        quantity: number;
        notes: string;
    }) => {
        console.log('Add position:', position);
    };

    return (
        <div className="flex flex-col h-full gap-3 relative">
            <div className="flex items-center justify-between bg-panel/60 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-primary" /> Scanner Results
                    </h2>
                    <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {rows.length} matches
                    </span>
                </div>
                <div className="flex items-center bg-panel/40 rounded-lg p-0.5">
                    <button
                        onClick={() => setScanTimeframe('1d')}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${scanTimeframe === '1d' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        1D
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-border/40 bg-panel/40 backdrop-blur-sm custom-scrollbar min-h-0 relative">
                <table className="w-full text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[#12121c] border-b border-border/60 shadow-sm relative">
                            {COLUMNS.map(col => {
                                const isSorted = sortBy === col.sortKey;
                                const filtered = hasActiveFilter(col.label);
                                return (
                                    <th key={col.label} className="px-2 py-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-semibold text-left whitespace-nowrap bg-[#12121c] relative z-20">
                                        <div className="flex items-center gap-1">
                                            <div
                                                className={`cursor-pointer hover:text-slate-300 flex items-center gap-1 transition-colors ${col.sortKey ? '' : 'pointer-events-none'}`}
                                                onClick={() => toggleSort(col.sortKey)}
                                            >
                                                <span className={isSorted ? 'text-indigo-400 font-bold' : ''}>{col.label}</span>
                                                {isSorted && (sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-400" /> : <ArrowUp className="w-3 h-3 text-indigo-400" />)}
                                            </div>
                                            {col.hasFilter && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterCol(activeFilterCol === col.label ? null : col.label); }}
                                                    className={`ml-1 p-0.5 rounded transition-all ${filtered ? 'text-blue-400 bg-blue-900/30' : 'text-slate-600 hover:bg-slate-800 hover:text-slate-300'}`}
                                                >
                                                    {filtered ? <Filter className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                </button>
                                            )}
                                            {activeFilterCol === col.label && (
                                                <div ref={filterRef} className="absolute top-full left-0 mt-1 w-48 bg-[#1a1a28] border border-border/80 rounded-lg shadow-xl p-3 z-50 animate-slide-down" onClick={(e) => e.stopPropagation()}>
                                                    <div className="text-[10px] font-mono text-slate-400 mb-2 border-b border-border/50 pb-1">Filter {col.label}</div>
                                                    {col.label === 'STG' && (
                                                        <div className="flex flex-col gap-1.5">
                                                            {[1, 2, 3, 4].map(s => (
                                                                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm">
                                                                    <input type="checkbox" className="sidebar-checkbox" checked={stages.includes(s)} onChange={() => setStages(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} />
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STAGE_COLORS[s]}`}>S{s}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {col.label === 'RSI' && (
                                                        <div className="flex flex-col gap-2">
                                                            <div><div className="text-[10px] text-slate-400 mb-1">Min: {rsiMin}</div><input type="range" min={0} max={100} value={rsiMin} onChange={e => setRsiMin(+e.target.value)} className="sidebar-slider w-full" /></div>
                                                            <div><div className="text-[10px] text-slate-400 mb-1">Max: {rsiMax}</div><input type="range" min={0} max={100} value={rsiMax} onChange={e => setRsiMax(+e.target.value)} className="sidebar-slider w-full" /></div>
                                                        </div>
                                                    )}
                                                    {col.label === 'VOL R' && (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="text-[10px] text-slate-400 mb-1">Min Volume Ratio: {minVolRatio.toFixed(1)}</div>
                                                            <input type="range" min={0} max={5} step={0.1} value={minVolRatio} onChange={e => setMinVolRatio(+e.target.value)} className="sidebar-slider w-full" />
                                                        </div>
                                                    )}
                                                    {col.label === '%OFFHI' && (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="text-[10px] text-slate-400 mb-1">Max % Off High: {maxPctOffHigh}%</div>
                                                            <input type="range" min={0} max={100} value={maxPctOffHigh} onChange={e => setMaxPctOffHigh(+e.target.value)} className="sidebar-slider w-full" />
                                                        </div>
                                                    )}
                                                    {col.label === 'SIGNALS' && (
                                                        <div className="flex flex-col gap-1.5">
                                                            {SIGNAL_KEYS.map(s => (
                                                                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm">
                                                                    <input type="checkbox" className="sidebar-checkbox" checked={signalFilters.includes(s)} onChange={() => setSignalFilters(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} />
                                                                    <span className="text-slate-300 text-[10px]">{SIGNAL_CONFIG[s].icon} {SIGNAL_CONFIG[s].label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r: any, idx: number) => {
                            const isHovered = hoveredRow === idx;
                            return (
                                <tr key={r.ticker}
                                    onClick={() => onSelectTicker(r.ticker)}
                                    onMouseEnter={() => setHoveredRow(idx)}
                                    onMouseLeave={() => setHoveredRow(null)}
                                    className={`border-b border-border/20 hover:bg-[#1a1a28]/80 cursor-pointer transition-all ${selectedTicker === r.ticker ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
                                >
                                    <td className="px-2 py-2 font-bold text-blue-400 whitespace-nowrap relative group" onMouseEnter={(e) => handleMouseEnter(e, r.ticker)} onMouseLeave={handleMouseLeave} onClick={(e) => handleTickerClick(e, r.ticker)}>
                                        <span className={`hover:underline decoration-blue-400/30 underline-offset-4 ${stickyTicker === r.ticker ? 'underline decoration-blue-400 border-b-2 border-blue-400/20 pb-0.5' : ''}`}>{r.ticker?.replace('-EQ', '')}</span>
                                    </td>
                                    <td className="px-2 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${STAGE_COLORS[r.stage] || 'bg-slate-800 text-slate-400'}`}>S{r.stage}</span></td>
                                    <td className="px-2 py-2 font-mono text-slate-200">{r.ticker?.endsWith('-EQ') ? '₹' : '$'}{r.last_price?.toFixed(2) ?? '—'}</td>
                                    <td className="px-2 py-2"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${scoreGradient(r.score ?? 0)}`}>{r.score?.toFixed(1) ?? '—'}</span></td>
                                    <td className="px-2 py-2 relative">
                                        <span className="font-mono text-slate-300 cursor-help">{r.checklist_str || (r.checklist != null ? `${r.checklist}/7` : '—')}</span>
                                        {isHovered && <ChecklistTooltip result={r} />}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-slate-300">{r.rsi?.toFixed(0) ?? '—'}</td>
                                    <td className="px-2 py-2 font-mono text-slate-300">{r.vol_ratio?.toFixed(2) ?? '—'}</td>
                                    <td className="px-2 py-2 font-mono text-slate-300">{r.pct_off_high?.toFixed(1) ?? '—'}%</td>
                                    <td className="px-2 py-2"><RsRankSparkbar value={r.rs_rank_6m ?? null} /></td>
                                    <td className="px-2 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${tightColor(r.tight)}`}>{r.tight ?? '—'}</span></td>
                                    <td className="px-2 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${wbaseColor(r.wbase)}`}>{r.wbase?.toFixed(0) ?? '—'}</span></td>
                                    <td className="px-2 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${r.trend_template ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>{r.trend_template ? 'YES' : 'NO'}</span></td>
                                    <td className="px-2 py-2 font-mono text-slate-300">{r.dist_low?.toFixed(1) ?? '—'}%</td>
                                    <td className={`px-2 py-2 font-mono ${pctColor(r.r63 ?? 0)}`}>{r.r63?.toFixed(1) ?? '—'}%</td>
                                    <td className={`px-2 py-2 font-mono ${pctColor(r.r126 ?? 0)}`}>{r.r126?.toFixed(1) ?? '—'}%</td>
                                    <td className="px-2 py-2"><SignalBadges result={r} /></td>
                                    <td className="px-2 py-2">
                                        {r.is_synthetic ? (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">FAKE</span>
                                        ) : (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">LIVE</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2">
                                        <button onClick={(e) => handleAddToPositions(e, r.ticker, r.last_price)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1">
                                            <Plus size={12} />Add
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <Search className="w-8 h-8 mb-2 opacity-30" />
                        <p className="text-sm">No results match current filters.</p>
                    </div>
                )}
            </div>

            {(hoveredTicker || stickyTicker) && (
                <ChartTooltip ticker={stickyTicker || hoveredTicker || ''} visible={true} x={tooltipPos.x} y={tooltipPos.y} isSticky={!!stickyTicker} onClose={() => setStickyTicker(null)} />
            )}

            <AddPositionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} onAdd={handleAddPosition} ticker={dialogTicker} currentPrice={dialogPrice} />
        </div>
    );
}

import { useState, useMemo } from 'react';
import { Loader2, Eye, EyeOff, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import TVChart from './TVChart';

const STAGE_COLORS: Record<number, string> = {
    1: 'bg-emerald-900/40 text-emerald-400',
    2: 'bg-blue-900/40 text-blue-400',
    3: 'bg-amber-900/40 text-amber-400',
    4: 'bg-red-900/40 text-red-400',
};

interface ChartAnalysisTabProps {
    chartData: any;
    loadingChart: boolean;
    selectedTicker: string | null;
    chartHeight: number;
    tickers: string[];
    results?: any[];
    onSelectTicker: (t: string) => void;
    timeframe?: string;
    onTimeframeChange?: (tf: string) => void;
}

function TickerSearchDropdown({ tickers, selectedTicker, onSelect }: {
    tickers: string[];
    selectedTicker: string | null;
    onSelect: (t: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search) return tickers;
        const q = search.toLowerCase();
        return tickers.filter(t => t.toLowerCase().includes(q));
    }, [tickers, search]);

    const selectedLabel = selectedTicker ? selectedTicker.replace('-EQ', '') : '';

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a28] border border-border/40 rounded-lg text-xs text-slate-300 hover:border-primary/40 min-w-[140px]"
            >
                <Search className="w-3 h-3 text-slate-500" />
                <span className="flex-1 text-left truncate">
                    {selectedLabel || 'Search ticker...'}
                </span>
            </button>

            {isOpen && (
                <div className="fixed inset-0" style={{ zIndex: 999999 }} onClick={() => setIsOpen(false)}>
                    <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-[#12121c] border border-border/40 rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-3 border-b border-border/30">
                            <input
                                type="text"
                                placeholder="Search ticker..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                                className="w-full bg-[#1a1a28] border border-border/30 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar p-2">
                            {filtered.length === 0 ? (
                                <div className="px-3 py-6 text-sm text-slate-500 text-center">No tickers found</div>
                            ) : (
                                filtered.slice(0, 50).map(t => (
                                    <button
                                        type="button"
                                        key={t}
                                        onClick={() => { onSelect(t); setIsOpen(false); setSearch(''); }}
                                        className={`w-full px-3 py-2.5 text-left text-sm rounded hover:bg-primary/20 flex items-center justify-between ${
                                            t === selectedTicker ? 'bg-primary/20 text-white' : 'text-slate-300'
                                        }`}
                                    >
                                        <span>{t.replace('-EQ', '')}</span>
                                        {t === selectedTicker && <span className="text-primary text-xs">selected</span>}
                                    </button>
                                ))
                            )}
                            {filtered.length > 50 && (
                                <div className="px-3 py-2 text-xs text-slate-500 text-center border-t border-border/30 mt-2">
                                    Showing 50 of {filtered.length} results
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function RadarScore({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 w-16 truncate">{label}</span>
            <div className="flex-1 h-1.5 bg-[#1a1a28] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[11px] font-mono font-semibold w-8 text-right" style={{ color }}>{value.toFixed(0)}</span>
        </div>
    );
}

function SignalCard({ label, active }: { label: string; active: boolean }) {
    return (
        <div className={`flex items-center gap-2  px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${active
            ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300'
            : 'bg-[#12121c] border-border/30 text-slate-500'
            }`}>
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/40 animate-pulse' : 'bg-slate-600'}`} />
            {label}
        </div>
    );
}

function ContractionCard({ idx, contraction }: { idx: number; contraction: any }) {
    const colors = ['#60a5fa', '#fbbf24', '#a78bfa', '#34d399'];
    const c = colors[idx % colors.length];
    return (
        <div className="bg-[#12121c] border border-border/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: c + '20', color: c }}>
                    C{idx + 1}
                </div>
                <span className="text-[11px] text-slate-400">Contraction {idx + 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                    <span className="text-slate-500">Range</span>
                    <p className="font-mono font-bold text-slate-200">{contraction.depth_pct?.toFixed(1) ?? '—'}%</p>
                </div>
                <div>
                    <span className="text-slate-500">Duration</span>
                    <p className="font-mono font-bold text-slate-200">{contraction.length_bars ?? '—'} bars</p>
                </div>
            </div>
        </div>
    );
}

const TIMEFRAMES = [
    { label: '1D', value: 'D' },
    { label: '1H', value: '60' },
];

const CHART_TYPES = [
    { label: 'Candles', value: 'candles' },
    { label: 'Line', value: 'line' },
    { label: 'Area', value: 'area' },
    { label: 'Bars', value: 'bars' },
];

const INDICATORS = [
    { label: 'SMA', key: 'sma' },
    { label: 'EMA 20', key: 'ema20' },
    { label: 'EMA 50', key: 'ema50' },
    { label: 'RSI', key: 'rsi' },
    { label: 'Volume', key: 'volume' },
    { label: 'Trendlines', key: 'trendlines' },
];

export default function ChartAnalysisTab({
    chartData, loadingChart, selectedTicker, chartHeight, tickers, results = [], onSelectTicker,
    timeframe: propTimeframe, onTimeframeChange
}: ChartAnalysisTabProps) {
    const [buyLevel, setBuyLevel] = useState(70);
    const [squeezeBg, setSqueezeBg] = useState(true);
    const [peakLabels, setPeakLabels] = useState(true);
    const [allScores, setAllScores] = useState(false);
    const [timeframe, setTimeframe] = useState(propTimeframe || 'D');
    const [chartType, setChartType] = useState('candles');
    const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['ema20', 'ema50', 'rsi', 'volume', 'trendlines']));
    const [leftPanelOpen, setLeftPanelOpen] = useState(true);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [watchlistOpen, setWatchlistOpen] = useState(false);

    // Sync with parent timeframe
    useMemo(() => {
        if (propTimeframe && propTimeframe !== timeframe) {
            setTimeframe(propTimeframe);
        }
    }, [propTimeframe]);

    const handleTimeframeChange = (tf: string) => {
        setTimeframe(tf);
        onTimeframeChange?.(tf);
    };

    const toggleIndicator = (key: string) => {
        setActiveIndicators(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full gap-3 overflow-y-auto">
            {/* TradingView-style Toolbar */}
            <div className="flex flex-wrap items-center gap-1 bg-[#0a0e1a] border border-[#1e1e32] rounded-lg px-2 py-1">
                {/* Panel Toggles */}
                <button onClick={() => setLeftPanelOpen(!leftPanelOpen)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1a1a28]" title="Toggle Scanner Panel">
                    {leftPanelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                </button>
                <button onClick={() => { if (rightPanelOpen && !watchlistOpen) { setWatchlistOpen(true); } else if (rightPanelOpen && watchlistOpen) { setRightPanelOpen(false); } else { setRightPanelOpen(true); setWatchlistOpen(false); } }} className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1a1a28]" title={watchlistOpen ? "Show Info Panel" : "Show Watchlist"}>
                    {rightPanelOpen ? (watchlistOpen ? <PanelRightClose size={14} /> : <Eye size={14} />) : <PanelRightOpen size={14} />}
                </button>
                <div className="h-4 w-px bg-[#1e1e32] mx-1" />

                {/* Ticker */}
                <div className="flex items-center gap-2 pr-3 border-r border-[#1e1e32]">
                    <TickerSearchDropdown
                        tickers={tickers}
                        selectedTicker={selectedTicker}
                        onSelect={onSelectTicker}
                    />
                </div>

                {/* Timeframes */}
                <div className="flex items-center gap-0.5 px-2 border-r border-[#1e1e32]">
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.value}
                            onClick={() => handleTimeframeChange(tf.value)}
                            className={`px-2 py-1 text-[11px] rounded transition-colors ${
                                timeframe === tf.value
                                    ? 'bg-primary text-white font-medium'
                                    : 'text-slate-400 hover:text-white hover:bg-[#1a1a28]'
                            }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>

                {/* Chart Type */}
                <div className="flex items-center gap-0.5 px-2 border-r border-[#1e1e32]">
                    {CHART_TYPES.map(ct => (
                        <button
                            key={ct.value}
                            onClick={() => setChartType(ct.value)}
                            className={`px-2 py-1 text-[11px] rounded transition-colors ${
                                chartType === ct.value
                                    ? 'bg-[#1a1a28] text-primary border border-primary/30'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {ct.label}
                        </button>
                    ))}
                </div>

                {/* Indicators */}
                <div className="flex items-center gap-0.5 px-2 border-r border-[#1e1e32]">
                    {INDICATORS.map(ind => (
                        <button
                            key={ind.key}
                            onClick={() => toggleIndicator(ind.key)}
                            className={`px-2 py-1 text-[11px] rounded transition-colors ${
                                activeIndicators.has(ind.key)
                                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {ind.label}
                        </button>
                    ))}
                </div>

                {/* VCP Settings */}
                <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] text-slate-500">VCP:</span>
                    <input
                        type="range"
                        min={40}
                        max={90}
                        value={buyLevel}
                        onChange={e => setBuyLevel(+e.target.value)}
                        className="w-16 h-1 bg-[#1a1a28] rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-emerald-400 w-5">{buyLevel}</span>
                </div>

                {/* Toggles */}
                <button
                    onClick={() => setSqueezeBg(!squeezeBg)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                        squeezeBg ? 'bg-amber-900/30 text-amber-400' : 'text-slate-500'
                    }`}
                >
                    Sqz
                </button>
                <button
                    onClick={() => setPeakLabels(!peakLabels)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                        peakLabels ? 'bg-blue-900/30 text-blue-400' : 'text-slate-500'
                    }`}
                >
                    Peaks
                </button>
                <button onClick={() => setAllScores(!allScores)} className={`chart-toggle ${allScores ? 'chart-toggle-on' : ''}`}>
                    {allScores ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} All Scores
                </button>
                <button onClick={() => { if (!rightPanelOpen) setRightPanelOpen(true); setWatchlistOpen(!watchlistOpen); }} className={`px-2 py-1 text-[11px] rounded transition-colors ${watchlistOpen ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-[#1a1a28]'}`}>
                    {watchlistOpen ? <EyeOff className="w-3 h-3 inline mr-1" /> : <Eye className="w-3 h-3 inline mr-1" />} Watchlist
                </button>
            </div>

            {/* Main content */}
            <div className="flex-1 flex gap-3 min-h-0">
                {/* Chart */}
                <div className="flex-1 bg-panel/40 border border-border/40 rounded-xl overflow-hidden flex flex-col">
                    {loadingChart ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : chartData ? (
                        <>
                            <div className="flex-1" style={{ minHeight: `${chartHeight}px` }}>
                                <TVChart 
                                    data={chartData} 
                                    indicators={activeIndicators}
                                    ticker={selectedTicker || undefined}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                            Select a ticker to view chart
                        </div>
                    )}
                </div>

                {/* Right panel: Watchlist OR Info panels */}
                {rightPanelOpen && (
                    <div className="w-64 flex flex-col gap-2 overflow-y-auto custom-scrollbar p-2">
                        {/* Watchlist */}
                        {watchlistOpen ? (
                            <>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Watchlist</span>
                                    <span className="text-[9px] text-slate-500">Top VCP Scores</span>
                                </div>
                                {results.filter(r => (r.score || 0) >= buyLevel).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 25).map((r: any) => (
                                    <div
                                        key={r.ticker}
                                        onClick={() => onSelectTicker(r.ticker)}
                                        className={`px-2 py-1.5 rounded cursor-pointer hover:bg-[#1a1a28] ${selectedTicker === r.ticker ? 'bg-[#1a1a28] border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-blue-400">{r.ticker?.replace('-EQ', '')}</span>
                                            <span className={`text-[10px] font-mono font-bold ${(r.score || 0) >= 70 ? 'text-emerald-400' : (r.score || 0) >= 50 ? 'text-yellow-400' : 'text-slate-400'}`}>
                                                {r.score?.toFixed(1)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={`text-[9px] px-1 rounded ${STAGE_COLORS[r.stage] || 'bg-slate-800 text-slate-400'}`}>S{r.stage}</span>
                                            <span className="text-[9px] text-slate-500">RS {(r.rs || 0).toFixed(0)}</span>
                                            <span className="text-[9px] text-slate-500">T{r.tight ?? '-'}</span>
                                            <span className="text-[9px] text-slate-500">{(r.pct_off_high || 0).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <>
                                {/* Score Radar */}
                                <div className="bg-[#12121c] border border-[#1e1e32] rounded-lg p-3">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                        <span>Score</span>
                                        <span className="text-primary font-mono">{chartData?.score?.toFixed(1)}</span>
                                    </h4>
                                    <div className="space-y-2.5">
                                        {chartData?.scores && Object.entries(chartData.scores).map(([key, val]) => (
                                            <RadarScore
                                                key={key}
                                                label={key.replace(/_/g, ' ')}
                                                value={val as number}
                                                color={
                                                    (val as number) >= 70 ? '#10b981' :
                                                        (val as number) >= 40 ? '#f59e0b' : '#ef4444'
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Contractions */}
                                {chartData?.contractions && chartData.contractions.length > 0 && (
                                    <div className="bg-[#12121c] border border-[#1e1e32] rounded-lg p-3">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Contractions</h4>
                                        <div className="space-y-2">
                                            {chartData.contractions.map((c: any, i: number) => (
                                                <ContractionCard key={i} idx={i} contraction={c} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Signals */}
                                <div className="bg-[#12121c] border border-[#1e1e32] rounded-lg p-3">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Signals</h4>
                                    <div className="space-y-1">
                                        {[
                                            { label: 'TL Breakout', key: 'tl_breakout' },
                                            { label: 'Pivot Breakout', key: 'pivot_breakout' },
                                            { label: '20DMA Breakout', key: 'dma20_break' },
                                            { label: 'Volume Surge', key: 'volume_surge' },
                                            { label: 'Price Surge', key: 'price_surge' },
                                        ].map(({ label, key }) => (
                                            <SignalCard
                                                key={key}
                                                label={label}
                                                active={chartData?.signals?.[key] ?? false}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Signal Markers Legend */}
                                <div className="bg-[#12121c] border border-[#1e1e32] rounded-lg p-3">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Legend</h4>
                                    <div className="space-y-1 text-[10px]">
                                        {[
                                            { color: '#06b6d4', marker: '●', label: 'VS - Volume Surge' },
                                            { color: '#f97316', marker: '▲', label: 'PS - Price Surge' },
                                            { color: '#eab308', marker: '◆', label: 'PB - Pivot Breakout' },
                                            { color: '#d946ef', marker: '↑', label: 'DMA - 20DMA Break' },
                                            { color: '#14b8a6', marker: '■', label: 'MSB+ - MSB Breakout' },
                                            { color: '#ef4444', marker: '■', label: 'MSB- - MSB Breakdown' },
                                        ].map(({ color, marker, label }) => (
                                            <div key={label} className="flex items-center gap-2 text-slate-500">
                                                <span style={{ color }} className="font-bold">{marker}</span>
                                                <span>{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

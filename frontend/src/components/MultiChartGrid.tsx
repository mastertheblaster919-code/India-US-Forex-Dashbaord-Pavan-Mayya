import { useEffect, useRef, useState, useCallback } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    CrosshairMode,
    type IChartApi,
} from 'lightweight-charts';
import { Loader2, X, Maximize2, LayoutGrid, Grid2x2 } from 'lucide-react';

interface MultiChartGridProps {
    tickers: string[];
    chartDataMap: Record<string, any>;
    loadingTickers: Set<string>;
    onSelectTicker: (t: string) => void;
    selectedTicker: string | null;
}

const LAYOUTS = [
    { label: '2x2', cols: 2, rows: 2 },
    { label: '3x2', cols: 3, rows: 2 },
    { label: '3x3', cols: 3, rows: 3 },
    { label: '4x2', cols: 4, rows: 2 },
];

function MiniChartContainer({ 
    ticker, 
    data, 
    isLoading, 
    onRemove,
    onMaximize,
    isSelected 
}: { 
    ticker: string; 
    data: any; 
    isLoading: boolean;
    onRemove: () => void;
    onMaximize: () => void;
    isSelected: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !data?.data?.length) return;

        if (chartRef.current) {
            chartRef.current.remove();
        }

        const chart = createChart(el, {
            layout: {
                background: { type: ColorType.Solid, color: '#0a0e1a' },
                textColor: '#94a3b8',
                fontSize: 10,
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(30,41,59,0.3)' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: 'rgba(59,130,246,0.4)', style: 2 },
                horzLine: { color: 'rgba(59,130,246,0.4)', style: 2 },
            },
            rightPriceScale: { borderColor: '#1e1e32' },
            timeScale: { borderColor: '#1e1e32', timeVisible: true },
            autoSize: true,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#4ade80',
            downColor: '#f87171',
            borderVisible: false,
            wickUpColor: '#4ade80',
            wickDownColor: '#f87171',
        });

        const rows = data.data;
        candleSeries.setData(rows.map((d: any) => ({
            time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
        })));

        const ma20Data = rows.filter((d: any) => d.ema20 != null && d.ema20 !== 0)
            .map((d: any) => ({ time: d.time, value: d.ema20 }));
        if (ma20Data.length > 5) {
            const maSeries = chart.addSeries(LineSeries, { color: '#2196F399', lineWidth: 1 });
            maSeries.setData(ma20Data);
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;

        const ro = new ResizeObserver(() => {
            if (el && chart) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        });
        ro.observe(el);

        return () => {
            ro.disconnect();
            chart.remove();
        };
    }, [data]);

    if (isLoading) {
        return (
            <div className="bg-panel/40 border border-border/40 rounded-lg flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
        );
    }

    if (!data?.data?.length) {
        return (
            <div className="bg-panel/40 border border-border/40 rounded-lg flex items-center justify-center text-slate-500 text-xs">
                No data
            </div>
        );
    }

    return (
        <div className={`relative bg-panel/40 border rounded-lg overflow-hidden ${isSelected ? 'border-primary/60' : 'border-border/40'}`}>
            <div className="absolute top-1 right-1 z-10 flex gap-1">
                <button onClick={onMaximize} className="p-1 bg-black/50 rounded hover:bg-black/70">
                    <Maximize2 className="w-3 h-3 text-slate-400" />
                </button>
                <button onClick={onRemove} className="p-1 bg-black/50 rounded hover:bg-black/70">
                    <X className="w-3 h-3 text-slate-400" />
                </button>
            </div>
            <div className="px-2 py-1 border-b border-border/30 flex items-center justify-between">
                <span className="text-xs font-bold text-white">{ticker.replace('-EQ', '')}</span>
                {data.stage && (
                    <span className={`text-[9px] px-1 rounded font-bold ${
                        { 1: 'bg-emerald-900/40 text-emerald-400', 2: 'bg-blue-900/40 text-blue-400',
                           3: 'bg-amber-900/40 text-amber-400', 4: 'bg-red-900/40 text-red-400' }[data.stage as number] || ''
                    }`}>S{data.stage}</span>
                )}
            </div>
            <div ref={containerRef} className="h-[140px]" />
        </div>
    );
}

export default function MultiChartGrid({
    tickers,
    chartDataMap,
    loadingTickers,
    onSelectTicker,
    selectedTicker,
}: MultiChartGridProps) {
    const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
    const [layout, setLayout] = useState(LAYOUTS[0]);
    const [showSelector, setShowSelector] = useState(false);

    const addTicker = useCallback((t: string) => {
        if (!selectedTickers.includes(t) && selectedTickers.length < layout.cols * layout.rows) {
            setSelectedTickers(prev => [...prev, t]);
        }
        setShowSelector(false);
    }, [selectedTickers, layout.cols, layout.rows]);

    const removeTicker = useCallback((t: string) => {
        setSelectedTickers(prev => prev.filter(x => x !== t));
    }, []);

    const maximizeTicker = useCallback((t: string) => {
        onSelectTicker(t);
    }, [onSelectTicker]);

    const currentLayout = LAYOUTS.find(l => selectedTickers.length <= l.cols * l.rows) || LAYOUTS[LAYOUTS.length - 1];

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-4 bg-panel/60 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-white">Multi-Chart Grid</span>
                </div>

                <div className="h-6 w-px bg-border/50" />

                {/* Layout selector */}
                <div className="flex items-center gap-1">
                    {LAYOUTS.map(l => (
                        <button
                            key={l.label}
                            onClick={() => setLayout(l)}
                            className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                layout.label === l.label 
                                    ? 'bg-primary text-white' 
                                    : 'bg-[#1a1a28] text-slate-400 hover:text-white'
                            }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-border/50" />

                {/* Add ticker button */}
                <div className="relative">
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a28] border border-border/40 rounded-lg text-xs text-slate-300 hover:text-white hover:border-primary/40 transition-colors"
                    >
                        + Add Ticker ({selectedTickers.length}/{layout.cols * layout.rows})
                    </button>
                    
                    {showSelector && (
                        <div className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto bg-[#12121c] border border-border/40 rounded-lg shadow-xl z-50">
                            {tickers.filter(t => !selectedTickers.includes(t)).map(t => (
                                <button
                                    key={t}
                                    onClick={() => addTicker(t)}
                                    className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-primary/20 hover:text-white"
                                >
                                    {t.replace('-EQ', '')}
                                </button>
                            ))}
                            {tickers.filter(t => !selectedTickers.includes(t)).length === 0 && (
                                <div className="px-3 py-2 text-xs text-slate-500">All tickers added</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Clear all */}
                {selectedTickers.length > 0 && (
                    <button
                        onClick={() => setSelectedTickers([])}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0">
                {selectedTickers.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                        <div className="text-center">
                            <Grid2x2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>Add tickers to display multiple charts</p>
                            <p className="text-xs mt-1 text-slate-600">Click "+ Add Ticker" to get started</p>
                        </div>
                    </div>
                ) : (
                    <div 
                        className="h-full grid gap-2"
                        style={{
                            gridTemplateColumns: `repeat(${Math.min(selectedTickers.length, currentLayout.cols)}, 1fr)`,
                            gridTemplateRows: `repeat(${Math.ceil(selectedTickers.length / currentLayout.cols)}, 1fr)`,
                        }}
                    >
                        {selectedTickers.map(ticker => (
                            <MiniChartContainer
                                key={ticker}
                                ticker={ticker}
                                data={chartDataMap[ticker]}
                                isLoading={loadingTickers.has(ticker)}
                                onRemove={() => removeTicker(ticker)}
                                onMaximize={() => maximizeTicker(ticker)}
                                isSelected={ticker === selectedTicker}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

import { useQuery } from '@tanstack/react-query';
import { fetchChartData } from '../api';
import TVChart from './TVChart';
import { Loader2, X, Pin } from 'lucide-react';

interface ChartTooltipProps {
    ticker: string;
    visible: boolean;
    x: number;
    y: number;
    isSticky?: boolean;
    onClose?: () => void;
}

const sparkChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
function decodeSpark(spVal: string | number) {
    if (!spVal) return "";
    let v = typeof spVal === 'string' ? parseInt(spVal) : spVal;
    const chars = [];
    for (let i = 0; i < 8; i++) {
        chars.push(sparkChars[v % 10] || "▁");
        v = Math.floor(v / 10);
    }
    return chars.reverse().join("");
}

export default function ChartTooltip({ ticker, visible, x, y, isSticky, onClose }: ChartTooltipProps) {
    const { data: chartData, isLoading } = useQuery({
        queryKey: ['chart', ticker],
        queryFn: () => fetchChartData(ticker),
        enabled: visible && !!ticker,
        staleTime: 5 * 60 * 1000,
    });

    if (!visible) return null;

    const width = 1000;
    const height = 650;

    let left = x + 30;
    let top = y - height / 2;

    if (left + width > window.innerWidth) left = x - width - 30;
    if (top + height > window.innerHeight) top = window.innerHeight - height - 20;
    if (top < 0) top = 20;

    return (
        <div
            className={`fixed z-[9999] animate-in fade-in zoom-in-95 duration-300 ${isSticky ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}
        >
            <div className={`w-full h-full bg-[#0a0a0f] border rounded-2xl overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-500 ${isSticky ? 'border-primary/60 ring-1 ring-primary/20 shadow-[0_0_100px_rgba(79,70,229,0.3)]' : 'border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]'}`}>
                {/* Header */}
                <div className="px-4 py-3 bg-[#12121c]/80 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Pin className={`w-4 h-4 text-primary ${isSticky ? 'opacity-100 rotate-45' : 'opacity-40'}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-black text-white tracking-tighter">{ticker?.replace('-EQ', '')}</span>
                                {chartData?.stage && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${chartData.stage === 2 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        chartData.stage === 4 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            'bg-slate-500/10 text-slate-400 border-white/10'
                                        }`}>
                                        STAGE {chartData.stage}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-tight">VCP Score</span>
                            <span className={`text-xl font-black leading-tight ${chartData?.score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {chartData?.score?.toFixed(1) || '--'}
                            </span>
                        </div>
                        {isSticky && (
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white border border-transparent hover:border-white/10 ml-2">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 relative bg-[#06060c]">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <span className="text-xs text-primary/40 font-bold uppercase tracking-widest">Processing Chart...</span>
                        </div>
                    ) : chartData ? (
                        <div className="w-full h-full p-2">
                            <TVChart data={chartData} />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-mono">NO SYMBOL DATA</div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex gap-4">
                        <span className="flex gap-1">RS: <b className="text-white">{chartData?.rs?.toFixed(1)}</b></span>
                        <span className="flex gap-1">Vol: <b className="text-white">{chartData?.vol_ratio?.toFixed(2)}x</b></span>
                        <span className="flex gap-1">Tightness: <b className="text-white">{chartData?.tight}T</b></span>
                        <span className="flex gap-1 font-mono tracking-tighter text-amber-400/80">{decodeSpark(chartData?.spark)}</span>
                    </div>
                    <div className="flex gap-4 items-center">
                        <span className="text-slate-600 font-mono italic">{chartData?.checklist_str} Checklist</span>
                        {isSticky && <span className="text-primary/70 animate-pulse text-[10px] font-bold uppercase tracking-widest">Interactive Mode</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

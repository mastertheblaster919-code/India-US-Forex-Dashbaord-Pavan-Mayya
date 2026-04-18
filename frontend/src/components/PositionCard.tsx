import type { PortfolioPosition } from '../types';
import PositionChart from './PositionChart';
import { Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchChartData } from '../api';

interface PositionCardProps {
    position: PortfolioPosition;
}

export default function PositionCard({ position }: PositionCardProps) {
    const isPositive = position.pnl_pct >= 0;
    const isIndia = position.ticker.endsWith('-EQ');
    const currency = isIndia ? '₹' : '$';

    const { data: chartData, isLoading } = useQuery({
        queryKey: ['chart', position.ticker],
        queryFn: () => fetchChartData(position.ticker),
        staleTime: 5 * 60 * 1000,
    });

    return (
        <div className="bg-panel/40 border border-border/40 rounded-3xl p-6 hover:border-primary/40 transition-all duration-500 shadow-2xl group flex flex-col relative overflow-hidden backdrop-blur-xl">
            {/* Background Glow */}
            <div className={`absolute top-0 right-0 w-32 h-32 blur-[100px] -mr-16 -mt-16 transition-colors duration-700 ${isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`} />

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 uppercase">
                            {position.ticker.split('.')[0]}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 group-hover:text-slate-400 transition-colors">
                            <Clock size={10} /> {position.holding_days}d
                        </span>
                    </div>
                    <h3 className="text-lg font-black text-white leading-tight tracking-tight mt-1 group-hover:text-primary-light transition-colors line-clamp-1">
                        {position.company_name}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${position.status === '5MA Safe' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                position.status === 'Trend Confirmed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                    'bg-slate-800 text-slate-400 border-border/50'
                            }`}>
                            <ShieldCheck size={10} />
                            {position.status}
                        </span>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className={`text-2xl font-black flex items-center gap-1 tracking-tighter ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{position.pnl_pct.toFixed(2)}%
                    </div>
                    <div className={`text-[11px] font-bold px-2 py-0.5 rounded-md mt-1 ${isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {position.pnl_absolute_label}
                    </div>
                </div>
            </div>

            <div className="mb-6 relative h-[160px] bg-black/40 rounded-2xl overflow-hidden border border-white/5 shadow-inner group-hover:border-primary/20 transition-all duration-500">
                {isLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-40">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        <span className="text-[9px] font-bold text-primary/60 uppercase tracking-[0.2em]">Loading Engine...</span>
                    </div>
                ) : chartData ? (
                    <PositionChart data={chartData} />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-700 font-mono">
                        DATA_MISSING
                    </div>
                )}

                {/* Visual Price Tag */}
                <div
                    className="absolute right-0 w-full border-t border-dashed border-white/5 flex justify-end pointer-events-none group-hover:border-primary/10 transition-colors"
                    style={{ top: '55%' }}
                >
                    <div className="bg-slate-900/90 backdrop-blur-md text-[10px] font-black text-white px-2 py-1 rounded-l-lg -mt-3 shadow-2xl border border-white/10 group-hover:border-primary/30 transition-all">
                        {currency}{position.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-auto relative z-10">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Entry Price</span>
                    <span className="text-[13px] font-mono font-bold text-slate-300">{currency} {position.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col justify-between hover:bg-white/[0.04] transition-colors text-right">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Current Mkt</span>
                    <span className={`text-[13px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {currency} {position.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Interaction Mask */}
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-700" />
        </div>
    );
}

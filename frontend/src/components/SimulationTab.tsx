import { Loader2, Zap, DollarSign, TrendingDown, Activity } from 'lucide-react';

interface SimulationTabProps {
    simResults: any;
    loading: boolean;
    selectedTicker: string | null;
    onSelectTicker: (t: string) => void;
}

function MetricCard({ icon: Icon, label, value, color, sub }: {
    icon: any; label: string; value: string; color: string; sub?: string;
}) {
    return (
        <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
            </div>
            <p className="text-xl font-bold" style={{ color }}>{value}</p>
            {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );
}

export default function SimulationTab({ simResults, loading, selectedTicker, onSelectTicker }: SimulationTabProps) {
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                    <span className="text-sm text-slate-400">Running simulation…</span>
                </div>
            </div>
        );
    }

    // Extract metrics from simResults
    const portfolioValue = simResults?.portfolio_value ?? 100000;
    const maxDrawdown = simResults?.max_drawdown ?? 0;
    const totalTrades = simResults?.total_trades ?? 0;
    const openPositions = simResults?.open_positions ?? [];
    const tradeLog = simResults?.trade_log ?? [];

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center gap-3 bg-panel/60 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                <Zap className="w-4 h-4 text-orange-400" />
                <h2 className="text-sm font-bold text-white">Paper Trading Simulation</h2>
                <span className="text-[11px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full font-mono">
                    Live Mode Available
                </span>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard icon={DollarSign} label="Portfolio Value" value={`$${portfolioValue.toLocaleString()}`} color="#10b981" />
                <MetricCard icon={Activity} label="Open Positions" value={`${openPositions.length}`} color="#3b82f6" />
                <MetricCard icon={TrendingDown} label="Max Drawdown" value={`${maxDrawdown.toFixed(2)}%`} color="#ef4444" />
                <MetricCard icon={Zap} label="Total Trades" value={`${totalTrades}`} color="#f59e0b" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Open Positions */}
                <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm flex flex-col">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Open Positions</h3>
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {openPositions.length > 0 ? (
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border/30">
                                        <th className="text-left py-2 text-slate-500 font-semibold">Ticker</th>
                                        <th className="text-right py-2 text-slate-500 font-semibold">Entry</th>
                                        <th className="text-right py-2 text-slate-500 font-semibold">Current</th>
                                        <th className="text-right py-2 text-slate-500 font-semibold">P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openPositions.map((p: any) => (
                                        <tr key={p.ticker} onClick={() => onSelectTicker(p.ticker)}
                                            className={`border-b border-border/20 hover:bg-[#1a1a28] cursor-pointer transition-colors
                        ${selectedTicker === p.ticker ? 'bg-primary/5' : ''}`}>
                                            <td className="py-2 font-bold text-blue-400">{p.ticker}</td>
                                            <td className="py-2 text-right font-mono text-slate-300">${p.entry_price?.toFixed(2)}</td>
                                            <td className="py-2 text-right font-mono text-slate-300">${p.current_price?.toFixed(2)}</td>
                                            <td className={`py-2 text-right font-mono font-bold ${p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {p.pnl >= 0 ? '+' : ''}{p.pnl?.toFixed(2)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-xs text-slate-500 text-center py-8">No open positions</p>
                        )}
                    </div>
                </div>

                {/* Trade Log */}
                <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm flex flex-col">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trade Log</h3>
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {tradeLog.length > 0 ? (
                            <div className="space-y-1.5">
                                {tradeLog.map((t: any, i: number) => (
                                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] ${t.result === 'win' || t.pnl > 0
                                            ? 'bg-emerald-900/10 border-emerald-900/30'
                                            : 'bg-red-900/10 border-red-900/30'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-blue-300">{t.ticker}</span>
                                            <span className="text-slate-500">{t.date || t.exit_date}</span>
                                        </div>
                                        <span className={`font-mono font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 text-center py-8">No trades yet</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState } from 'react';
import { Loader2, BookOpen, Play, TrendingUp, Target, Percent, BarChart3 } from 'lucide-react';

interface BacktestTabProps {
    tickers: string[];
    onRunBacktest: (ticker: string, period: string, threshold: number) => void;
    backtestResult: any;
    loading: boolean;
}

function KPI({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon: any }) {
    return (
        <div className="bg-[#12121c] border border-border/30 rounded-lg p-4 text-center">
            <Icon className="w-5 h-5 mx-auto mb-1.5" style={{ color }} />
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
        </div>
    );
}

export default function BacktestTab({ tickers, onRunBacktest, backtestResult, loading }: BacktestTabProps) {
    const [ticker, setTicker] = useState('');
    const [period, setPeriod] = useState('1y');
    const [threshold, setThreshold] = useState(60);

    const handleRun = () => {
        if (ticker) onRunBacktest(ticker, period, threshold);
    };

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center gap-3 bg-panel/60 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Historical Backtest</h2>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 bg-[#0e0e18] border border-border/40 rounded-xl p-4">
                <div>
                    <label className="filter-label">Select Ticker</label>
                    <select value={ticker} onChange={e => setTicker(e.target.value)} className="sidebar-select min-w-[140px]">
                        <option value="">Choose…</option>
                        {tickers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="filter-label">Period</label>
                    <div className="flex gap-1">
                        {['2y', '1y', '6mo'].map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${period === p ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-[#1a1a28] text-slate-500 border border-transparent'
                                    }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="filter-label">Score Threshold: {threshold}</label>
                    <input type="range" min={0} max={100} step={5} value={threshold}
                        onChange={e => setThreshold(+e.target.value)} className="sidebar-slider w-32" />
                </div>
                <button onClick={handleRun} disabled={!ticker || loading}
                    className="sidebar-btn sidebar-btn-primary flex items-center gap-1.5 self-end">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run Backtest
                </button>
            </div>

            {/* Results */}
            {backtestResult && (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KPI icon={BarChart3} label="Total Trades" value={`${backtestResult.total_trades ?? 0}`} color="#3b82f6" />
                        <KPI icon={Target} label="Win Rate" value={`${(backtestResult.win_rate ?? 0).toFixed(1)}%`} color="#10b981" />
                        <KPI icon={Percent} label="Avg P&L" value={`${(backtestResult.avg_pnl ?? 0).toFixed(2)}%`} color="#f59e0b" />
                        <KPI icon={TrendingUp} label="Profit Factor" value={`${(backtestResult.profit_factor ?? 0).toFixed(2)}`} color="#a78bfa" />
                    </div>

                    {/* Cumulative Curve (text-based for now) */}
                    <div className="bg-panel/60 border border-border/40 rounded-xl p-5 backdrop-blur-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Cumulative P&L Curve</h3>
                        {backtestResult.cumulative_pnl && backtestResult.cumulative_pnl.length > 0 ? (
                            <div className="flex items-end gap-px h-32">
                                {backtestResult.cumulative_pnl.map((v: number, i: number) => {
                                    const maxVal = Math.max(...backtestResult.cumulative_pnl.map(Math.abs), 1);
                                    const pct = (Math.abs(v) / maxVal) * 100;
                                    return (
                                        <div key={i} className="flex-1 flex flex-col justify-end items-center">
                                            <div
                                                className="w-full rounded-t transition-all"
                                                style={{
                                                    height: `${pct}%`,
                                                    background: v >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)',
                                                    minHeight: '2px'
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 text-center py-6">No P&L data</p>
                        )}
                    </div>

                    {/* Trade Log */}
                    <div className="bg-panel/60 border border-border/40 rounded-xl p-5 backdrop-blur-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trade Log</h3>
                        <div className="overflow-auto max-h-60 custom-scrollbar">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border/30">
                                        <th className="text-left py-2 text-slate-500">#</th>
                                        <th className="text-left py-2 text-slate-500">Entry Date</th>
                                        <th className="text-left py-2 text-slate-500">Exit Date</th>
                                        <th className="text-right py-2 text-slate-500">Entry</th>
                                        <th className="text-right py-2 text-slate-500">Exit</th>
                                        <th className="text-right py-2 text-slate-500">P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(backtestResult.trades ?? []).map((t: any, i: number) => (
                                        <tr key={i} className="border-b border-border/15 hover:bg-[#1a1a28]">
                                            <td className="py-2 text-slate-500">{i + 1}</td>
                                            <td className="py-2 font-mono text-slate-300">{t.entry_date}</td>
                                            <td className="py-2 font-mono text-slate-300">{t.exit_date}</td>
                                            <td className="py-2 text-right font-mono text-slate-300">${t.entry_price?.toFixed(2)}</td>
                                            <td className="py-2 text-right font-mono text-slate-300">${t.exit_price?.toFixed(2)}</td>
                                            <td className={`py-2 text-right font-mono font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {!backtestResult && !loading && (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                    Select a ticker and run backtest to see results
                </div>
            )}
        </div>
    );
}

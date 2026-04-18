import { useState } from 'react';
import { Loader2, TrendingUp, Play, Award, Target, Shield, Crosshair } from 'lucide-react';

interface ForwardTabProps {
    onRun: (params: { depth: number; minScore: number; topPicks: number; targetPct: number; stopPct: number }) => void;
    result: any;
    loading: boolean;
    selectedTicker: string | null;
    onSelectTicker: (t: string) => void;
}

export default function ForwardTab({ onRun, result, loading, selectedTicker, onSelectTicker }: ForwardTabProps) {
    const [depth, setDepth] = useState(10);
    const [minScore, setMinScore] = useState(60);
    const [topPicks, setTopPicks] = useState(10);
    const [targetPct, setTargetPct] = useState(10);
    const [stopPct, setStopPct] = useState(5);

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center gap-3 bg-panel/60 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Forward Performance Tracking</h2>
                <span className="text-[11px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full">Institutional-Style</span>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 bg-[#0e0e18] border border-border/40 rounded-xl p-4">
                <div>
                    <label className="filter-label">Tracking Depth: {depth}d</label>
                    <input type="range" min={5} max={20} value={depth} onChange={e => setDepth(+e.target.value)} className="sidebar-slider w-28" />
                </div>
                <div>
                    <label className="filter-label">Min VCP Score: {minScore}</label>
                    <input type="range" min={40} max={95} step={5} value={minScore} onChange={e => setMinScore(+e.target.value)} className="sidebar-slider w-28" />
                </div>
                <div>
                    <label className="filter-label">Top Picks</label>
                    <div className="flex gap-1">
                        {[5, 10, 20].map(n => (
                            <button key={n} onClick={() => setTopPicks(n)}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${topPicks === n ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-[#1a1a28] text-slate-500 border border-transparent'
                                    }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="filter-label">Target %: {targetPct}</label>
                    <input type="range" min={3} max={30} value={targetPct} onChange={e => setTargetPct(+e.target.value)} className="sidebar-slider w-24" />
                </div>
                <div>
                    <label className="filter-label">Stop %: {stopPct}</label>
                    <input type="range" min={2} max={15} value={stopPct} onChange={e => setStopPct(+e.target.value)} className="sidebar-slider w-24" />
                </div>
                <button onClick={() => onRun({ depth, minScore, topPicks, targetPct, stopPct })} disabled={loading}
                    className="sidebar-btn sidebar-btn-primary flex items-center gap-1.5">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run Institutional Forward Tracking
                </button>
            </div>

            {/* Results */}
            {result && (
                <>
                    {/* Executive Summary */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm text-center">
                            <Award className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-emerald-400">{result.summary?.win_rate?.toFixed(1) ?? '—'}%</p>
                            <p className="text-[9px] text-slate-500 uppercase">Win Rate</p>
                        </div>
                        <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm text-center">
                            <Target className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-blue-400">{result.summary?.avg_return?.toFixed(2) ?? '—'}%</p>
                            <p className="text-[9px] text-slate-500 uppercase">Avg Return</p>
                        </div>
                        <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm text-center">
                            <Shield className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-amber-400">{result.summary?.profit_factor?.toFixed(2) ?? '—'}</p>
                            <p className="text-[9px] text-slate-500 uppercase">Profit Factor</p>
                        </div>
                        <div className="bg-panel/60 border border-border/40 rounded-xl p-4 backdrop-blur-sm text-center">
                            <Crosshair className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-purple-400">{result.summary?.total_alpha?.toFixed(2) ?? '—'}%</p>
                            <p className="text-[9px] text-slate-500 uppercase">Total Alpha</p>
                        </div>
                    </div>

                    {/* Daily Alpha Curve */}
                    {result.daily_alpha && result.daily_alpha.length > 0 && (
                        <div className="bg-panel/60 border border-border/40 rounded-xl p-5 backdrop-blur-sm">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Daily Alpha Generation</h3>
                            <div className="flex items-end gap-1 h-28">
                                {result.daily_alpha.map((d: any, i: number) => {
                                    const maxAlpha = Math.max(...result.daily_alpha.map((x: any) => Math.abs(x.alpha ?? x)), 1);
                                    const val = d.alpha ?? d;
                                    const pct = (Math.abs(val) / maxAlpha) * 100;
                                    return (
                                        <div key={i} className="flex-1 flex flex-col justify-end items-center gap-0.5">
                                            <div
                                                className="w-full rounded-t transition-all"
                                                style={{
                                                    height: `${pct}%`, minHeight: '2px',
                                                    background: val >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'
                                                }}
                                            />
                                            <span className="text-[7px] text-slate-600">{d.day ?? i + 1}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Trade Ledger */}
                    <div className="bg-panel/60 border border-border/40 rounded-xl p-5 backdrop-blur-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trade Ledger</h3>
                        <div className="overflow-auto max-h-72 custom-scrollbar">
                            {(result.ledger ?? []).length > 0 ? (
                                <div className="space-y-1.5">
                                    {result.ledger.map((t: any, i: number) => (
                                        <div key={i}
                                            onClick={() => onSelectTicker(t.ticker)}
                                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] cursor-pointer transition-all
                        ${t.status === 'Target Hit' || t.return_pct > 0
                                                    ? 'bg-emerald-900/10 border-emerald-900/30 hover:bg-emerald-900/20'
                                                    : 'bg-red-900/10 border-red-900/30 hover:bg-red-900/20'}
                        ${selectedTicker === t.ticker ? 'ring-1 ring-primary' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-blue-300">{t.ticker}</span>
                                                <span className="text-slate-500">{t.date}</span>
                                                <span className="text-slate-500">Score: {t.score?.toFixed(0)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.status === 'Target Hit' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                                    }`}>
                                                    {t.status}
                                                </span>
                                                <span className={`font-mono font-bold ${t.return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {t.return_pct >= 0 ? '+' : ''}{t.return_pct?.toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 text-center py-6">No trades in ledger</p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {!result && !loading && (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                    Configure parameters and run forward tracking
                </div>
            )}
        </div>
    );
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, BarChart3, PieChart, Trophy, Activity } from 'lucide-react';
import { fetchBreadthHistory } from '../api';
import type { ScanResult } from '../types';

interface HeatmapTabProps {
    results: ScanResult[] | undefined;
    marketKey?: string;
}

function SectorCell({ sector, avgScore }: { sector: string; avgScore: number }) {
    const intensity = Math.min(1, avgScore / 100);
    const bg = avgScore >= 70
        ? `rgba(16,185,129,${intensity * 0.5})`
        : avgScore >= 40
            ? `rgba(245,158,11,${intensity * 0.4})`
            : `rgba(239,68,68,${intensity * 0.35})`;

    return (
        <div
            className="relative rounded px-2 py-1.5 border border-border/20 flex flex-col items-center justify-center cursor-default"
            style={{ background: bg, minHeight: '40px' }}
        >
            <span className="text-[9px] font-semibold text-white/90 text-center truncate max-w-full">{sector}</span>
            <span className="text-xs font-bold text-white">{avgScore.toFixed(0)}</span>
        </div>
    );
}

function ScoreHistogram({ results }: { results: ScanResult[] }) {
    const buckets = useMemo(() => {
        const b: number[] = new Array(10).fill(0);
        results.forEach(r => {
            const idx = Math.min(9, Math.floor((r.score ?? 0) / 10));
            b[idx]++;
        });
        return b;
    }, [results]);

    const maxBucket = Math.max(...buckets, 1);

    return (
        <div className="flex items-end gap-px h-20">
            {buckets.map((count, i) => {
                const pct = (count / maxBucket) * 100;
                const color = i >= 7 ? '#10b981' : i >= 4 ? '#f59e0b' : '#ef4444';
                return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                        <div
                            className="w-full rounded-t transition-all"
                            style={{ height: `${pct}%`, minHeight: count > 0 ? '2px' : '0', background: color, opacity: 0.7 }}
                        />
                    </div>
                );
            })}
        </div>
    );
}

function StageBreakdown({ results }: { results: ScanResult[] }) {
    const stages = useMemo(() => {
        const m: Record<number, number> = {};
        results.forEach(r => { m[r.stage] = (m[r.stage] || 0) + 1; });
        return Object.entries(m).sort(([a], [b]) => +a - +b).map(([stage, count]) => ({ stage: +stage, count }));
    }, [results]);

    const total = results.length || 1;
    const colors: Record<number, string> = { 1: '#10b981', 2: '#3b82f6', 3: '#f59e0b', 4: '#ef4444' };

    return (
        <div className="space-y-1">
            {stages.map(s => (
                <div key={s.stage} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold w-5" style={{ color: colors[s.stage] }}>S{s.stage}</span>
                    <div className="flex-1 h-3 bg-[#1a1a28] rounded overflow-hidden">
                        <div
                            className="h-full rounded transition-all"
                            style={{ width: `${(s.count / total) * 100}%`, background: colors[s.stage] + '60' }}
                        />
                    </div>
                    <span className="text-[8px] text-slate-500 w-8 text-right">{s.count}</span>
                </div>
            ))}
        </div>
    );
}

export default function HeatmapTab({ results, marketKey = 'IN' }: HeatmapTabProps) {
    // Fetch real breadth history data from backend
    const { data: breadthData2 } = useQuery({
        queryKey: ['breadthHistory', marketKey],
        queryFn: () => fetchBreadthHistory(marketKey, 500),
        staleTime: 1000 * 60 * 30, // 30 minutes
    });

    const sectorData = useMemo(() => {
        if (!results) return [];
        const map: Record<string, { total: number; count: number }> = {}; // group by sector
        results.forEach(r => {
            const sec = r.sector || 'Unknown';
            if (!map[sec]) map[sec] = { total: 0, count: 0 };
            map[sec].total += r.score ?? 0;
            map[sec].count++;
        });
        return Object.entries(map)
            .map(([sector, d]) => ({ sector, avgScore: d.total / d.count, count: d.count }))
            .sort((a, b) => b.avgScore - a.avgScore);
    }, [results]);

    const topBreakout = useMemo(() => {
        if (!results) return [];
        return [...results]
            .filter(r => r.score >= 60)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    }, [results]);

    // Market Breadth calculations
    const breadthData = useMemo(() => {
        if (!results || results.length === 0) return null;
        const data = results as any[];
        const total = data.length;
        let vcpSignals = 0, pdhBreakout = 0, squeeze = 0, tierEnc = 0;
        let oversold = 0, neutral = 0, overbought = 0;
        let nearHigh = 0, midRange = 0, nearLow = 0;
        data.forEach((r: any) => {
            if ((r.rolling_score || 0) >= 70 && (r.vol_ratio || 0) > 1.2) vcpSignals++;
            if (r.pdh_brk === 1) pdhBreakout++;
            if (r.squeeze === 1) squeeze++;
            if (r.tier_enc > 0) tierEnc++;
            const rsi = r.rsi || 50;
            if (rsi < 30) oversold++; else if (rsi > 70) overbought++; else neutral++;
            const pctOff = r.pct_off_high || 0;
            if (pctOff < 5) nearHigh++; else if (pctOff > 20) nearLow++; else midRange++;
        });
        const signalScore = (vcpSignals / total) * 100;
        const volumeScore = ((data.filter((r: any) => (r.vol_ratio || 0) > 1.5).length) / total) * 100;
        const breadthScore = Math.round((signalScore + volumeScore) / 2);
        return { total, vcpSignals, pdhBreakout, squeeze, tierEnc, rsi: { oversold, neutral, overbought }, pricePos: { nearHigh, midRange, nearLow }, breadthScore, signalScore: Math.round(signalScore), volumeScore: Math.round(volumeScore) };
    }, [results]);

    const data = results ?? [];

    return (
        <div className="flex flex-col h-full gap-2 overflow-y-auto custom-scrollbar p-2">
            {/* Header - compact */}
            <div className="flex items-center gap-2 bg-panel/60 border border-border/50 rounded-lg px-3 py-1.5">
                <Flame className="w-3 h-3 text-orange-400" />
                <h2 className="text-xs font-bold text-white">Heatmap & Stats</h2>
                <span className="text-[9px] font-mono bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded">
                    {data.length} tickers
                </span>
            </div>

            {/* % Stocks Above 20 DMA - REAL DATA */}
            <div className="bg-black border-2 border-blue-500 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-bold text-white">% Stocks Above 20 DMA</span>
                    </div>
                    {breadthData2?.success && (
                        <span className="text-[10px] text-green-400">{breadthData2.total_days} days</span>
                    )}
                </div>
                {breadthData2?.success && breadthData2.data ? (
                    <div className="flex gap-px h-28 overflow-x-auto">
                        {breadthData2.data.map((d, i) => {
                            const h = Math.max(10, Math.min(95, d.pct_above_20dma));
                            const color = d.pct_above_20dma >= 60 ? '#22c55e' : d.pct_above_20dma >= 40 ? '#eab308' : '#ef4444';
                            const dateObj = new Date(d.date);
                            const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
                            return (
                                <div key={i} className="flex-shrink-0 w-2 flex flex-col justify-end items-center">
                                    <div className="w-full rounded-t-sm" style={{ height: `${h}%`, backgroundColor: color }} title={`${d.date}: ${d.pct_above_20dma}% (${d.stocks_above}/${d.total_stocks})`} />
                                    {i % 30 === 0 && <span className="text-[5px] text-slate-400 mt-0.5 whitespace-nowrap">{dateStr}</span>}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-28 flex items-center justify-center text-slate-500 text-sm">
                        {breadthData2?.error || 'Loading breadth data...'}
                    </div>
                )}
                <div className="flex justify-between mt-2 text-[10px] font-bold">
                    <span className="text-red-400">{breadthData2?.data && breadthData2.data.length > 0 ? breadthData2.data[0].date : '500 days ago'}</span>
                    <span className="text-green-400">{breadthData2?.data && breadthData2.data.length > 0 ? breadthData2.data[breadthData2.data.length - 1].date : 'Today'}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {/* Sector Heatmap */}
                <div className="bg-panel/60 border border-border/40 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-2">
                        <PieChart className="w-3 h-3 text-cyan-400" />
                        <h3 className="text-[9px] font-bold text-slate-300 uppercase">Sectors</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                        {sectorData.slice(0, 9).map(s => (
                            <SectorCell key={s.sector} sector={s.sector} avgScore={s.avgScore} />
                        ))}
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-panel/60 border border-border/40 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 className="w-3 h-3 text-purple-400" />
                        <h3 className="text-[9px] font-bold text-slate-300 uppercase">Score Dist</h3>
                    </div>
                    <ScoreHistogram results={data} />
                </div>

                {/* Stage Breakdown */}
                <div className="bg-panel/60 border border-border/40 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 className="w-3 h-3 text-yellow-400" />
                        <h3 className="text-[9px] font-bold text-slate-300 uppercase">Stages</h3>
                    </div>
                    <StageBreakdown results={data} />
                </div>

                {/* Market Breadth */}
                <div className="bg-panel/60 border border-border/40 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Activity className="w-3 h-3 text-green-400" />
                        <h3 className="text-[9px] font-bold text-slate-300 uppercase">Breadth</h3>
                    </div>
                    {breadthData && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] text-slate-500">Score</span>
                                <span className={`text-[10px] font-bold ${breadthData.breadthScore >= 60 ? 'text-green-400' : breadthData.breadthScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {breadthData.breadthScore}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <div className="text-center bg-[#12121c] rounded py-1">
                                    <div className="text-[9px] font-bold text-amber-400">{breadthData.vcpSignals}</div>
                                    <div className="text-[7px] text-slate-500">VCP</div>
                                </div>
                                <div className="text-center bg-[#12121c] rounded py-1">
                                    <div className="text-[9px] font-bold text-green-400">{breadthData.pdhBreakout}</div>
                                    <div className="text-[7px] text-slate-500">PDH</div>
                                </div>
                                <div className="text-center bg-[#12121c] rounded py-1">
                                    <div className="text-[9px] font-bold text-purple-400">{breadthData.squeeze}</div>
                                    <div className="text-[7px] text-slate-500">Sqz</div>
                                </div>
                                <div className="text-center bg-[#12121c] rounded py-1">
                                    <div className="text-[9px] font-bold text-cyan-400">{breadthData.rsi.oversold}</div>
                                    <div className="text-[7px] text-slate-500">OS</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Breakout - compact */}
            <div className="bg-panel/60 border border-border/40 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-2">
                    <Trophy className="w-3 h-3 text-amber-400" />
                    <h3 className="text-[9px] font-bold text-slate-300 uppercase">Top Picks</h3>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                    {topBreakout.slice(0, 8).map((r, i) => (
                        <div key={r.ticker} className="flex-shrink-0 flex items-center gap-1.5 bg-[#12121c] rounded px-2 py-1 border border-border/20">
                            <span className="text-[8px] text-slate-500">#{i + 1}</span>
                            <span className="text-[9px] font-bold text-blue-400">{r.ticker}</span>
                            <span className={`text-[8px] font-mono ${r.score >= 80 ? 'text-emerald-400' : 'text-blue-400'}`}>{r.score?.toFixed(0)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

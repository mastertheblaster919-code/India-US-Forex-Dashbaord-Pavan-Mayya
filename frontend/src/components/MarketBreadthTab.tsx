import { useMemo } from 'react';
import { TrendingUp, Activity, BarChart3, PieChart } from 'lucide-react';

interface MarketBreadthTabProps {
    results?: any[];
}

export default function MarketBreadthTab({ results }: MarketBreadthTabProps) {
    const breadthData = useMemo(() => {
        if (!results || results.length === 0) return null;

        // Calculate various breadth metrics from scan results
        const total = results.length;
        
        // Stage distribution
        const stages = { 1: 0, 2: 0, 3: 0, 4: 0 };
        results.forEach(r => {
            const stage = r.stage || 0;
            if (stage >= 1 && stage <= 4) stages[stage as keyof typeof stages]++;
        });

        // Signal distribution
        let pdhBreakout = 0;
        let vcpSignals = 0;
        let squeeze = 0;
        let tierEnc = 0;
        
        results.forEach(r => {
            if (r.pdh_brk === 1) pdhBreakout++;
            if ((r.rolling_score || 0) >= 70 && (r.vol_ratio || 0) > 1.2) vcpSignals++;
            if (r.squeeze === 1) squeeze++;
            if (r.tier_enc > 0) tierEnc++;
        });

        // RSI distribution
        let oversold = 0, neutral = 0, overbought = 0;
        results.forEach(r => {
            const rsi = r.rsi || 50;
            if (rsi < 30) oversold++;
            else if (rsi > 70) overbought++;
            else neutral++;
        });

        // Price position (% off high)
        let nearHigh = 0, midRange = 0, nearLow = 0;
        results.forEach(r => {
            const pctOff = r.pct_off_high || 0;
            if (pctOff < 5) nearHigh++;
            else if (pctOff > 20) nearLow++;
            else midRange++;
        });

        // Volume ratio analysis
        let highVol = 0, normalVol = 0, lowVol = 0;
        results.forEach(r => {
            const volRatio = r.vol_ratio || 1;
            if (volRatio > 1.5) highVol++;
            else if (volRatio < 0.8) lowVol++;
            else normalVol++;
        });

        // Calculate composite breadth score (0-100)
        const signalScore = (vcpSignals / total) * 100;
        const stageScore = ((stages[1] + stages[2]) / total) * 100;
        const volumeScore = (highVol / total) * 100;
        const breadthScore = Math.round((signalScore + stageScore + volumeScore) / 3);

        return {
            total,
            stages,
            pdhBreakout,
            vcpSignals,
            squeeze,
            tierEnc,
            rsi: { oversold, neutral, overbought },
            pricePos: { nearHigh, midRange, nearLow },
            vol: { highVol, normalVol, lowVol },
            breadthScore,
            signalScore: Math.round(signalScore),
            stageScore: Math.round(stageScore),
            volumeScore: Math.round(volumeScore)
        };
    }, [results]);

    if (!breadthData) {
        return (
            <div className="p-4 text-center text-slate-500">
                No scan data available for market breadth analysis
            </div>
        );
    }

    const getScoreColor = (score: number) => {
        if (score >= 60) return 'text-green-400';
        if (score >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 60) return 'Strong';
        if (score >= 40) return 'Neutral';
        return 'Weak';
    };

    return (
        <div className="p-4 space-y-4 overflow-y-auto h-full">
            {/* Header */}
            <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Market Breadth & Health</h2>
                <span className="text-[11px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full">
                    {breadthData.total} stocks
                </span>
            </div>

            {/* Composite Score */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Composite Breadth Score</h3>
                    <span className={`text-2xl font-bold ${getScoreColor(breadthData.breadthScore)}`}>
                        {breadthData.breadthScore}/100
                    </span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all ${breadthData.breadthScore >= 60 ? 'bg-green-500' : breadthData.breadthScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${breadthData.breadthScore}%` }}
                    />
                </div>
                <div className="mt-2 text-center text-sm text-slate-400">
                    Market Strength: <span className={getScoreColor(breadthData.breadthScore)}>{getScoreLabel(breadthData.breadthScore)}</span>
                </div>
            </div>

            {/* Component Scores */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 text-center">
                    <div className="text-[10px] uppercase text-slate-500 mb-2">VCP Signal Score</div>
                    <div className={`text-xl font-bold ${getScoreColor(breadthData.signalScore)}`}>{breadthData.signalScore}</div>
                    <div className="text-[10px] text-slate-500">{breadthData.vcpSignals} signals</div>
                </div>
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 text-center">
                    <div className="text-[10px] uppercase text-slate-500 mb-2">Stage Score</div>
                    <div className={`text-xl font-bold ${getScoreColor(breadthData.stageScore)}`}>{breadthData.stageScore}</div>
                    <div className="text-[10px] text-slate-500">{breadthData.stages[1] + breadthData.stages[2]} early stage</div>
                </div>
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 text-center">
                    <div className="text-[10px] uppercase text-slate-500 mb-2">Volume Score</div>
                    <div className={`text-xl font-bold ${getScoreColor(breadthData.volumeScore)}`}>{breadthData.volumeScore}</div>
                    <div className="text-[10px] text-slate-500">{breadthData.vol.highVol} high vol</div>
                </div>
            </div>

            {/* Stage Distribution */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stage Distribution</h3>
                </div>
                <div className="space-y-2">
                    {[
                        { label: 'Stage 1 (Accumulation)', value: breadthData.stages[1], color: 'bg-purple-500' },
                        { label: 'Stage 2 (Uptrend)', value: breadthData.stages[2], color: 'bg-green-500' },
                        { label: 'Stage 3 (Distribution)', value: breadthData.stages[3], color: 'bg-red-500' },
                        { label: 'Stage 4 (Downtrend)', value: breadthData.stages[4], color: 'bg-gray-500' },
                    ].map(item => (
                        <div key={item.label} className="flex items-center gap-3">
                            <div className="w-32 text-xs text-slate-500">{item.label}</div>
                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full ${item.color}`} style={{ width: `${(item.value / breadthData.total) * 100}%` }} />
                            </div>
                            <div className="w-12 text-xs text-right text-white">{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* RSI Distribution */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">RSI Distribution</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">{breadthData.rsi.oversold}</div>
                        <div className="text-[10px] text-slate-500">Oversold (&lt;30)</div>
                        <div className="text-[10px] text-blue-400">{((breadthData.rsi.oversold / breadthData.total) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-bold text-yellow-400">{breadthData.rsi.neutral}</div>
                        <div className="text-[10px] text-slate-500">Neutral (30-70)</div>
                        <div className="text-[10px] text-yellow-400">{((breadthData.rsi.neutral / breadthData.total) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-bold text-red-400">{breadthData.rsi.overbought}</div>
                        <div className="text-[10px] text-slate-500">Overbought (&gt;70)</div>
                        <div className="text-[10px] text-red-400">{((breadthData.rsi.overbought / breadthData.total) * 100).toFixed(0)}%</div>
                    </div>
                </div>
            </div>

            {/* Key Signals */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Key Signals</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">PDH Breakouts</span>
                        <span className="font-bold text-green-400">{breadthData.pdhBreakout}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">VCP Setups</span>
                        <span className="font-bold text-amber-400">{breadthData.vcpSignals}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Squeeze Active</span>
                        <span className="font-bold text-purple-400">{breadthData.squeeze}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Tier Encircled</span>
                        <span className="font-bold text-cyan-400">{breadthData.tierEnc}</span>
                    </div>
                </div>
            </div>

            {/* Price Position */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                    <PieChart className="w-4 h-4 text-orange-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Price Position (% Off High)</h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-green-400">Near High (&lt;5%)</span>
                            <span className="text-white">{breadthData.pricePos.nearHigh}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${(breadthData.pricePos.nearHigh / breadthData.total) * 100}%` }} />
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-yellow-400">Mid Range</span>
                            <span className="text-white">{breadthData.pricePos.midRange}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-500" style={{ width: `${(breadthData.pricePos.midRange / breadthData.total) * 100}%` }} />
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-red-400">Near Low (&gt;20%)</span>
                            <span className="text-white">{breadthData.pricePos.nearLow}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: `${(breadthData.pricePos.nearLow / breadthData.total) * 100}%` }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

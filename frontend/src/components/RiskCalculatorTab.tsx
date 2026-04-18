import { useState, useMemo } from 'react';
import { Calculator, TrendingUp, TrendingDown, DollarSign, Percent, Target, AlertTriangle } from 'lucide-react';

interface RiskCalculatorTabProps {
    results?: any[];
}

export default function RiskCalculatorTab({ results }: RiskCalculatorTabProps) {
    const [capital, setCapital] = useState(100000);
    const [riskPercent, setRiskPercent] = useState(2);
    const [entryPrice, setEntryPrice] = useState(0);
    const [stopLoss, setStopLoss] = useState(0);
    const [targetPrice, setTargetPrice] = useState(0);
    const [selectedTicker, setSelectedTicker] = useState('');

    const calculations = useMemo(() => {
        if (!entryPrice || !stopLoss || entryPrice <= 0 || stopLoss <= 0) {
            return null;
        }

        const riskAmount = capital * (riskPercent / 100);
        const riskPerShare = entryPrice - stopLoss;
        const isLong = entryPrice > stopLoss;
        
        if (riskPerShare <= 0) {
            return null;
        }

        const positionSize = Math.floor(riskAmount / riskPerShare);
        const positionValue = positionSize * entryPrice;
        const requiredCapital = positionValue;
        
        let rewardPerShare = 0;
        let rewardRiskRatio = 0;
        let targetPnl = 0;
        let stopPnl = 0;

        if (targetPrice && targetPrice > 0) {
            rewardPerShare = isLong ? targetPrice - entryPrice : entryPrice - targetPrice;
            rewardRiskRatio = rewardPerShare > 0 ? rewardPerShare / riskPerShare : 0;
            targetPnl = positionSize * rewardPerShare;
        }

        stopPnl = -riskAmount;

        return {
            riskAmount,
            riskPerShare,
            positionSize,
            positionValue,
            requiredCapital,
            rewardRiskRatio,
            targetPnl,
            stopPnl,
            isLong,
            leverage: requiredCapital > capital ? (requiredCapital / capital).toFixed(1) + 'x' : '1x'
        };
    }, [capital, riskPercent, entryPrice, stopLoss, targetPrice]);

    const quickSetFromResults = (ticker: string) => {
        const stock = results?.find((r: any) => r.ticker === ticker);
        if (stock) {
            setSelectedTicker(ticker);
            setEntryPrice(stock.last_price || 0);
            // Set stop loss at 1% below entry as default
            if (stock.last_price) {
                setStopLoss(stock.last_price * 0.99);
                setTargetPrice(stock.last_price * 1.05);
            }
        }
    };

    return (
        <div className="p-4 space-y-4 overflow-y-auto h-full">
            {/* Header */}
            <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Risk Calculator & Position Sizing</h2>
            </div>

            {/* Quick Select from Results */}
            {results && results.length > 0 && (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 block">
                        Quick Set from Scan Results
                    </label>
                    <select
                        value={selectedTicker}
                        onChange={(e) => quickSetFromResults(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                        <option value="">Select a stock...</option>
                        {results.slice(0, 50).map((r: any) => (
                            <option key={r.ticker} value={r.ticker}>
                                {r.ticker} - ¥{r.last_price?.toFixed(2)}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Input Grid */}
            <div className="grid grid-cols-2 gap-4">
                {/* Capital */}
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Trading Capital
                    </label>
                    <input
                        type="number"
                        value={capital}
                        onChange={(e) => setCapital(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                </div>

                {/* Risk % */}
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 flex items-center gap-1">
                        <Percent className="w-3 h-3" /> Risk per Trade %
                    </label>
                    <input
                        type="number"
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(Number(e.target.value))}
                        step="0.5"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                </div>

                {/* Entry Price */}
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 flex items-center gap-1">
                        <Target className="w-3 h-3" /> Entry Price
                    </label>
                    <input
                        type="number"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(Number(e.target.value))}
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                </div>

                {/* Stop Loss */}
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" /> Stop Loss
                    </label>
                    <input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(Number(e.target.value))}
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                </div>

                {/* Target Price */}
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 col-span-2">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-green-400" /> Target Price (Optional)
                    </label>
                    <input
                        type="number"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(Number(e.target.value))}
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                </div>
            </div>

            {/* Results */}
            {calculations && (
                <div className="space-y-4">
                    {/* Warning if position exceeds capital */}
                    {calculations.requiredCapital > capital && (
                        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-red-400">
                                Position requires {calculations.requiredCapital > capital ? 'margin/leverage' : 'more capital'}. 
                                Required: ¥{calculations.requiredCapital.toLocaleString()}, Available: ¥{capital.toLocaleString()}
                            </div>
                        </div>
                    )}

                    {/* Main KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-slate-500 mb-1">Position Size</div>
                            <div className="text-xl font-bold text-white">{calculations.positionSize}</div>
                            <div className="text-[10px] text-slate-500">shares</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-slate-500 mb-1">Position Value</div>
                            <div className="text-xl font-bold text-amber-400">¥{calculations.positionValue.toLocaleString()}</div>
                            <div className="text-[10px] text-slate-500">{calculations.leverage} leverage</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-slate-500 mb-1">Risk Amount</div>
                            <div className="text-xl font-bold text-red-400">¥{calculations.riskAmount.toFixed(0)}</div>
                            <div className="text-[10px] text-slate-500">{riskPercent}% of capital</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-slate-500 mb-1">Risk/Reward</div>
                            <div className={`text-xl font-bold ${calculations.rewardRiskRatio >= 2 ? 'text-green-400' : calculations.rewardRiskRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                                1:{calculations.rewardRiskRatio.toFixed(1)}
                            </div>
                            <div className="text-[10px] text-slate-500">{calculations.rewardRiskRatio >= 2 ? 'Good' : calculations.rewardRiskRatio >= 1 ? 'Acceptable' : 'Poor'}</div>
                        </div>
                    </div>

                    {/* P&L Scenarios */}
                    <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">P&L Scenarios</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                                <span className="text-sm text-slate-400">If Stop Loss Hit:</span>
                                <span className="font-bold text-red-400">-{calculations.stopPnl.toFixed(0)} (-{riskPercent}%)</span>
                            </div>
                            {targetPrice > 0 && (
                                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                                    <span className="text-sm text-slate-400">If Target Hit:</span>
                                    <span className="font-bold text-green-400">+{calculations.targetPnl.toFixed(0)} (+{((calculations.targetPnl / capital) * 100).toFixed(1)}%)</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-slate-400">Break-even Price:</span>
                                <span className="font-bold text-white">
                                    {calculations.isLong 
                                        ? `¥${(entryPrice + (entryPrice - stopLoss)).toFixed(2)}`
                                        : `¥${(entryPrice - (entryPrice - stopLoss)).toFixed(2)}`
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!calculations && (
                <div className="text-center py-12 text-slate-500">
                    Enter entry price and stop loss to see calculations
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { X, Plus, Target, ArrowDownRight, DollarSign } from 'lucide-react';

interface AddPositionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (position: {
        ticker: string;
        entry_price: number;
        stop_loss: number;
        target: number;
        quantity: number;
        notes: string;
    }) => void;
    ticker: string;
    currentPrice: number;
}

export default function AddPositionDialog({ isOpen, onClose, onAdd, ticker, currentPrice }: AddPositionDialogProps) {
    const [entryPrice, setEntryPrice] = useState(currentPrice.toFixed(2));
    const [quantity, setQuantity] = useState('10');
    const [stopLoss, setStopLoss] = useState((currentPrice * 0.95).toFixed(2));
    const [target, setTarget] = useState((currentPrice * 1.15).toFixed(2));
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset values when dialog opens
    useEffect(() => {
        if (isOpen) {
            setEntryPrice(currentPrice.toFixed(2));
            setQuantity('10');
            setStopLoss((currentPrice * 0.95).toFixed(2));
            setTarget((currentPrice * 1.15).toFixed(2));
            setNotes('');
        }
    }, [isOpen, currentPrice]);

    // Auto-calculate SL and Target when entry changes
    const handleEntryChange = (value: string) => {
        setEntryPrice(value);
        const entry = parseFloat(value);
        if (!isNaN(entry) && entry > 0) {
            setStopLoss((entry * 0.95).toFixed(2));
            setTarget((entry * 1.15).toFixed(2));
        }
    };

    const handleSubmit = async () => {
        const entry = parseFloat(entryPrice);
        const qty = parseInt(quantity);
        const sl = parseFloat(stopLoss);
        const tgt = parseFloat(target);

        if (isNaN(entry) || entry <= 0) {
            alert('Please enter a valid entry price');
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            alert('Please enter a valid quantity');
            return;
        }
        if (isNaN(sl) || sl <= 0) {
            alert('Please enter a valid stop loss');
            return;
        }
        if (isNaN(tgt) || tgt <= 0) {
            alert('Please enter a valid target');
            return;
        }

        setIsSubmitting(true);
        try {
            await onAdd({
                ticker,
                entry_price: entry,
                stop_loss: sl,
                target: tgt,
                quantity: qty,
                notes
            });
            onClose();
        } catch (error) {
            console.error('Error adding position:', error);
            alert('Failed to add position');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate risk/reward
    const entry = parseFloat(entryPrice) || 0;
    const sl = parseFloat(stopLoss) || 0;
    const tgt = parseFloat(target) || 0;
    const qty = parseInt(quantity) || 0;
    
    const risk = entry - sl;
    const reward = tgt - entry;
    const riskReward = risk > 0 ? (reward / risk).toFixed(2) : '0';
    const totalInvestment = (entry * qty).toFixed(0);
    const maxLoss = (risk * qty).toFixed(0);
    const maxProfit = (reward * qty).toFixed(0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#12121c] border border-border/50 rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-slide-down">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
                    <div>
                        <h3 className="text-lg font-bold text-white">Add Position</h3>
                        <p className="text-xs text-slate-500">{ticker.replace('-EQ', '')} @ ₹{currentPrice.toFixed(2)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                    {/* Entry Price */}
                    <div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            <DollarSign size={12} /> Entry Price
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={entryPrice}
                            onChange={(e) => handleEntryChange(e.target.value)}
                            className="w-full px-4 py-3 bg-[#0d0d14] border border-border/40 rounded-xl text-white font-mono text-lg focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="Enter price..."
                        />
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            <Plus size={12} /> Quantity
                        </label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full px-4 py-3 bg-[#0d0d14] border border-border/40 rounded-xl text-white font-mono text-lg focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="Enter quantity..."
                        />
                    </div>

                    {/* SL and Target in grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
                                <ArrowDownRight size={12} /> Stop Loss
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={stopLoss}
                                onChange={(e) => setStopLoss(e.target.value)}
                                className="w-full px-4 py-3 bg-[#0d0d14] border border-red-500/30 rounded-xl text-white font-mono text-lg focus:outline-none focus:border-red-500 transition-colors"
                                placeholder="SL price..."
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                                <Target size={12} /> Target
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full px-4 py-3 bg-[#0d0d14] border border-emerald-500/30 rounded-xl text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                                placeholder="Target price..."
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-2 bg-[#0d0d14] border border-border/40 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                            rows={2}
                            placeholder="Add any notes about this position..."
                        />
                    </div>

                    {/* Stats */}
                    <div className="bg-[#0d0d14] rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Investment</span>
                            <span className="font-mono text-white">₹{Number(totalInvestment).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Risk/Reward</span>
                            <span className="font-mono text-indigo-400">1:{riskReward}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Max Loss</span>
                            <span className="font-mono text-red-400">-₹{Number(maxLoss).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Max Profit</span>
                            <span className="font-mono text-emerald-400">+₹{Number(maxProfit).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-6 py-4 border-t border-border/20">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-border/40 hover:border-slate-600 text-slate-400 rounded-xl font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <><Plus size={16} /> Add Position</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

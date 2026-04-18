import { useState, useMemo, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, Edit2, X, Save, RefreshCw, Brain, Loader2 } from 'lucide-react';

interface Trade {
    id?: number;
    ticker: string;
    entry_date: string;
    entry_price: number;
    quantity: number;
    stop_loss?: number;
    target?: number;
    trade_type: string;
    status: string;
    exited_date?: string;
    exit_price?: number;
    pnl_realized?: number;
    pnl_pct?: number;
    signal_type?: string;
    score_at_entry?: number;
    ml_prob_at_entry?: number;
    rs_rank_at_entry?: number;
    notes?: string;
}

interface Stats {
    total_trades: number;
    winners: number;
    losers: number;
    win_rate: number;
    avg_pnl_pct: number;
    avg_pnl_abs: number;
    best_pct: number;
    worst_pct: number;
}

export default function TradeJournalTab() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
    const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
    const [learning, setLearning] = useState(false);
    const [learnResult, setLearnResult] = useState<string>('');
    const [formError, setFormError] = useState('');

    const [form, setForm] = useState({
        ticker: '',
        entry_date: '',
        entry_price: 0,
        quantity: 0,
        stop_loss: 0,
        target: 0,
        trade_type: 'long',
        status: 'open',
        exit_date: '',
        exit_price: 0,
        signal_type: 'VCP Breakout',
        score_at_entry: 0,
        ml_prob_at_entry: 0,
        rs_rank_at_entry: 0,
        notes: '',
    });

    const loadTrades = useCallback(async () => {
        try {
            setLoading(true);
            const [tradesRes, statsRes] = await Promise.all([
                fetch('/api/journal/trades?limit=200'),
                fetch('/api/journal/stats'),
            ]);
            if (tradesRes.ok) {
                const data = await tradesRes.json();
                setTrades(data.trades || []);
            }
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data.stats || null);
            }
        } catch (e) {
            console.error('Failed to load trades:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTrades();
    }, [loadTrades]);

    const handleSave = async () => {
        if (!form.ticker || !form.entry_date || form.entry_price <= 0) {
            setFormError('Ticker, entry date, and entry price are required');
            return;
        }
        setFormError('');
        try {
            if (editingTrade?.id) {
                if (form.status === 'closed') {
                    const closeRes = await fetch('/api/journal/close', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ticker: form.ticker,
                            entry_price: form.entry_price,
                            quantity: form.quantity,
                            exit_price: form.exit_price,
                            exit_date: form.exit_date,
                            notes: form.notes,
                        }),
                    });
                    if (!closeRes.ok) throw new Error('Failed to close trade');
                }
            } else {
                const res = await fetch('/api/journal/trade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ticker: form.ticker,
                        entry_date: form.entry_date,
                        entry_price: form.entry_price,
                        quantity: form.quantity || 0,
                        stop_loss: form.stop_loss || null,
                        target: form.target || null,
                        trade_type: form.trade_type,
                        signal_type: form.signal_type,
                        score_at_entry: form.score_at_entry || null,
                        ml_prob_at_entry: form.ml_prob_at_entry || null,
                        rs_rank_at_entry: form.rs_rank_at_entry || null,
                        notes: form.notes,
                    }),
                });
                if (!res.ok) throw new Error('Failed to add trade');
            }
            resetForm();
            await loadTrades();
        } catch (e: any) {
            setFormError(e.message);
        }
    };

    const handleEdit = (trade: Trade) => {
        setEditingTrade(trade);
        setForm({
            ticker: trade.ticker,
            entry_date: trade.entry_date,
            entry_price: trade.entry_price,
            quantity: trade.quantity || 0,
            stop_loss: trade.stop_loss || 0,
            target: trade.target || 0,
            trade_type: trade.trade_type || 'long',
            status: trade.status || 'open',
            exit_date: trade.exited_date || '',
            exit_price: trade.exit_price || 0,
            signal_type: trade.signal_type || 'VCP Breakout',
            score_at_entry: trade.score_at_entry || 0,
            ml_prob_at_entry: trade.ml_prob_at_entry || 0,
            rs_rank_at_entry: trade.rs_rank_at_entry || 0,
            notes: trade.notes || '',
        });
        setShowForm(true);
    };

    const handleDelete = async (ticker: string) => {
        if (!confirm(`Close trade for ${ticker}?`)) return;
        try {
            await fetch('/api/journal/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker }),
            });
            await loadTrades();
        } catch (e) {
            console.error('Failed to stop trade:', e);
        }
    };

    const resetForm = () => {
        setForm({
            ticker: '', entry_date: '', entry_price: 0, quantity: 0,
            stop_loss: 0, target: 0, trade_type: 'long', status: 'open',
            exit_date: '', exit_price: 0, signal_type: 'VCP Breakout',
            score_at_entry: 0, ml_prob_at_entry: 0, rs_rank_at_entry: 0, notes: '',
        });
        setEditingTrade(null);
        setShowForm(false);
        setFormError('');
    };

    const runLearnLoop = async () => {
        setLearning(true);
        setLearnResult('');
        try {
            const res = await fetch('/api/ml/learn', {
                method: 'POST',
            });
            const data = await res.json();
            if (data.success) {
                const insights = data.details?.insights || [];
                setLearnResult(insights.slice(0, 5).join('\n') || 'Learn loop complete!');
            } else {
                setLearnResult(data.message || 'Learn failed');
            }
        } catch (e: any) {
            setLearnResult('Learn loop error: ' + e.message);
        } finally {
            setLearning(false);
        }
    };

    const filteredTrades = useMemo(() => {
        let list = trades;
        if (filter === 'open') list = list.filter((t: Trade) => t.status === 'open');
        else if (filter === 'closed') list = list.filter((t: Trade) => t.status === 'closed');
        return list;
    }, [trades, filter]);

    const getPnl = (t: Trade) => {
        if (t.status !== 'closed' || t.exit_price == null) return null;
        const mult = t.trade_type === 'long' ? 1 : -1;
        return ((t.exit_price - t.entry_price) * mult) * (t.quantity || 0);
    };

    return (
        <div className="p-4 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-bold text-white">Trade Journal</h2>
                    <span className="text-[11px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full">
                        {trades.length} trades
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runLearnLoop}
                        disabled={learning}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg text-xs font-medium"
                        title="Run Learn Loop — retrain ML models with journal outcomes"
                    >
                        {learning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                        {learning ? 'Learning...' : 'Learn Loop'}
                    </button>
                    <button
                        onClick={() => loadTrades()}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> Add Trade
                    </button>
                </div>
            </div>

            {learnResult && (
                <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Brain className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-400">Learn Insights</span>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{learnResult}</pre>
                    <button onClick={() => setLearnResult('')} className="mt-1 text-[10px] text-slate-500 hover:text-slate-300">dismiss</button>
                </div>
            )}

            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                        <div className="text-[10px] uppercase text-slate-500 mb-1">Win Rate</div>
                        <div className={`text-xl font-bold ${(stats.win_rate || 0) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {(stats.win_rate || 0).toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                        <div className="text-[10px] uppercase text-slate-500 mb-1">W / L</div>
                        <div className="text-xl font-bold text-white">{stats.winners || 0}<span className="text-slate-500">/</span>{stats.losers || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                        <div className="text-[10px] uppercase text-slate-500 mb-1">Avg %</div>
                        <div className={`text-xl font-bold ${(stats.avg_pnl_pct || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(stats.avg_pnl_pct || 0) >= 0 ? '+' : ''}{(stats.avg_pnl_pct || 0).toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                        <div className="text-[10px] uppercase text-slate-500 mb-1">Best / Worst</div>
                        <div className="text-xs font-bold">
                            <span className="text-green-400">+{stats.best_pct?.toFixed(1) || 0}%</span>
                            <span className="text-slate-500"> / </span>
                            <span className="text-red-400">{stats.worst_pct?.toFixed(1) || 0}%</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                {(['all', 'open', 'closed'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            filter === f ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">{editingTrade ? 'Close Trade' : 'New Trade'}</h3>
                            <button onClick={resetForm} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        {formError && (
                            <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Ticker *</label>
                                <input type="text" value={form.ticker}
                                    onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                    placeholder="RELIANCE" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Type</label>
                                <select value={form.trade_type}
                                    onChange={e => setForm({...form, trade_type: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                                    <option value="long">Long</option>
                                    <option value="short">Short</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Entry Date *</label>
                                <input type="date" value={form.entry_date}
                                    onChange={e => setForm({...form, entry_date: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Entry Price *</label>
                                <input type="number" value={form.entry_price || ''}
                                    onChange={e => setForm({...form, entry_price: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Quantity</label>
                                <input type="number" value={form.quantity || ''}
                                    onChange={e => setForm({...form, quantity: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Stop Loss</label>
                                <input type="number" value={form.stop_loss || ''}
                                    onChange={e => setForm({...form, stop_loss: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Target</label>
                                <input type="number" value={form.target || ''}
                                    onChange={e => setForm({...form, target: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Signal Type</label>
                                <select value={form.signal_type}
                                    onChange={e => setForm({...form, signal_type: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                                    <option value="VCP Breakout">VCP Breakout</option>
                                    <option value="Pivot Breakout">Pivot Breakout</option>
                                    <option value="TL Breakout">TL Breakout</option>
                                    <option value="DMA Break">DMA Break</option>
                                    <option value="MSB">MSB</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Score at Entry</label>
                                <input type="number" value={form.score_at_entry || ''}
                                    onChange={e => setForm({...form, score_at_entry: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">ML Prob at Entry</label>
                                <input type="number" value={form.ml_prob_at_entry || ''}
                                    onChange={e => setForm({...form, ml_prob_at_entry: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            {!editingTrade && (
                                <>
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 block mb-1">RS Rank 6M</label>
                                        <input type="number" value={form.rs_rank_at_entry || ''}
                                            onChange={e => setForm({...form, rs_rank_at_entry: Number(e.target.value)})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                                    </div>
                                </>
                            )}
                            {editingTrade && form.status === 'closed' && (
                                <>
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 block mb-1">Exit Date</label>
                                        <input type="date" value={form.exit_date}
                                            onChange={e => setForm({...form, exit_date: e.target.value})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 block mb-1">Exit Price</label>
                                        <input type="number" value={form.exit_price || ''}
                                            onChange={e => setForm({...form, exit_price: Number(e.target.value)})}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                                    </div>
                                </>
                            )}
                            {editingTrade && (
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase text-slate-500 block mb-1">Status</label>
                                    <select value={form.status}
                                        onChange={e => setForm({...form, status: e.target.value})}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                                        <option value="open">Open</option>
                                        <option value="closed">Closed</option>
                                        <option value="stopped">Stopped (SL hit)</option>
                                    </select>
                                </div>
                            )}
                            <div className="col-span-2">
                                <label className="text-[10px] uppercase text-slate-500 block mb-1">Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm({...form, notes: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white h-16"
                                    placeholder="Trade notes..." />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={handleSave}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">
                                <Save className="w-4 h-4" /> {editingTrade ? 'Close Trade' : 'Add Trade'}
                            </button>
                            <button onClick={resetForm}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {loading ? (
                    <div className="text-center py-12 text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading trades...
                    </div>
                ) : filteredTrades.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        No trades yet. Add your first trade or run the Learn Loop after logging outcomes!
                    </div>
                ) : (
                    filteredTrades.map((trade: Trade) => {
                        const pnl = getPnl(trade);
                        return (
                            <div key={trade.id} className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-8 rounded-full ${trade.trade_type === 'long' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-white">{trade.ticker}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${trade.trade_type === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                    {trade.trade_type?.toUpperCase()}
                                                </span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${trade.status === 'open' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-600/20 text-slate-400'}`}>
                                                    {trade.status?.toUpperCase()}
                                                </span>
                                                {trade.signal_type && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">
                                                        {trade.signal_type}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {trade.entry_date} @ ₹{trade.entry_price?.toFixed(2)} × {trade.quantity || 0}
                                                {trade.stop_loss ? ` | SL: ₹${trade.stop_loss}` : ''}
                                                {trade.target ? ` | Tgt: ₹${trade.target}` : ''}
                                            </div>
                                            {trade.score_at_entry ? (
                                                <div className="text-[10px] text-slate-600 mt-0.5">
                                                    Score: {trade.score_at_entry} | ML: {(trade.ml_prob_at_entry || 0).toFixed(2)} | RS Rank: {(trade.rs_rank_at_entry || 0).toFixed(0)}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {pnl !== null && (
                                            <div className={`text-right ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                <div className="font-bold">₹{pnl.toFixed(0)}</div>
                                                <div className="text-[10px] text-slate-500">{trade.exited_date}</div>
                                            </div>
                                        )}
                                        <div className="flex gap-1">
                                            <button onClick={() => handleEdit(trade)} className="p-2 text-slate-400 hover:text-white">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            {trade.status === 'open' && (
                                                <button onClick={() => handleDelete(trade.ticker)} className="p-2 text-slate-400 hover:text-red-400">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {trade.notes && (
                                    <div className="mt-2 text-xs text-slate-500 pl-5">{trade.notes}</div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Trash2, AlertCircle, Clock, CheckCircle2, Ban } from 'lucide-react';

interface WatchlistEntry {
    ticker: string;
    pivot_price: number;
    last_price?: number;
    stop_price: number;
    target_price: number;
    score: number;
    ml_prob: number | null;
    rs_rank: number | null;
    signals_fired: Record<string, boolean>;
    added_date: string;
    expire_date: string;
    status: 'active' | 'triggered' | 'expired' | 'stopped';
}

interface AlertEntry {
    ticker: string;
    alert_type: string;
    message: string;
    fired_at: string;
}

const SIGNAL_EMOJI: Record<string, string> = {
    volume_surge: '🔥VOL',
    msb: '📈MSB',
    pivot_breakout: '💥PVT',
    tl_breakout: '📉TL',
    dma20_break: '〽️20MA',
    price_surge: '🚀PRC',
};

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    triggered: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    expired: 'bg-red-500/20 text-red-400 border-red-500/30',
    stopped: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const STATUS_LABEL: Record<string, string> = {
    active: 'WATCHING',
    triggered: 'TRIGGERED',
    expired: 'EXPIRED',
    stopped: 'STOPPED',
};

function warningColor(days: number): string {
    if (days <= 0) return 'text-emerald-400';
    if (days <= 3) return 'text-yellow-400';
    if (days <= 10) return 'text-orange-400';
    return 'text-red-400';
}

export default function WatchlistTab() {
    const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
    const [alerts, setAlerts] = useState<AlertEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasRecentTrigger, setHasRecentTrigger] = useState(false);

    const fetchWatchlist = useCallback(async () => {
        try {
            const r = await fetch('/api/watchlist');
            if (!r.ok) throw new Error('Failed to fetch watchlist');
            const data = await r.json();
            setWatchlist(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    const fetchAlerts = useCallback(async () => {
        try {
            const r = await fetch('/api/alerts/history?limit=10');
            if (!r.ok) throw new Error('Failed to fetch alerts');
            const data = await r.json();
            setAlerts(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        await Promise.all([fetchWatchlist(), fetchAlerts()]);
        setLoading(false);
    }, [fetchWatchlist, fetchAlerts]);

    useEffect(() => {
        loadAll();
        const interval = setInterval(loadAll, 60000);
        return () => clearInterval(interval);
    }, [loadAll]);

    useEffect(() => {
        const triggered = alerts.filter((a) => {
            if (a.alert_type !== 'breakout') return false;
            const fired = new Date(a.fired_at).getTime();
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            return fired > oneHourAgo;
        });
        setHasRecentTrigger(triggered.length > 0);
    }, [alerts]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    };

    const handleDelete = async (ticker: string) => {
        try {
            const r = await fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Failed to delete');
            setWatchlist((prev) => prev.filter((w) => w.ticker !== ticker));
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleExpire = async () => {
        try {
            const r = await fetch('/api/watchlist/expire', { method: 'POST' });
            if (!r.ok) throw new Error('Failed to expire');
            await fetchWatchlist();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const daysOnList = (addedDate: string) => {
        const added = new Date(addedDate);
        const now = new Date();
        return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-4 p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold text-white">Watchlist</h2>
                    <span className="text-xs font-mono bg-[#1a1a28] text-slate-400 px-2 py-0.5 rounded">
                        {watchlist.length} entries
                    </span>
                    {hasRecentTrigger && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExpire}
                        className="px-3 py-1.5 text-xs bg-[#1a1a28] text-slate-400 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                        <Ban size={12} /> Expire Old
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-xs text-red-400">{error}</span>
                </div>
            )}

            {/* Main content: table + alerts panel */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
                {/* Watchlist Table */}
                <div className="flex-1 overflow-auto rounded-xl border border-[#1e1e32] bg-[#0a0e1a]">
                    {watchlist.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <Clock size={32} className="mb-2 opacity-30" />
                            <p className="text-sm">No active watchlist entries</p>
                            <p className="text-xs mt-1">Entries auto-added from VCP scan (score ≥ 70)</p>
                        </div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead className="sticky top-0 z-10 bg-[#12121c]">
                                <tr className="border-b border-[#1e1e32]">
                                    {['TICKER', 'PRICE', 'PIVOT', '%PIV', 'STOP', 'TARGET', 'SCORE', 'ML%', 'SIGNALS', 'DAYS', 'STATUS', ''].map((h) => (
                                        <th key={h} className="px-2 py-2 text-[9px] uppercase tracking-wider text-slate-500 font-semibold text-left">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {watchlist.map((w) => {
                                    const pctFromPivot = w.pivot_price > 0
                                        ? (((w.last_price || w.pivot_price) - w.pivot_price) / w.pivot_price * 100)
                                        : 0;
                                    const days = daysOnList(w.added_date);
                                    const activeSigs = Object.entries(w.signals_fired || {}).filter(([, v]) => v).map(([k]) => SIGNAL_EMOJI[k] || k);

                                    return (
                                        <tr
                                            key={w.ticker}
                                            className="border-b border-[#1a1a28] hover:bg-[#1a1a28]/50 transition-colors"
                                        >
                                            <td className="px-2 py-2 font-bold text-blue-400">{w.ticker.replace('-EQ', '')}</td>
                                            <td className="px-2 py-2 font-mono text-slate-200">₹{(w.last_price || w.pivot_price)?.toFixed(2)}</td>
                                            <td className="px-2 py-2 font-mono text-slate-300">₹{w.pivot_price?.toFixed(2)}</td>
                                            <td className={`px-2 py-2 font-mono ${pctFromPivot >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pctFromPivot >= 0 ? '+' : ''}{pctFromPivot.toFixed(1)}%
                                            </td>
                                            <td className="px-2 py-2 font-mono text-red-400/70">₹{w.stop_price?.toFixed(2)}</td>
                                            <td className="px-2 py-2 font-mono text-emerald-400/70">₹{w.target_price?.toFixed(2)}</td>
                                            <td className="px-2 py-2 font-mono">
                                                <span className={`font-bold ${(w.score || 0) >= 70 ? 'text-emerald-400' : (w.score || 0) >= 50 ? 'text-yellow-400' : 'text-slate-400'}`}>
                                                    {(w.score || 0).toFixed(1)}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 font-mono text-slate-300">
                                                {w.ml_prob != null ? `${(w.ml_prob * 100).toFixed(0)}%` : '—'}
                                            </td>
                                            <td className="px-2 py-2">
                                                <div className="flex flex-wrap gap-1">
                                                    {activeSigs.length > 0 ? activeSigs.map((sig) => (
                                                        <span key={sig} className={`text-[9px] px-1 py-0.5 rounded font-bold ${warningColor(days)} bg-[#1a1a28]`}>
                                                            {sig}
                                                        </span>
                                                    )) : <span className="text-slate-600">—</span>}
                                                </div>
                                            </td>
                                            <td className={`px-2 py-2 font-mono ${warningColor(days)}`}>{days}d</td>
                                            <td className="px-2 py-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${STATUS_COLORS[w.status]}`}>
                                                    {STATUS_LABEL[w.status]}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2">
                                                <button
                                                    onClick={() => handleDelete(w.ticker)}
                                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Alert History Panel */}
                <div className="w-full lg:w-72 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alert History</h3>
                    </div>
                    <div className="flex-1 overflow-auto rounded-xl border border-[#1e1e32] bg-[#0a0e1a]">
                        {alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                                <CheckCircle2 size={20} className="mb-1 opacity-30" />
                                <p className="text-xs">No alerts fired yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[#1a1a28]">
                                {alerts.map((a, i) => (
                                    <div key={i} className="px-3 py-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-blue-400">{a.ticker.replace('-EQ', '')}</span>
                                            <span className="text-[9px] text-slate-500">{formatTime(a.fired_at)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <span className={`text-[9px] px-1 py-0.5 rounded ${
                                                a.alert_type === 'breakout' ? 'bg-orange-500/20 text-orange-400' :
                                                a.alert_type === 'daily' ? 'bg-blue-500/20 text-blue-400' :
                                                'bg-slate-500/20 text-slate-400'
                                            }`}>
                                                {a.alert_type.toUpperCase()}
                                            </span>
                                            <span className="text-[9px] text-slate-500 truncate">{a.message?.slice(0, 50) || ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
import { useState, useRef, useMemo, useEffect } from 'react';
import { Loader2, Briefcase, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import type { PortfolioPosition, PortfolioSummary } from '../types';
import PositionCard from './PositionCard';
import PositionCardMini from './PositionCardMini';

const api = axios.create({ baseURL: '/api' });

interface PortfolioTabProps {
    onScanHoldings: (holdings: any[]) => Promise<void>;
    onSyncLocal?: () => Promise<void>;
    portfolioResult: any;
    loading: boolean;
}

export default function PortfolioTab({ onScanHoldings, onSyncLocal, portfolioResult, loading }: PortfolioTabProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState<'active' | 'closed' | 'all'>('active');
    const [isScanning, setIsScanning] = useState(false);
    const lastHoldingsRef = useRef<any[]>([]);
    const [activeTab, setActiveTab] = useState<'holdings' | 'manual'>('holdings');
    const [manualPositions, setManualPositions] = useState<any[]>([]);
    const [loadingPositions, setLoadingPositions] = useState(false);

    // Fetch manual positions
    useEffect(() => {
        const fetchManualPositions = async () => {
            if (activeTab === 'manual') {
                setLoadingPositions(true);
                try {
                    const response = await api.get('/positions');
                    setManualPositions(response.data.positions || []);
                } catch (error) {
                    console.error('Error fetching positions:', error);
                } finally {
                    setLoadingPositions(false);
                }
            }
        };
        fetchManualPositions();
    }, [activeTab]);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.trim().split('\n');
            if (lines.length < 2) return;
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const rows = lines.slice(1).map(line => {
                const vals = line.split(',');
                const row: any = {};
                headers.forEach((h, i) => { row[h] = vals[i]?.trim() ?? ''; });
                return row;
            });
            lastHoldingsRef.current = rows;
            onScanHoldings(rows).finally(() => setIsScanning(false));
        };
        reader.readAsText(file);
    };

    const handleRefreshAll = () => {
        if (lastHoldingsRef.current.length === 0 && onSyncLocal) {
            handleSyncLocal();
            return;
        }
        if (lastHoldingsRef.current.length === 0) {
            fileRef.current?.click();
            return;
        }
        setIsScanning(true);
        onScanHoldings(lastHoldingsRef.current).finally(() => setIsScanning(false));
    };

    const handleSyncLocal = async () => {
        if (!onSyncLocal) return;
        setIsScanning(true);
        try {
            await onSyncLocal();
        } catch (err) {
            console.error(err);
        } finally {
            setIsScanning(false);
        }
    };

    const handleUpdatePosition = async (updatedPosition: any) => {
        try {
            const response = await api.put(`/positions/${updatedPosition.id}`, updatedPosition);
            setManualPositions(prev => prev.map(p => p.id === updatedPosition.id ? response.data.position : p));
        } catch (error) {
            console.error('Error updating position:', error);
        }
    };

    const handleDeletePosition = async (id: string) => {
        try {
            await api.delete(`/positions/${id}`);
            setManualPositions(prev => prev.filter(p => p.id !== id));
        } catch (error) {
            console.error('Error deleting position:', error);
        }
    };

    const positions: PortfolioPosition[] = useMemo(() => {
        const holdingsArray = Array.isArray(portfolioResult) ? portfolioResult :
            Array.isArray(portfolioResult?.holdings) ? portfolioResult.holdings :
                portfolioResult?.data ? portfolioResult.data : [];
        if (!holdingsArray || holdingsArray.length === 0) return [];
        return holdingsArray.map((h: any) => ({
            ticker: h.ticker || 'UNK',
            company_name: h.name || h.ticker?.replace('-EQ', '').replace('&', '_') || 'Unknown',
            status: h.status || (h.vcp_score >= 60 ? '5MA Safe' : 'Monitoring'),
            holding_days: h.holding_days || Math.floor(Math.random() * 10) + 1,
            pnl_pct: h.avg_cost ? ((h.ltp - h.avg_cost) / h.avg_cost) * 100 : 0,
            pnl_value: h.open_pnl || (h.ltp - (h.avg_cost || h.ltp)) * h.quantity,
            pnl_absolute_label: (h.open_pnl || 0) >= 1000 ? `+${((h.open_pnl || 0) / 1000).toFixed(1)}k` : `${(h.open_pnl || 0) >= 0 ? '+' : ''}${(h.open_pnl || 0).toFixed(0)}`,
            entry_price: h.avg_cost || 0,
            current_price: h.ltp || 0,
            is_active: true,
            stage: h.stage || 1,
            vcp_score: h.vcp_score || 0,
            quantity: h.quantity || 0,
            avg_cost: h.avg_cost || 0
        }));
    }, [portfolioResult]);

    const summary: PortfolioSummary = useMemo(() => {
        const count = positions.length;
        const invested = positions.reduce((acc, p) => acc + (p.avg_cost * p.quantity), 0);
        const currentVal = positions.reduce((acc, p) => acc + (p.current_price * p.quantity), 0);
        const totalPnl = currentVal - invested;
        const totalPnlPct = invested > 0 ? (totalPnl / invested) * 100 : 0;
        return {
            position_count: count,
            invested_amount: invested,
            invested_label: invested >= 100000 ? `${(invested / 100000).toFixed(1)}L` : `${(invested / 1000).toFixed(0)}k`,
            days_pnl_value: totalPnl * 0.15,
            days_pnl_pct: 1.5,
            total_pnl_value: totalPnl,
            total_pnl_pct: totalPnlPct,
            open_risk_pct: 0.8,
            open_risk_value: invested * 0.008,
            locked_profit_value: totalPnl * 0.4
        };
    }, [positions]);

    const filteredPositions = positions.filter(p => {
        if (filter === 'active') return p.is_active;
        if (filter === 'closed') return !p.is_active;
        return true;
    });

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden animate-slide-down">
            {/* Tab Switcher */}
            <div className="flex items-center justify-between bg-panel/30 border border-border/40 rounded-xl p-1">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('holdings')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'holdings' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Portfolio Holdings
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'manual' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Manual Positions ({manualPositions.length})
                    </button>
                </div>

                {activeTab === 'holdings' ? (
                    <div className="flex items-center gap-2">
                        <button onClick={handleRefreshAll} disabled={isScanning} className="p-2 bg-panel/40 border border-border/40 text-slate-300 rounded-xl hover:border-indigo-500/50 transition-all flex items-center gap-2 text-xs font-bold disabled:opacity-50">
                            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} /> Refresh All
                        </button>
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setLoadingPositions(true);
                                api.get('/positions')
                                    .then(res => { setManualPositions(res.data.positions || []); setLoadingPositions(false); })
                                    .catch(err => { console.error(err); setLoadingPositions(false); });
                            }}
                            disabled={loadingPositions}
                            className="p-2 bg-panel/40 border border-border/40 text-slate-300 rounded-xl hover:border-indigo-500/50 transition-all flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={loadingPositions ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {activeTab === 'holdings' ? (
                    <HoldingsContent
                        portfolioResult={portfolioResult}
                        loading={loading}
                        isScanning={isScanning}
                        fileRef={fileRef}
                        handleUpload={handleUpload}
                        handleSyncLocal={handleSyncLocal}
                        onSyncLocal={onSyncLocal}
                        summary={summary}
                        filteredPositions={filteredPositions}
                        filter={filter}
                        setFilter={setFilter}
                    />
                ) : (
                    <ManualPositionsContent
                        loadingPositions={loadingPositions}
                        manualPositions={manualPositions}
                        handleUpdatePosition={handleUpdatePosition}
                        handleDeletePosition={handleDeletePosition}
                    />
                )}
            </div>
        </div>
    );
}

// Holdings Tab Content
function HoldingsContent({ portfolioResult, loading, isScanning, fileRef, handleUpload, handleSyncLocal, onSyncLocal, summary, filteredPositions, filter, setFilter }: any) {
    if (!portfolioResult && !loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="w-20 h-20 bg-panel/40 rounded-full flex items-center justify-center border border-border/20 shadow-2xl">
                    <Briefcase className="w-10 h-10 text-indigo-500/50" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-2">Portfolio Management</h2>
                    <p className="text-slate-400 max-w-sm mb-6">Upload your Zerodha holdings CSV or sync from your local path.</p>
                    <div className="flex flex-col gap-3">
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
                        <button onClick={() => fileRef.current?.click()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 mx-auto w-full max-w-xs justify-center">
                            <Upload size={18} /> Import CSV file
                        </button>
                        {onSyncLocal && (
                            <button onClick={handleSyncLocal} className="px-8 py-3 bg-panel/60 border border-border/40 hover:border-indigo-500/50 text-white rounded-xl font-bold transition-all flex items-center gap-2 mx-auto w-full max-w-xs justify-center">
                                <RefreshCw size={18} className={isScanning ? 'animate-spin' : ''} /> Sync from Local Path
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Summary Stats */}
            {portfolioResult && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-panel/40 border border-border/40 p-4 rounded-2xl backdrop-blur-md">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Positions</div>
                        <div className="text-2xl font-black text-indigo-400">{summary.position_count}</div>
                        <div className="text-[11px] font-medium text-slate-500">₹{summary.invested_label} invested</div>
                    </div>
                    <div className="bg-panel/40 border border-border/40 p-4 rounded-2xl backdrop-blur-md bg-gradient-to-br from-emerald-500/5 to-transparent">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Day's P&L</div>
                        <div className="text-2xl font-black text-emerald-400">+{summary.days_pnl_pct}%</div>
                        <div className="text-[11px] font-medium text-emerald-500/70">+₹{(summary.days_pnl_value / 1000).toFixed(1)}k</div>
                    </div>
                    <div className="bg-panel/40 border border-border/40 p-4 rounded-2xl backdrop-blur-md">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total P&L</div>
                        <div className={`text-2xl font-black ${summary.total_pnl_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {summary.total_pnl_value >= 0 ? '+' : ''}₹{(summary.total_pnl_value / 1000).toFixed(1)}k
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">{summary.total_pnl_pct.toFixed(2)}% return</div>
                    </div>
                    <div className="bg-panel/40 border border-border/40 p-4 rounded-2xl backdrop-blur-md">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open Risk</div>
                        <div className="text-2xl font-black text-white">{summary.open_risk_pct}%</div>
                        <div className="text-[11px] font-medium text-slate-500">₹{(summary.open_risk_value / 1000).toFixed(1)}k at risk</div>
                    </div>
                    <div className="bg-panel/40 border border-border/40 p-4 rounded-2xl backdrop-blur-md">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Locked Profit</div>
                        <div className="text-2xl font-black text-indigo-300">₹{(summary.locked_profit_value / 1000).toFixed(1)}k</div>
                        <div className="text-[11px] font-medium text-slate-500">if all SL hit</div>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center bg-panel/30 border border-border/40 rounded-xl p-1 w-fit">
                {(['active', 'closed', 'all'] as const).map(t => (
                    <button key={t} onClick={() => setFilter(t)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {/* Positions Grid */}
            {loading || isScanning ? (
                <div className="h-64 flex items-center justify-center flex-col gap-4">
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                    <span className="text-slate-400 text-sm">{isScanning ? 'Scanning holdings...' : 'Loading portfolio...'}</span>
                </div>
            ) : filteredPositions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-10">
                    {filteredPositions.map((pos: PortfolioPosition, index: number) => (
                        <PositionCard key={`${pos.ticker}-${index}`} position={pos} />
                    ))}
                </div>
            ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <AlertTriangle size={32} />
                    <span>No {filter} positions found.</span>
                </div>
            )}
        </div>
    );
}

// Manual Positions Tab Content
function ManualPositionsContent({ loadingPositions, manualPositions, handleUpdatePosition, handleDeletePosition }: any) {
    if (loadingPositions) {
        return (
            <div className="h-64 flex items-center justify-center flex-col gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <span className="text-slate-400 text-sm">Loading manual positions...</span>
            </div>
        );
    }

    if (manualPositions.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Briefcase size={32} />
                <span>No manual positions found.</span>
                <span className="text-sm">Add positions from the Scanner tab to track them here.</span>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-10">
            {manualPositions.map((pos: any) => (
                <PositionCardMini
                    key={pos.id}
                    position={pos}
                    onUpdate={handleUpdatePosition}
                    onDelete={handleDeletePosition}
                />
            ))}
        </div>
    );
}

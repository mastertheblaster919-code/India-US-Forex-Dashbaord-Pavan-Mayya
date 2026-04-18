import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchBrokerStatus, fetchFyersAuthUrl, loginFyers } from '../api';
import { Shield, Key, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Clock, Trash2, Ban } from 'lucide-react';

interface GTTOrder {
    id: string;
    symbol: string;
    side: number;
    qty: number;
    price: number;
    triggerPrice: number;
    status: number;
    productType: string;
    orderType: string;
}

export default function BrokerTab() {
    const queryClient = useQueryClient();
    const [redirectUrl, setRedirectUrl] = useState('');
    const [gttOrders, setGttOrders] = useState<GTTOrder[]>([]);
    const [loadingGtt, setLoadingGtt] = useState(false);

    const { data: status, isLoading: loadingStatus } = useQuery({
        queryKey: ['broker-status'],
        queryFn: fetchBrokerStatus,
        refetchInterval: 30000,
    });

    const fetchGttOrders = async () => {
        setLoadingGtt(true);
        try {
            const r = await fetch('/api/gtt/orders');
            if (!r.ok) throw new Error('Failed to fetch GTT orders');
            const data = await r.json();
            if (data.success) {
                setGttOrders(data.active_orders || []);
            }
        } catch (e) {
            console.error('Error fetching GTT:', e);
        } finally {
            setLoadingGtt(false);
        }
    };

    const cancelGttOrder = async (orderId: string) => {
        if (!confirm('Are you sure you want to cancel this GTT order?')) return;
        try {
            const r = await fetch(`/api/gtt/cancel/${orderId}`, { method: 'POST' });
            if (!r.ok) throw new Error('Failed to cancel');
            const data = await r.json();
            if (data.success) {
                setGttOrders(prev => prev.filter(o => o.id !== orderId));
            }
        } catch (e) {
            alert('Cancel failed');
        }
    };

    useEffect(() => {
        if (status?.fyers?.linked) {
            fetchGttOrders();
        }
    }, [status?.fyers?.linked]);

    const { data: authUrlData } = useQuery({
        queryKey: ['fyers-auth-url'],
        queryFn: fetchFyersAuthUrl,
        enabled: true,
    });

    const loginMutation = useMutation({
        mutationFn: (url: string) => loginFyers(url),
        onSuccess: () => {
            setRedirectUrl('');
            queryClient.invalidateQueries({ queryKey: ['broker-status'] });
            alert('Fyers Access Token updated successfully!');
        },
        onError: (err: any) => {
            alert(`Login failed: ${err?.response?.data?.detail || err.message}`);
        }
    });

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!redirectUrl.trim()) return;
        loginMutation.mutate(redirectUrl);
    };

    const isFyersActive = status?.fyers?.linked;
    const lastUpdate = status?.fyers?.updated_at;

    return (
        <div className="flex flex-col gap-6 p-1 h-full overflow-y-auto custom-scrollbar pb-10">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-indigo-400" />
                        Broker Configuration
                    </h2>
                    <p className="text-slate-400 text-sm">Manage your trading account connections and API tokens.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Fyers Card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col gap-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />

                    <div className="flex items-start justify-between relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                                <img src="https://fyers.in/assets/images/logo-fyers.svg" alt="Fyers" className="w-8 h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                <span className="text-indigo-400 font-bold text-lg">F</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Fyers API v3</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    {loadingStatus ? (
                                        <div className="h-4 w-20 bg-slate-800 animate-pulse rounded" />
                                    ) : isFyersActive ? (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                                            <CheckCircle2 size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                                            <AlertCircle size={12} /> Unlinked
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['broker-status'] })}
                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                            title="Refresh Status"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 relative z-10">
                        <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50">
                            <div className="flex items-center gap-3 text-slate-300 text-sm mb-1">
                                <Clock size={16} className="text-slate-500" />
                                <span>Last Token Update</span>
                            </div>
                            <div className="text-white font-medium pl-7">
                                {lastUpdate || 'Never'}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 pl-7 uppercase tracking-wider">Tokens expire daily (at midnight or 24h)</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 relative z-10">
                        <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Key size={14} className="text-indigo-400" />
                            Update Access Token
                        </h4>

                        <div className="space-y-4">
                            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-4 text-sm text-indigo-200">
                                <ol className="list-decimal list-inside space-y-2">
                                    <li>
                                        <a
                                            href={authUrlData?.url || "https://api-t1.fyers.in/api/v3/generate-authcode?client_id=KCCN3XOVQU-100&redirect_uri=https://www.google.com&response_type=code&state=None"}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-semibold"
                                        >
                                            Click here to login to Fyers <ExternalLink size={12} />
                                        </a>
                                    </li>
                                    <li>After authentication, you'll be redirected to Google.</li>
                                    <li><strong>Copy the entire URL</strong> from the browser address bar.</li>
                                    <li>Paste it below to generate your token.</li>
                                </ol>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-3">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Paste Redirect URL here..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                        value={redirectUrl}
                                        onChange={(e) => setRedirectUrl(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loginMutation.isPending || !redirectUrl.trim()}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                                >
                                    {loginMutation.isPending ? (
                                        <RefreshCw size={18} className="animate-spin" />
                                    ) : (
                                        <>Update Access Token</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* GTT Orders Card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clock className="text-emerald-400" size={20} />
                            Active GTT Orders
                        </h3>
                        <button
                            onClick={fetchGttOrders}
                            disabled={loadingGtt || !isFyersActive}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors disabled:opacity-30"
                        >
                            <RefreshCw size={16} className={loadingGtt ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {!isFyersActive ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-10 border border-dashed border-slate-800 rounded-lg">
                            <Ban size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">Connect Fyers to see GTT orders</p>
                        </div>
                    ) : loadingGtt ? (
                        <div className="flex-1 flex items-center justify-center py-10">
                            <RefreshCw className="animate-spin text-primary" size={24} />
                        </div>
                    ) : gttOrders.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-10 border border-dashed border-slate-800 rounded-lg">
                            <p className="text-sm italic">No active GTT orders found</p>
                            <p className="text-[10px] mt-1 uppercase tracking-wider">Orders will appear here after breakouts</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto max-h-[400px] custom-scrollbar">
                            <table className="w-full text-left text-xs">
                                <thead className="text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-800">
                                    <tr>
                                        <th className="py-2 px-1">Ticker</th>
                                        <th className="py-2 px-1 text-right">Qty</th>
                                        <th className="py-2 px-1 text-right">Trigger</th>
                                        <th className="py-2 px-1 text-right">Price</th>
                                        <th className="py-2 px-1 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {gttOrders.map(order => (
                                        <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3 px-1 font-bold text-slate-200">{order.symbol.split(':')[1]?.replace('-EQ', '') || order.symbol}</td>
                                            <td className="py-3 px-1 text-right font-mono text-slate-300">{order.qty}</td>
                                            <td className="py-3 px-1 text-right font-mono text-emerald-400">₹{order.triggerPrice?.toFixed(2)}</td>
                                            <td className="py-3 px-1 text-right font-mono text-slate-400">₹{order.price?.toFixed(2)}</td>
                                            <td className="py-3 px-1 text-center">
                                                <button
                                                    onClick={() => cancelGttOrder(order.id)}
                                                    className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                                                    title="Cancel GTT"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

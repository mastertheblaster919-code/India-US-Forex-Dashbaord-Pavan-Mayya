import { useState, useEffect } from 'react';
import { Edit2, Save, X, ArrowDownRight, Trash2, Clock } from 'lucide-react';
import axios from 'axios';
import PositionMiniChart from './PositionMiniChart';

const api = axios.create({ baseURL: '/api' });

interface Position {
    id: string;
    ticker: string;
    entry_price: number;
    stop_loss: number;
    target: number;
    quantity: number;
    entry_date: string;
    status: string;
    notes: string;
}

interface PositionCardMiniProps {
    position: Position;
    onUpdate?: (position: Position) => void;
    onDelete?: (id: string) => void;
}

export default function PositionCardMini({ position, onUpdate, onDelete }: PositionCardMiniProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loadingChart, setLoadingChart] = useState(false);
    const [editedPosition, setEditedPosition] = useState(position);
    const [showChart, setShowChart] = useState(false);
    const [chartInterval, setChartInterval] = useState<'1h' | '1d'>('1h');

    const fetchChartData = async (interval: '1h' | '1d' = chartInterval) => {
        if (showChart) {
            setLoadingChart(true);
            try {
                const response = await api.get(`/positions/${position.id}/chart?interval=${interval}`);
                setChartData(response.data.data || []);
            } catch (error) {
                console.error('Error fetching chart data:', error);
            } finally {
                setLoadingChart(false);
            }
        }
    };

    useEffect(() => {
        fetchChartData(chartInterval);
    }, [showChart, chartInterval]);

    const handleSave = () => {
        onUpdate?.(editedPosition);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this position?')) {
            onDelete?.(position.id);
        }
    };

    return (
        <div className="bg-[#12121c]/80 border border-border/40 rounded-2xl overflow-hidden backdrop-blur-sm hover:border-indigo-500/30 transition-all">
            {/* Header */}
            <div className="p-4 border-b border-border/20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-white">{position.ticker}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                                    position.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                    position.status === 'sl_hit' ? 'bg-red-500/20 text-red-400' :
                                    'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                    {position.status.toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500">{new Date(position.entry_date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing ? (
                            <>
                                {showChart && (
                                    <div className="flex items-center bg-panel/40 rounded-lg p-0.5">
                                        <button
                                            onClick={() => setChartInterval('1h')}
                                            className={`px-2 py-1 text-[10px] font-bold rounded ${chartInterval === '1h' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            1HR
                                        </button>
                                        <button
                                            onClick={() => setChartInterval('1d')}
                                            className={`px-2 py-1 text-[10px] font-bold rounded ${chartInterval === '1d' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            1D
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowChart(!showChart)}
                                    className="p-2 bg-panel/40 hover:bg-indigo-500/20 text-slate-300 hover:text-white rounded-lg transition-all"
                                >
                                    <Clock size={16} />
                                </button>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="p-2 bg-panel/40 hover:bg-indigo-500/20 text-slate-300 hover:text-white rounded-lg transition-all"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="p-2 bg-panel/40 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-lg transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleSave}
                                    className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-all"
                                >
                                    <Save size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditedPosition(position);
                                    }}
                                    className="p-2 bg-panel/40 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-lg transition-all"
                                >
                                    <X size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Chart */}
            {showChart && (
                <div className="border-b border-border/20">
                    {loadingChart ? (
                        <div className="h-48 flex items-center justify-center">
                            <div className="text-slate-500 text-sm">Loading chart...</div>
                        </div>
                    ) : (
                        <PositionMiniChart
                            ticker={position.ticker}
                            data={chartData}
                            entryPrice={position.entry_price}
                            stopLoss={position.stop_loss}
                            target={position.target}
                            height={200}
                        />
                    )}
                </div>
            )}

            {/* Position Details */}
            <div className="p-4 space-y-3">
                {isEditing ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Entry Price</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editedPosition.entry_price}
                                    onChange={(e) => setEditedPosition({ ...editedPosition, entry_price: parseFloat(e.target.value) })}
                                    className="w-full mt-1 px-3 py-2 bg-panel/40 border border-border/40 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Quantity</label>
                                <input
                                    type="number"
                                    value={editedPosition.quantity}
                                    onChange={(e) => setEditedPosition({ ...editedPosition, quantity: parseInt(e.target.value) })}
                                    className="w-full mt-1 px-3 py-2 bg-panel/40 border border-border/40 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Stop Loss</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editedPosition.stop_loss}
                                    onChange={(e) => setEditedPosition({ ...editedPosition, stop_loss: parseFloat(e.target.value) })}
                                    className="w-full mt-1 px-3 py-2 bg-panel/40 border border-border/40 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Target</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editedPosition.target}
                                    onChange={(e) => setEditedPosition({ ...editedPosition, target: parseFloat(e.target.value) })}
                                    className="w-full mt-1 px-3 py-2 bg-panel/40 border border-border/40 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Notes</label>
                            <textarea
                                value={editedPosition.notes}
                                onChange={(e) => setEditedPosition({ ...editedPosition, notes: e.target.value })}
                                className="w-full mt-1 px-3 py-2 bg-panel/40 border border-border/40 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                rows={2}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Entry</div>
                            <div className="text-lg font-bold text-white">₹{position.entry_price.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Quantity</div>
                            <div className="text-lg font-bold text-white">{position.quantity}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Stop Loss</div>
                            <div className="text-lg font-bold text-red-400 flex items-center gap-1">
                                <ArrowDownRight size={14} />
                                ₹{position.stop_loss.toFixed(2)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Target</div>
                            <div className="text-lg font-bold text-emerald-400">₹{position.target.toFixed(2)}</div>
                        </div>
                    </div>
                )}

                {position.notes && !isEditing && (
                    <div className="pt-2 border-t border-border/10">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notes</div>
                        <p className="text-sm text-slate-400">{position.notes}</p>
                    </div>
                )}

                {/* Risk/Reward */}
                {!isEditing && (
                    <div className="pt-2 border-t border-border/10">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Risk/Reward</span>
                            <span className="text-sm font-bold text-indigo-400">
                                1:{((position.target - position.entry_price) / (position.entry_price - position.stop_loss)).toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

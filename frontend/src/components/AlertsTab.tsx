import React, { useState } from 'react';
import { Send, CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { sendTelegramAlert, fetchTopMLPicks } from '../api';

interface AlertsTabProps {
    results: any[];
    marketKey: string;
}

const AlertsTab: React.FC<AlertsTabProps> = ({ results, marketKey }) => {
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleSend = async () => {
        if (!message) return;

        setSending(true);
        setError(null);
        setSuccess(null);

        try {
            const data = await sendTelegramAlert(message);
            setSuccess(data.message || 'Alert sent successfully');
            setMessage('');
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to send alert');
        } finally {
            setSending(false);
        }
    };

    const handlePredefined = (text: string) => {
        setMessage(text);
    };

    const handleGenerateMLAlert = async () => {
        if (!results || results.length === 0) {
            setError("No scan results available to generate ML picks.");
            return;
        }

        setGenerating(true);
        setError(null);

        try {
            // Fetch top picks for a standard 5-day horizon
            const data = await fetchTopMLPicks(marketKey, results, 5);
            if (!data.success || !data.picks || data.picks.length === 0) {
                setError("No ML picks returned/models might not be trained.");
                setGenerating(false);
                return;
            }

            const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

            let draft = `🤖 <b>VCP ML SCANNER — ${now}</b>\n`;
            draft += `🎯 Target: 5% gain within 5 days\n`;
            draft += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            data.picks.slice(0, 5).forEach((pick: any) => {
                const stageIcon = pick.stage === 2 ? "✅" : "⚠️";
                const rsiColor = pick.rsi > 70 ? "🔴" : (pick.rsi < 30 ? "🟢" : "⚪");
                const price = pick.ticker.endsWith('-EQ') ? `₹${pick.last_price.toFixed(2)}` : `$${pick.last_price.toFixed(2)}`;
                const target = pick.ticker.endsWith('-EQ') ? `₹${(pick.last_price * 1.05).toFixed(2)}` : `$${(pick.last_price * 1.05).toFixed(2)}`;
                const sl = pick.ticker.endsWith('-EQ') ? `₹${(pick.last_price * 0.93).toFixed(2)}` : `$${(pick.last_price * 0.93).toFixed(2)}`;

                draft += `\n<b>#${pick.rank} ${pick.ticker}</b>  ${stageIcon} Stage ${pick.stage}\n`;
                draft += `   💰 Price: ${price}\n`;
                draft += `   🧠 ML Prob: <b>${(pick.ml_probability * 100).toFixed(1)}%</b> | VCP Score: ${pick.score.toFixed(0)}\n`;
                draft += `   📊 RSI: ${pick.rsi.toFixed(1)} ${rsiColor} | CHK: ${pick.checklist}/7\n`;
                draft += `   🎯 Target: ${target} (+5%) | SL: ${sl}\n`;
            });

            draft += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            draft += `📌 Entry: Buy on strength with vol > 1.5x avg\n`;
            draft += `🛡 Stop: 7% below entry\n`;
            draft += `📈 Universe: ${marketKey} | Model: XGBoost VCP-ML`;

            setMessage(draft);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch ML picks');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-200 p-6 overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 flex items-center justify-between">
                <div className="flex items-center">
                    <Send className="mr-3 text-blue-400" />
                    Telegram Alerts
                </div>
            </h2>

            <div className="max-w-3xl bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
                <p className="text-sm text-slate-400 mb-4">
                    Send manual alerts or auto-generate ML probability signals to your configured Telegram channels.
                </p>

                <div className="mb-4 flex flex-wrap gap-2">
                    <button
                        onClick={handleGenerateMLAlert}
                        disabled={generating}
                        className="flex items-center text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg shadow disabled:opacity-50 transition-colors"
                    >
                        {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2 text-yellow-300" />}
                        Auto-Generate ML Picks
                    </button>
                    <button onClick={() => handlePredefined("🤖 VCP Dashboard test message. Connection is working!")} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg transition-colors">Test Ping</button>
                    <button onClick={() => handlePredefined("📈 Market Update: Regime shifted to 🟢 BULL mode.")} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg transition-colors">Bull Regime</button>
                    <button onClick={() => handlePredefined("📉 Market Update: Regime shifted to 🔴 BEAR mode.")} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg transition-colors">Bear Regime</button>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full h-80 bg-slate-900 border border-slate-600 rounded-lg p-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm leading-relaxed"
                        placeholder="Hello from VCP Dashboard..."
                    />
                </div>

                <button
                    onClick={handleSend}
                    disabled={sending || !message}
                    className="flex items-center justify-center w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-8 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {sending ? (
                        <>
                            <Loader2 className="animate-spin w-5 h-5 mr-2" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send className="w-5 h-5 mr-2" />
                            Send Alert to Telegram
                        </>
                    )}
                </button>

                {error && (
                    <div className="mt-4 bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                        <div>{error}</div>
                    </div>
                )}

                {success && (
                    <div className="mt-4 bg-emerald-900/30 border border-emerald-800 text-emerald-300 px-4 py-3 rounded flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                        <div>{success}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertsTab;


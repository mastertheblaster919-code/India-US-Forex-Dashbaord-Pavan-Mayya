import { useState, useEffect } from 'react';
import { Activity, RefreshCw, Wallet, BookOpen, Target } from 'lucide-react';

interface MarketBotTabProps {
  market: 'FOREX' | 'US' | 'IN';
}

interface Signal {
  symbol: string;
  name: string;
  type: string;
  direction: string;
  price: number;
  score: number;
  vcp_score?: number;
  rsi?: number;
  adx?: number;
  sl: number;
  tp: number;
}

interface Stats {
  balance: number;
  total_return_pct: number;
  open_positions: number;
  total_trades: number;
  win_rate: number;
}

const MARKET_CONFIG = {
  FOREX: { port: 5001, name: 'FOREX Bot', color: 'amber', timeframe: '2H' },
  US: { port: 5002, name: 'USA Bot', color: 'blue', timeframe: '1D' },
  IN: { port: 5003, name: 'India Bot', color: 'emerald', timeframe: '1D' }
};

export default function MarketBotTab({ market }: MarketBotTabProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [portfolio, setPortfolio] = useState<{ stats: Stats; positions: any[] } | null>(null);
  const [journal, setJournal] = useState<{ stats: any; entries: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'signals' | 'portfolio' | 'journal'>('signals');

  const config = MARKET_CONFIG[market];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [scanRes, portRes, journalRes] = await Promise.all([
        fetch(`http://localhost:${config.port}/api/scan`),
        fetch(`http://localhost:${config.port}/api/status`),
        fetch(`http://localhost:${config.port}/api/journal`)
      ]);
      
      const scanData = await scanRes.json();
      const portData = await portRes.json();
      const journalData = await journalRes.json();
      
      if (scanData.signals) setSignals(scanData.signals || []);
      if (portData.stats) setPortfolio(portData);
      if (journalData.entries) setJournal(journalData);
    } catch (e) {
      console.error('Error fetching data:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [market]);

  const colorClasses = {
    amber: { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500' },
    blue: { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500' },
    emerald: { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500' }
  };
  const colors = colorClasses[config.color as keyof typeof colorClasses];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center`}>
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{config.name}</h2>
            <p className="text-xs text-slate-400">VCP Strategy - {config.timeframe} Timeframe</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${colors.bg} text-white font-medium hover:opacity-90 transition-all`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Scan Now
        </button>
      </div>

      {/* Stats Cards */}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#12121a] rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <Wallet className="w-3 h-3" />
              Balance
            </div>
            <p className="text-xl font-bold text-white mono">${portfolio.stats.balance.toLocaleString()}</p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              Return
            </div>
            <p className={`text-xl font-bold mono ${portfolio.stats.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {portfolio.stats.total_return_pct >= 0 ? '+' : ''}{portfolio.stats.total_return_pct.toFixed(2)}%
            </p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              Open Positions
            </div>
            <p className="text-xl font-bold text-white mono">{portfolio.stats.open_positions}</p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              Win Rate
            </div>
            <p className="text-xl font-bold text-white mono">{portfolio.stats.win_rate.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('signals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'signals' ? `${colors.bg}/20 ${colors.text} border ${colors.border}` : 'bg-slate-800/50 text-slate-400'
          }`}
        >
          <Target className="w-4 h-4" />
          Signals ({signals.length})
        </button>
        <button
          onClick={() => setActiveView('portfolio')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'portfolio' ? `${colors.bg}/20 ${colors.text} border ${colors.border}` : 'bg-slate-800/50 text-slate-400'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Portfolio ({portfolio?.positions.length || 0})
        </button>
        <button
          onClick={() => setActiveView('journal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'journal' ? `${colors.bg}/20 ${colors.text} border ${colors.border}` : 'bg-slate-800/50 text-slate-400'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Journal
        </button>
      </div>

      {/* Content */}
      <div className="bg-[#12121a] rounded-xl border border-slate-800">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <RefreshCw className={`w-8 h-8 ${colors.text} animate-spin`} />
          </div>
        ) : (
          <>
            {activeView === 'signals' && (
              <div className="p-4">
                {signals.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No signals above threshold</p>
                ) : (
                  <div className="space-y-2">
                    {signals.slice(0, 20).map((signal) => (
                      <div key={signal.symbol} className="p-3 rounded-lg bg-slate-800/50 border-l-4 border-l-emerald-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-white">{signal.symbol}</span>
                            <span className="text-xs text-slate-500">{signal.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`text-sm font-bold ${signal.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {signal.direction}
                            </span>
                            <span className={`text-lg font-bold ${colors.text}`}>{signal.score}%</span>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-slate-500">
                          <span>Price: <span className="text-white mono">{signal.price.toFixed(2)}</span></span>
                          <span>SL: <span className="text-red-400 mono">{signal.sl.toFixed(2)}</span></span>
                          <span>TP: <span className="text-emerald-400 mono">{signal.tp.toFixed(2)}</span></span>
                          {signal.vcp_score && <span>VCP: {signal.vcp_score.toFixed(0)}</span>}
                          {signal.rsi && <span>RSI: {signal.rsi.toFixed(0)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === 'portfolio' && (
              <div className="p-4">
                {portfolio?.positions.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No open positions</p>
                ) : (
                  <div className="space-y-2">
                    {portfolio?.positions.map((pos: any) => (
                      <div key={pos.symbol} className="p-3 rounded-lg bg-slate-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-white">{pos.symbol}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${pos.dir === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {pos.dir}
                            </span>
                          </div>
                          <span className="text-sm text-slate-400 mono">Entry: {pos.entry_price?.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === 'journal' && (
              <div className="p-4">
                {journal?.entries.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No trades in journal</p>
                ) : (
                  <div className="space-y-2">
                    {journal?.entries.slice(0, 10).map((entry: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-white">{entry.symbol}</span>
                            <span className="text-xs text-slate-500">{entry.date}</span>
                          </div>
                          <span className={`text-sm font-bold ${parseFloat(entry.pnl_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {entry.pnl_pct || 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

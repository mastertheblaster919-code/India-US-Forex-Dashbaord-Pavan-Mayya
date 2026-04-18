import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { RefreshCw, Settings, BarChart3, X, Search } from 'lucide-react';
import axios from 'axios';
import BotConfigPanel from './BotConfigPanel';

const API_BASE = '/api';

interface IntradaySignal {
  symbol: string;
  sector: string;
  market_cap: string;
  vcp_score: number;
  intraday_score: number;
  entry_signal: boolean;
  entry_type: 'STRONG' | 'MODERATE' | null;
  suggested_entry: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  risk_pct: number;
  ema9_cross: boolean;
  vwap_reclaim: boolean;
  volume_surge_15m: boolean;
  inside_bar_break: boolean;
  ema_stack_1h: boolean;
  rsi_momentum: boolean;
  hourly_breakout: boolean;
  rsi_15m: number;
  rsi_1h: number;
}

interface IntradayConfig {
  auto_refresh_15m: boolean;
  auto_refresh_1h: boolean;
  min_intraday_score: number;
  max_stocks_to_scan: number;
  send_telegram: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  alert_on_strong_only: boolean;
}

interface ChartData {
  candles: { datetime: string; open: number; high: number; low: number; close: number; volume: number }[];
  signals: IntradaySignal;
}

const SECTOR_COLORS: Record<string, string> = {
  'Energy': 'bg-orange-500/20 text-orange-400',
  'IT': 'bg-blue-500/20 text-blue-400',
  'Finance': 'bg-green-500/20 text-green-400',
  'Healthcare': 'bg-red-500/20 text-red-400',
  'Automobile': 'bg-yellow-500/20 text-yellow-400',
  'FMCG': 'bg-purple-500/20 text-purple-400',
  'Metal': 'bg-gray-500/20 text-gray-400',
  'Realty': 'bg-pink-500/20 text-pink-400',
};

const SIGNAL_ICONS = [
  { key: 'ema9_cross', icon: 'EMA', label: 'EMA9 crossed EMA21' },
  { key: 'vwap_reclaim', icon: 'VWAP', label: 'VWAP reclaimed' },
  { key: 'volume_surge_15m', icon: 'VOL', label: 'Volume surge' },
  { key: 'inside_bar_break', icon: 'IB', label: 'Inside bar breakout' },
  { key: 'ema_stack_1h', icon: 'EMA-H', label: '1H EMA stack' },
  { key: 'rsi_momentum', icon: 'RSI', label: 'RSI momentum' },
  { key: 'hourly_breakout', icon: '1H-BK', label: '1H breakout' },
];

export default function IntradayTab() {
  const [scanResults, setScanResults] = useState<IntradaySignal[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'strong' | 'moderate' | 'watchlist'>('all');
  const [config, setConfig] = useState<IntradayConfig | null>(null);
  const [budget, setBudget] = useState({ calls_used: 0, calls_remaining: 100000, limit: 100000, pct_used: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [minScore, setMinScore] = useState(60);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [signalsFound, setSignalsFound] = useState(0);
  const [chartResolution, setChartResolution] = useState<'15' | '60'>('15');
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState('intraday_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/results`);
      if (res.data.results) {
        setScanResults(res.data.results);
        setLastScanTime(res.data.scan_time);
        setSignalsFound(res.data.results.filter((r: IntradaySignal) => r.entry_signal).length);
      }
    } catch (e) {
      console.error('Error fetching results:', e);
    }
  }, []);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/watchlist`);
      if (res.data.watchlist) {
        setWatchlist(res.data.watchlist);
      }
    } catch (e) {
      console.error('Error fetching watchlist:', e);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/config`);
      setConfig(res.data);
    } catch (e) {
      console.error('Error fetching config:', e);
    }
  }, []);

  const fetchBudget = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/budget`);
      setBudget(res.data);
    } catch (e) {
      console.error('Error fetching budget:', e);
    }
  }, []);

  const triggerScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress(0);

    try {
      await axios.post(`${API_BASE}/intraday/scan`);
      await Promise.all([fetchResults(), fetchWatchlist()]);
      await fetchBudget();
    } catch (e) {
      console.error('Scan error:', e);
    } finally {
      setIsScanning(false);
      setScanProgress(100);
    }
  };

  const pollScanStatus = useCallback(async () => {
    if (!isScanning) return;
    try {
      const res = await axios.get(`${API_BASE}/intraday/scan-status`);
      setScanProgress(res.data.progress);
      if (res.data.status === 'done') {
        setIsScanning(false);
        await fetchResults();
      }
    } catch (e) {
      console.error('Poll error:', e);
    }
  }, [isScanning, fetchResults]);

  const toggleAutoRefresh = async (interval: number, enabled: boolean) => {
    try {
      await axios.post(`${API_BASE}/intraday/auto-refresh/toggle?enabled=${enabled}&interval_minutes=${interval}`);
      await fetchConfig();
    } catch (e) {
      console.error('Toggle error:', e);
    }
  };

  const fetchChartData = async (symbol: string, resolution: '15' | '60', retryCount = 0) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const res = await axios.get(`${API_BASE}/intraday/chart/${symbol}/${resolution}`);
      if (res.data.candles?.length > 0) {
        setChartData(res.data);
      } else if (retryCount < 2) {
        // Retry up to 2 times if no data returned
        setTimeout(() => fetchChartData(symbol, resolution, retryCount + 1), 1000);
      } else {
        setChartError(`No ${resolution === '60' ? '1-hour' : '15-minute'} data available`);
      }
    } catch (e: any) {
      if (retryCount < 2 && e.response?.status === 404) {
        // Retry on 404 errors
        setTimeout(() => fetchChartData(symbol, resolution, retryCount + 1), 1000);
      } else {
        console.error('Chart fetch error:', e);
        setChartError(e.response?.data?.detail || 'Failed to load chart data');
      }
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    fetchWatchlist();
    fetchConfig();
    fetchBudget();
  }, [fetchResults, fetchWatchlist, fetchConfig, fetchBudget]);

  useEffect(() => {
    if (isScanning) {
      const interval = setInterval(pollScanStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [isScanning, pollScanStatus]);

  useEffect(() => {
    if (config?.auto_refresh_15m || config?.auto_refresh_1h) {
      const interval = setInterval(fetchResults, 60000);
      return () => clearInterval(interval);
    }
  }, [config, fetchResults]);

  useEffect(() => {
    if (selectedSymbol && chartResolution) {
      fetchChartData(selectedSymbol, chartResolution);
    }
  }, [selectedSymbol, chartResolution]);

  useEffect(() => {
    if (!chartData?.candles?.length || !chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: { background: { color: '#0a0a0f' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: '#374151', timeVisible: true },
      rightPriceScale: { borderColor: '#374151' },
    });

    chartRef.current = chart;

    const candleData: CandlestickData[] = chartData.candles.map(c => ({
      time: c.datetime.replace('+05:30', '').replace('T', ' '),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(candleData);
    candleSeriesRef.current = candleSeries as unknown as ISeriesApi<'Candlestick'>;

    // VCP Score Histogram below volume
    const scoreData = chartData.candles.map((c: any) => {
        // Since intraday doesn't always have full VCP indicators, 
        // we use the intraday_score if available, or compute a simplified one
        const s = c.rolling_score || chartData.signals?.intraday_score || 0;
        let color = 'rgba(120, 144, 156, 0.4)';
        if (s >= 70) color = 'rgba(34, 197, 94, 0.5)';
        else if (s >= 50) color = 'rgba(234, 179, 8, 0.5)';
        return { time: c.datetime.replace('+05:30', '').replace('T', ' '), value: s, color };
    });

    if (scoreData.length > 0) {
        const scoreSeries = chart.addSeries(HistogramSeries, { 
            priceScaleId: 'vcp_score',
            base: 0,
        });
        chart.priceScale('vcp_score').applyOptions({ 
            scaleMargins: { top: 0.88, bottom: 0 },
            visible: false,
        });
        scoreSeries.setData(scoreData);
        
        // Add threshold lines
        const buyLevel = chart.addSeries(LineSeries, { 
            priceScaleId: 'vcp_score', color: 'rgba(34, 197, 94, 0.2)', lineWidth: 1 as any, lineStyle: 2, crosshairMarkerVisible: false 
        });
        buyLevel.setData(scoreData.map(d => ({ time: d.time, value: 70 })));
    }

    // Volume histogram
    const volData = candleData.map(c => ({
        time: c.time,
        value: (c as any).volume || 0,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'
    }));
    const volSeries = chart.addSeries(HistogramSeries, { 
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
    });
    chart.priceScale('volume').applyOptions({ 
        scaleMargins: { top: 0.75, bottom: 0.15 },
        visible: false
    });
    volSeries.setData(volData);
    chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.35 } } });

    // Entry/Stop/Target lines
    if (chartData.signals) {
      const entry = chartData.signals.suggested_entry;
      const stop = chartData.signals.stop_loss;
      const target = chartData.signals.target_1;

      chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2 }).setData([
        { time: candleData[0].time, value: entry },
        { time: candleData[candleData.length - 1].time, value: entry },
      ]);
      chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 2 }).setData([
        { time: candleData[0].time, value: stop },
        { time: candleData[candleData.length - 1].time, value: stop },
      ]);
      chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 1, lineStyle: 2 }).setData([
        { time: candleData[0].time, value: target },
        { time: candleData[candleData.length - 1].time, value: target },
      ]);
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [chartData]);

  const filteredResults = (activeTab === 'watchlist' ? watchlist : scanResults).filter(r => {
    if (activeTab === 'strong' && (r as IntradaySignal).entry_type !== 'STRONG') return false;
    if (activeTab === 'moderate' && (r as IntradaySignal).entry_type !== 'MODERATE') return false;
    if (searchQuery && !r.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (sectorFilter && r.sector !== sectorFilter) return false;
    
    // Intraday score is only in scanResults, score is in both
    const score = (r as IntradaySignal).intraday_score ?? r.score ?? 0;
    if (score < minScore) return false;
    return true;
  }).sort((a, b) => {
    const aVal = (a as any)[sortColumn] ?? 0;
    const bVal = (b as any)[sortColumn] ?? 0;
    return sortDirection === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
  });

  const sectors = [...new Set(scanResults.map(r => r.sector).filter(Boolean))];

  const getScoreColor = (score: number) => {
    if (score < 70) return 'bg-red-500';
    if (score < 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getBudgetColor = () => {
    if (budget.pct_used < 50) return 'text-green-400';
    if (budget.pct_used < 80) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* SECTION 1: CONTROL BAR */}
      <div className="flex items-center justify-between bg-panel/60 border border-border/50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={triggerScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg text-white font-medium transition-colors"
          >
            {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isScanning ? `Scanning... ${scanProgress}%` : 'Refresh Now'}
          </button>
          <div className="text-sm text-slate-400">
            {lastScanTime ? `Last scan: ${new Date(lastScanTime).toLocaleTimeString()} - ${signalsFound} signals` : 'No scans yet'}
          </div>
          <div className={`text-sm font-mono ${getBudgetColor()}`}>
            API: {budget.calls_used.toLocaleString()} / {budget.limit.toLocaleString()} ({budget.pct_used.toFixed(1)}%)
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => toggleAutoRefresh(15, !config?.auto_refresh_15m)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              config?.auto_refresh_15m ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            15-min auto
          </button>
          <button
            onClick={() => toggleAutoRefresh(60, !config?.auto_refresh_1h)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              config?.auto_refresh_1h ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            1-hour auto
          </button>
          <button onClick={() => setShowConfigPanel(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SECTION 2: SIGNAL TABLE */}
      <div className="flex-1 flex flex-col min-h-0 bg-panel/40 border border-border/30 rounded-lg overflow-hidden">
        {/* Filter Bar */}
        <div className="flex items-center gap-4 p-3 border-b border-border/30">
          <div className="flex gap-1">
            {(['all', 'strong', 'moderate', 'watchlist'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tab === 'all' ? 'All Signals' : tab === 'strong' ? 'Strong' : tab === 'moderate' ? 'Moderate' : 'Watchlist'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-800 border border-border/30 rounded px-3 py-1 text-sm text-white placeholder-slate-500 w-40"
            />
          </div>
          <select
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            className="bg-slate-800 border border-border/30 rounded px-3 py-1 text-sm text-white"
          >
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Min Score:</span>
            <input
              type="range"
              min={60}
              max={100}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-white w-8">{minScore}</span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filteredResults.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              No signals yet - click Refresh Now to scan
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {['Symbol', 'Sector', 'Mkt Cap', 'VCP', 'Intra', 'Type', 'Entry', 'Stop', 'Target', 'Risk%', 'Signals', 'Action'].map(h => (
                    <th key={h} onClick={() => handleSort(h.toLowerCase())} className="px-2 py-2 text-left text-slate-400 font-medium cursor-pointer hover:text-white">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((signal) => (
                  <tr
                    key={signal.symbol}
                    onClick={() => setSelectedSymbol(signal.symbol)}
                    className={`border-b border-border/20 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                      signal.entry_signal ? 'border-l-2 border-l-green-500' : 'opacity-50'
                    } ${signal.entry_type === 'STRONG' ? 'animate-pulse' : ''}`}
                  >
                    <td className="px-2 py-2 font-medium text-white">{signal.symbol}</td>
                    <td className="px-2 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${SECTOR_COLORS[signal.sector] || 'bg-slate-700 text-slate-300'}`}>
                        {signal.sector || 'N/A'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-300">{signal.market_cap || '-'}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-1.5 bg-slate-700 rounded overflow-hidden">
                          <div className={`h-full ${getScoreColor(signal.vcp_score)}`} style={{ width: `${signal.vcp_score}%` }} />
                        </div>
                        <span className="text-slate-300">{signal.vcp_score}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-1.5 bg-slate-700 rounded overflow-hidden">
                          <div className={`h-full ${getScoreColor(signal.intraday_score ?? 0)}`} style={{ width: `${signal.intraday_score ?? 0}%` }} />
                        </div>
                        <span className="text-slate-300">{signal.intraday_score ?? '-'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {signal.entry_type === 'STRONG' ? (
                        <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs">STRONG</span>
                      ) : signal.entry_type === 'MODERATE' ? (
                        <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 text-xs">MODERATE</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-white font-mono">{signal.suggested_entry ? `Rs${signal.suggested_entry.toFixed(2)}` : '-'}</td>
                    <td className="px-2 py-2 text-red-400 font-mono">{signal.stop_loss ? `Rs${signal.stop_loss.toFixed(2)}` : '-'}</td>
                    <td className="px-2 py-2 text-green-400 font-mono">{signal.target_1 ? `Rs${signal.target_1.toFixed(2)}` : '-'}</td>
                    <td className="px-2 py-2 text-red-400">{signal.risk_pct ? `${signal.risk_pct.toFixed(1)}%` : '-'}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-0.5">
                        {SIGNAL_ICONS.map(s => (
                          signal[s.key as keyof IntradaySignal] && (
                            <span key={s.key} title={s.label} className="w-5 h-5 flex items-center justify-center bg-slate-700 rounded text-[10px] text-slate-300">
                              {s.icon}
                            </span>
                          )
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <button className="p-1 bg-slate-700 hover:bg-slate-600 rounded">
                        <BarChart3 className="w-3 h-3 text-slate-300" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SECTION 3: MINI CHART PANEL */}
      {selectedSymbol && (
        <div className="bg-panel/60 border border-border/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{selectedSymbol}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setChartResolution('15')}
                  className={`px-2 py-0.5 rounded text-xs ${chartResolution === '15' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                >
                  15-min
                </button>
                <button
                  onClick={() => setChartResolution('60')}
                  className={`px-2 py-0.5 rounded text-xs ${chartResolution === '60' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                >
                  1-Hour
                </button>
              </div>
            </div>
            <button onClick={() => setSelectedSymbol(null)} className="p-1 hover:bg-slate-700 rounded">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          {chartLoading ? (
            <div className="w-full h-[300px] flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : chartError ? (
            <div className="w-full h-[300px] flex flex-col items-center justify-center gap-2">
              <p className="text-red-400 text-sm">{chartError}</p>
              <button
                onClick={() => fetchChartData(selectedSymbol!, chartResolution)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
              >
                Retry
              </button>
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full h-[300px]" />
          )}
        </div>
      )}

      <BotConfigPanel isOpen={showConfigPanel} onClose={() => setShowConfigPanel(false)} />
    </div>
  );
}

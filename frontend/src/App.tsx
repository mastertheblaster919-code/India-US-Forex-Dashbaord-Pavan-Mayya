import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDates, fetchTickers, fetchScan, fetchLiveScan, fetchChartData, fetchSimulate, refreshCache, fetchStatus, fetchOHLCVStatus, downloadOHLCV, scanPortfolio, fetchLocalPortfolio, fetchBacktest } from './api';
import type { SidebarState, TabKey } from './types';

import Sidebar from './components/Sidebar';
import ScannerTab from './components/ScannerTab';
import ChartAnalysisTab from './components/ChartAnalysisTab';
import WatchlistTab from './components/WatchlistTab';
import MultiChartGrid from './components/MultiChartGrid';
import TradingViewFull from './components/TradingViewFull';
import HeatmapTab from './components/HeatmapTab';
import SimulationTab from './components/SimulationTab';
import BacktestTab from './components/BacktestTab';
import ForwardTab from './components/ForwardTab';
import PortfolioTab from './components/PortfolioTab';
import MLIntelligenceTab from './components/MLIntelligenceTab';
import Top10MLPicksTab from './components/Top10MLPicksTab';
import BrokerTab from './components/BrokerTab';
import CopyWinnerTab from './components/CopyWinnerTab';
import AlertsTab from './components/AlertsTab';
import IntradayTab from './components/IntradayTab';
import ForexBotTab from './components/ForexBotTab';
import MarketBotTab from './components/MarketBotTab';
import AIChatTab from './components/AIChatTab';
import ErrorBoundary from './components/ErrorBoundary';

import {
  Search, BarChart3, Flame, Zap, BookOpen, TrendingUp, Briefcase, Brain, Crown, Shield, Copy, Send, Eye, Activity, MessageSquare
} from 'lucide-react';

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'scanner', label: 'Scanner', icon: Search, color: '#4f46e5' },
  { key: 'intraday', label: 'Intraday', icon: Zap, color: '#22c55e' },
  { key: 'chart', label: 'Chart Analysis', icon: BarChart3, color: '#3b82f6' },
  { key: 'watchlist', label: 'Watchlist', icon: Eye, color: '#10b981' },
  { key: 'heatmap', label: 'Heatmap & Stats', icon: Flame, color: '#f97316' },
  { key: 'simulation', label: 'Simulation', icon: Zap, color: '#f59e0b' },
  { key: 'backtest', label: 'Backtest', icon: BookOpen, color: '#a78bfa' },
  { key: 'forward', label: 'Forward Perf', icon: TrendingUp, color: '#06b6d4' },
  { key: 'portfolio', label: 'Positions', icon: Briefcase, color: '#14b8a6' },
  { key: 'ml', label: 'ML Intelligence', icon: Brain, color: '#a855f7' },
  { key: 'top10', label: 'Top 10 ML', icon: Crown, color: '#f59e0b' },
  { key: 'broker', label: 'Broker', icon: Shield, color: '#6366f1' },
  { key: 'copywinner', label: 'Copy Winner', icon: Copy, color: '#f59e0b' },
  { key: 'alerts', label: 'Alerts', icon: Send, color: '#3b82f6' },
  { key: 'forex', label: 'FOREX Bot', icon: Activity, color: '#f59e0b' },
  { key: 'ai', label: 'AI Chat', icon: MessageSquare, color: '#a855f7' },
];

const today = new Date().toISOString().slice(0, 10);

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  const queryClient = useQueryClient();

  // Clear any cached .NS data on mount
  useEffect(() => {
    // Only clear specific queries that might have .NS data
    queryClient.removeQueries({ queryKey: ['scan'] });
    queryClient.removeQueries({ queryKey: ['chart'] });
  }, [queryClient]);

  // ── Sidebar state ────────────────────────────────────────────────────────
  const [sidebar, setSidebar] = useState<SidebarState>({
    market: 'IN',
    sectors: [],  // Empty = show all sectors
    marketCaps: [],  // Empty = show all market caps
    minVcpScore: 0,
    scanDate: today,
    chartHeight: 600,
    liveSimEnabled: false,
    refreshInterval: 30,
  });

  const [activeTab, setActiveTab] = useState<TabKey>('scanner');
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [forwardResult, setForwardResult] = useState<any>(null);
  const [portfolioResult, setPortfolioResult] = useState<any>(null);
  const [refreshSummary, setRefreshSummary] = useState<{ market: string; date: string; count: number }[] | null>(null);
  const [isLiveScan, setIsLiveScan] = useState(false);
  const [multiChartMode, setMultiChartMode] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'analysis' | 'tradingview'>('analysis');
  const [chartTimeframe, setChartTimeframe] = useState('D');
  const [multiChartData, setMultiChartData] = useState<Record<string, any>>({});
  const [loadingMultiChart, setLoadingMultiChart] = useState<Set<string>>(new Set());

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: dates } = useQuery({
    queryKey: ['dates', sidebar.market],
    queryFn: () => fetchDates(sidebar.market),
  });

  const { data: allAvailableTickers } = useQuery({
    queryKey: ['tickers', sidebar.market],
    queryFn: () => fetchTickers(sidebar.market),
  });

  // ── Patch sidebar ────────────────────────────────────────────────────────
  const patchSidebar = useCallback((patch: Partial<SidebarState>) => {
    setSidebar(prev => {
      const next = { ...prev, ...patch } as SidebarState;

      if (patch.market && patch.market !== prev.market) {
        setSelectedDateIdx(0);
        setSelectedTicker(null);
        next.scanDate = '';
        next.sectors = [];
        next.marketCaps = [];
      }

      if (patch.scanDate && dates?.length) {
        const idx = dates.indexOf(patch.scanDate);
        if (idx >= 0) {
          setSelectedDateIdx(idx);
          if (selectedTicker) {
            setSelectedTicker(null);
          }
        }
      }

      if (
        patch.minVcpScore !== undefined ||
        patch.sectors !== undefined ||
        patch.marketCaps !== undefined
      ) {
        setSelectedTicker(null);
      }

      return next;
    });
  }, [dates, selectedTicker]);

  useEffect(() => {
    if (!dates || dates.length === 0) return;
    if (!sidebar.scanDate || !dates.includes(sidebar.scanDate)) {
      patchSidebar({ scanDate: dates[0] });
      setSelectedDateIdx(0);
      setSelectedTicker(null);
    } else {
      const idx = dates.indexOf(sidebar.scanDate);
      if (idx !== selectedDateIdx && idx >= 0) {
        setSelectedDateIdx(idx);
      }
    }
  }, [dates, sidebar.scanDate, patchSidebar, selectedDateIdx]);

  const currentDate = (() => {
    if (!dates || dates.length === 0) return undefined;
    if (sidebar.scanDate && dates.includes(sidebar.scanDate)) {
      return sidebar.scanDate;
    }
    if (selectedDateIdx >= 0 && selectedDateIdx < dates.length) {
      return dates[selectedDateIdx];
    }
    return dates[0];
  })();

  const { data: scanResults, isLoading: loadingScan } = useQuery({
    queryKey: ['scan', sidebar.market, currentDate, isLiveScan],
    queryFn: () => (isLiveScan && sidebar.market === 'IN')
      ? fetchLiveScan(sidebar.market)
      : fetchScan(sidebar.market, currentDate!),
    enabled: isLiveScan || !!currentDate,
    refetchInterval: isLiveScan ? 60_000 : false,
  });

  const { data: chartData, isLoading: loadingChart } = useQuery({
    queryKey: ['chart', selectedTicker, chartTimeframe],
    queryFn: () => fetchChartData(selectedTicker!, chartTimeframe),
    enabled: !!selectedTicker && !multiChartMode,
  });

  // Fetch chart data for multiple tickers in multi-chart mode
  const fetchMultiChartData = useCallback(async (tickers: string[]) => {
    const newLoading = new Set<string>();
    const newData: Record<string, any> = {};
    
    for (const t of tickers) {
      if (!multiChartData[t] && !loadingMultiChart.has(t)) {
        newLoading.add(t);
      }
    }
    
    if (newLoading.size > 0) {
      setLoadingMultiChart(prev => new Set([...prev, ...newLoading]));
      
      for (const t of newLoading) {
        try {
          const data = await fetchChartData(t);
          newData[t] = data;
        } catch (e) {
          console.error(`Failed to fetch chart for ${t}:`, e);
        }
      }
      
      setLoadingMultiChart(prev => {
        const next = new Set(prev);
        newLoading.forEach(t => next.delete(t));
        return next;
      });
      
      setMultiChartData(prev => ({ ...prev, ...newData }));
    }
  }, [multiChartData, loadingMultiChart]);

  const handleMultiChartSelect = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    fetchMultiChartData([ticker]);
  }, [fetchMultiChartData]);

  const { data: marketStatus } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 60_000,
  });

  const { data: ohlcvStatus, refetch: refetchOHLCVStatus } = useQuery({
    queryKey: ['ohlcv-status'],
    queryFn: fetchOHLCVStatus,
    refetchInterval: 120_000,
  });

  const ohlcvDownloadMutation = useMutation({
    mutationFn: ({ market, incremental }: { market: string; incremental: boolean }) =>
      downloadOHLCV(market, { incremental }),
    onSuccess: () => {
      refetchOHLCVStatus();
    },
  });

  const { data: simResults, isLoading: loadingSim } = useQuery({
    queryKey: ['simulate', sidebar.market],
    queryFn: () => fetchSimulate(sidebar.market),
    enabled: activeTab === 'simulation',
  });

  const refreshMutation = useMutation({
    mutationFn: (market: string) => refreshCache(market),
    onSuccess: (data: any) => {
      const results = data?.results ?? [];
      setRefreshSummary(results);
      results.forEach((result: any) => {
        if (result.market === sidebar.market) {
          patchSidebar({ scanDate: result.date });
        }
      });
      queryClient.invalidateQueries({ queryKey: ['dates'] });
      queryClient.invalidateQueries({ queryKey: ['scan'] });
      queryClient.invalidateQueries({ queryKey: ['ohlcv-status'] });
      queryClient.invalidateQueries({ queryKey: ['market-status'] });
    }
  });

  const handleRefreshData = (market?: string) => {
    const target = market ?? sidebar.market;
    refreshMutation.mutate(target);
  };

  // ── Derived: dynamic sector & cap options from actual scan data ─────────
  const availableSectors: string[] = (() => {
    const raw = (scanResults ?? []).map((r: any) => {
      const s = r.sector;
      return (!s || s.toLowerCase() === 'n/a') ? 'Unknown' : String(s);
    });
    return [...new Set<string>(raw)].sort();
  })();

  const availableCaps: string[] = (() => {
    const raw = (scanResults ?? []).map((r: any) => {
      const c = r.cap;
      return (!c || c.toLowerCase() === 'n/a') ? 'Unknown' : String(c);
    });
    return [...new Set<string>(raw)].sort();
  })();

  // ── Derived data ─────────────────────────────────────────────────────────
  const filteredResults: any[] = (scanResults ?? [])
    .filter((r: any) => (r.score ?? 0) >= sidebar.minVcpScore)
    .filter((r: any) => {
      if (!sidebar.sectors.length) return true;
      const sector = (!r.sector || r.sector.toLowerCase() === 'n/a') ? 'Unknown' : r.sector;
      return sidebar.sectors.includes(sector);
    })
    .filter((r: any) => {
      if (!sidebar.marketCaps.length) return true;
      const cap = (!r.cap || r.cap.toLowerCase() === 'n/a') ? 'Unknown' : r.cap;
      return sidebar.marketCaps.includes(cap);
    });
  const allTickers: string[] = filteredResults.map((r: any) => r.ticker);
  const totalScanCount: number = (scanResults ?? []).length;

  // Auto-select first ticker when results arrive
  useEffect(() => {
    if (!filteredResults.length) {
      if (selectedTicker) {
        setSelectedTicker(null);
      }
      return;
    }
    const exists = filteredResults.some(r => r.ticker === selectedTicker);
    if (!selectedTicker || !exists) {
      setSelectedTicker(filteredResults[0].ticker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredResults, selectedTicker]);

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleRunBacktest = async (ticker: string, period: string, threshold: number) => {
    try {
      const result = await fetchBacktest(ticker, period, threshold);
      if (result.success) {
        setBacktestResult(result);
      } else {
        setBacktestResult({ error: result.error });
      }
    } catch (e: any) {
      setBacktestResult({ error: e.message });
    }
  };

  const handleRunForward = (params: any) => {
    setForwardResult({
      summary: { win_rate: 72.5, avg_return: 4.8, profit_factor: 2.8, total_alpha: 12.3 },
      daily_alpha: Array.from({ length: params.depth }, (_: unknown, i: number) => ({
        day: i + 1, alpha: (Math.random() - 0.3) * 5,
      })),
      ledger: [],
    });
  };

  const handleScanHoldings = async (holdings: any[]) => {
    const formattedHoldings = holdings.map(h => {
      // Normalize keys to support various CSV exports (Zerodha, etc)
      const ticker = h.instrument || h.ticker || h.symbol || h.tradingsymbol || h['instrument'] || 'UNK';
      const quantity = h.quantity || h.qty || h['qty.'] || h['available qty.'] || h['net qty.'] || '0';
      const avgCost = h.avg_cost || h.average_price || h['avg. cost'] || h['avg. price'] || h['buy price'] || '0';

      return {
        ticker: String(ticker).trim(),
        quantity: parseFloat(String(quantity).replace(/,/g, '')) || 0,
        avg_cost: parseFloat(String(avgCost).replace(/,/g, '')) || 0,
      };
    }).filter(h => h.ticker !== 'UNK' && h.quantity > 0);
    try {
      const data = await scanPortfolio(formattedHoldings);
      setPortfolioResult(data);
    } catch (error) {
      console.error('Error scanning holdings:', error);
    }
  };

  const handleSyncLocalHoldings = async () => {
    try {
      const data = await fetchLocalPortfolio();
      setPortfolioResult(data);
    } catch (error) {
      console.error('Error syncing local holdings:', error);
      throw error;
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="app-shell">

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <Sidebar
          state={sidebar}
          onChange={patchSidebar}
          onScanNow={() => {/* react-query auto-fetches */ }}
          onRefreshData={handleRefreshData}
          isScanning={loadingScan}
          marketStatus={marketStatus}
          filteredCount={filteredResults.length}
          totalCount={totalScanCount}
          ohlcvStatus={ohlcvStatus}
          downloadingOHLCV={ohlcvDownloadMutation.isPending}
          onDownloadOHLCV={(market, incremental) => ohlcvDownloadMutation.mutate({ market, incremental })}
          dates={dates}
          refreshing={refreshMutation.isPending}
          refreshSummary={refreshSummary}
          selectedDateIdx={selectedDateIdx}
          onDateIdxChange={idx => {
            setSelectedDateIdx(idx);
            setSelectedTicker(null);
            const nextDate = dates?.[idx];
            if (nextDate) {
              patchSidebar({ scanDate: nextDate });
            }
          }}
          availableSectors={availableSectors}
          availableCaps={availableCaps}
          isLiveScan={isLiveScan}
          onLiveScanToggle={(val) => setIsLiveScan(val)}
        />

        {/* ── Main ────────────────────────────────────────────────────── */}
        <main className="main-content">

          {/* Tab Bar */}
          <div className="tab-bar">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
                  style={isActive ? { '--tab-color': tab.color } as React.CSSProperties : undefined}
                >
                  <Icon className="w-3.5 h-3.5" style={isActive ? { color: tab.color } : undefined} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="tab-content">

            {activeTab === 'scanner' && (
              <ScannerTab
                results={filteredResults}
                loading={loadingScan}
                selectedTicker={selectedTicker ?? undefined}
                onSelectTicker={setSelectedTicker}
              />
            )}

            {activeTab === 'chart' && (
              <div className="flex flex-col h-full">
                {/* Mode toggle */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => { setMultiChartMode(false); setChartViewMode('analysis'); }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      !multiChartMode && chartViewMode === 'analysis'
                        ? 'bg-primary text-white' 
                        : 'bg-[#1a1a28] text-slate-400 hover:text-white'
                    }`}
                  >
                    VCP Analysis
                  </button>
                  <button
                    onClick={() => { setMultiChartMode(false); setChartViewMode('tradingview'); }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      chartViewMode === 'tradingview'
                        ? 'bg-primary text-white' 
                        : 'bg-[#1a1a28] text-slate-400 hover:text-white'
                    }`}
                  >
                    TradingView
                  </button>
                  <button
                    onClick={() => setMultiChartMode(true)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      multiChartMode 
                        ? 'bg-primary text-white' 
                        : 'bg-[#1a1a28] text-slate-400 hover:text-white'
                    }`}
                  >
                    Multi-Chart Grid
                  </button>
                </div>
                
                {multiChartMode ? (
                  <MultiChartGrid
                    tickers={allTickers}
                    chartDataMap={multiChartData}
                    loadingTickers={loadingMultiChart}
                    onSelectTicker={handleMultiChartSelect}
                    selectedTicker={selectedTicker}
                  />
                ) : chartViewMode === 'tradingview' ? (
                  <TradingViewFull 
                    selectedTicker={selectedTicker || undefined} 
                    tickers={allTickers.length > 0 ? allTickers : (allAvailableTickers ?? [])} 
                    onSelectTicker={setSelectedTicker} 
                  />
                ) : (
                  <ChartAnalysisTab
                    chartData={chartData}
                    loadingChart={loadingChart}
                    selectedTicker={selectedTicker}
                    chartHeight={sidebar.chartHeight}
                    tickers={allTickers}
                    results={filteredResults}
                    onSelectTicker={setSelectedTicker}
                    timeframe={chartTimeframe}
                    onTimeframeChange={setChartTimeframe}
                  />
                )}
              </div>
            )}

            {activeTab === 'watchlist' && (
              <WatchlistTab />
            )}

            {activeTab === 'heatmap' && (
              <HeatmapTab results={filteredResults} marketKey={sidebar.market} />
            )}

            {activeTab === 'simulation' && (
              <SimulationTab
                simResults={simResults}
                loading={loadingSim}
                selectedTicker={selectedTicker}
                onSelectTicker={setSelectedTicker}
              />
            )}

            {activeTab === 'backtest' && (
              <BacktestTab
                tickers={allTickers}
                onRunBacktest={handleRunBacktest}
                backtestResult={backtestResult}
                loading={false}
              />
            )}

            {activeTab === 'forward' && (
              <ForwardTab
                onRun={handleRunForward}
                result={forwardResult}
                loading={false}
                selectedTicker={selectedTicker}
                onSelectTicker={setSelectedTicker}
              />
            )}

            {activeTab === 'portfolio' && (
              <PortfolioTab
                onScanHoldings={handleScanHoldings}
                onSyncLocal={handleSyncLocalHoldings}
                portfolioResult={portfolioResult}
                loading={false}
              />
            )}

            {activeTab === 'ml' && (
              <MLIntelligenceTab
                results={filteredResults}
                marketKey={sidebar.market}
              />
            )}

            {activeTab === 'top10' && (
              <Top10MLPicksTab
                results={filteredResults}
                marketKey={sidebar.market}
              />
            )}

            {activeTab === 'broker' && (
              <BrokerTab />
            )}

            {activeTab === 'copywinner' && (
              <CopyWinnerTab
                results={scanResults || []}
                marketKey={sidebar.market}
                selectedTicker={selectedTicker}
                onSelectTicker={setSelectedTicker}
                selectedMarketCaps={sidebar.marketCaps}
                selectedSectors={sidebar.sectors}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsTab
                results={filteredResults}
                marketKey={sidebar.market}
              />
            )}

            {activeTab === 'intraday' && (
              <IntradayTab />
            )}

            {activeTab === 'forex' && (
              <>
                {sidebar.market === 'FOREX' && <ForexBotTab />}
                {sidebar.market === 'US' && <MarketBotTab market="US" />}
                {sidebar.market === 'IN' && <MarketBotTab market="IN" />}
              </>
            )}

            {activeTab === 'ai' && (
              <AIChatTab />
            )}

          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;

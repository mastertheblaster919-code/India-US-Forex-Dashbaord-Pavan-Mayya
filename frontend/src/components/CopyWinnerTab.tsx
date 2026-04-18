import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Copy, Search, Brain, Target, BarChart3,
  RefreshCw, AlertCircle, ChevronDown, ChevronUp, Sparkles,
  TrendingUp, Zap, Activity, Layers, Rocket, Crosshair, Crown, Calendar, Info
} from 'lucide-react';
import { fetchCopyWinner, fetchPresetScan, fetchDates, fetchScan } from '../api';
import ChartTooltip from './ChartTooltip';

// Preset VCP Breakout Setups based on Superior Logic
const PRESET_SETUPS = [
  { 
    id: 'vcp_classic', 
    label: 'Classic VCP', 
    icon: TrendingUp, 
    desc: 'Minervini VCP: 2-4 contractions, bullish SMA stack, price <15% from 52W high', 
    features: { 
      score: 85, 
      tight: 85, 
      trend_template: 1, 
      dist52: 10, 
      rs_ratio: 105, 
      vol_dry_10w: 1,
      sma200_slope: 1
    } 
  },
  { 
    id: 'vcp_early', 
    label: 'Early', 
    icon: Zap, 
    desc: 'Inside the final contraction: ATR declining, volume at multi-week lows', 
    features: { 
      score: 75, 
      tight: 90, 
      vol_ratio: 0.7, 
      atr_declining: 1, 
      dist52: 8 
    } 
  },
  { 
    id: 'squeeze_break', 
    label: 'Squeeze', 
    icon: Activity, 
    desc: 'BB Width < 5% or 52W low: Volatility compressed to extremes', 
    features: { 
      sqz: 1, 
      bbw_pctl: 5, 
      adx: 15, 
      vol_ratio: 0.8, 
      tight: 80 
    } 
  },
  { 
    id: 'base_breakout', 
    label: 'Base', 
    icon: Layers, 
    desc: '6+ week consolidation base with embedded VCP contractions', 
    features: { 
      wbase: 100, 
      tight: 75, 
      score: 80, 
      rs_52w_high: 1,
      dist52: 5 
    } 
  },
  { 
    id: 'momentum', 
    label: 'Momentum', 
    icon: Rocket, 
    desc: 'Pullback to 10/21 EMA in strong uptrend: <10% depth, 1-5 days', 
    features: { 
      score: 90, 
      dist_ema21: 2, 
      rsi: 60, 
      sma_stack: 1,
      vol_ratio: 0.9 
    } 
  },
  { 
    id: 'pullback', 
    label: 'Pullback', 
    icon: Crosshair, 
    desc: 'Low-risk re-entry at 50 SMA or 21 EMA after initial breakout', 
    features: { 
      dist_sma50: 2, 
      vol_ratio: 0.8, 
      trend_template: 1, 
      rs_ratio: 102 
    } 
  },
  { 
    id: 'tight_consolidation', 
    label: 'Tight', 
    icon: Target, 
    desc: 'Weekly range ≤ 1.5% for 3+ weeks: Institutional accumulation', 
    features: { 
      tight: 98, 
      bbw_pctl: 10, 
      score: 82, 
      dist52: 4 
    } 
  },
  { 
    id: 'volume_surge', 
    label: 'Vol Surge', 
    icon: Activity, 
    desc: 'Volume ≥ 200% of 50-day average: Institutional buying signal', 
    features: { 
      vol_surge: 1, 
      vol_ratio: 2.5, 
      pdh_brk: 1, 
      score: 75 
    } 
  },
  { 
    id: 'rs_leader', 
    label: 'RS Leader', 
    icon: Crown, 
    desc: 'RS Rating ≥ 90 and RS Line making new 52-week highs', 
    features: { 
      rs_ratio: 115, 
      rs_52w_high: 1, 
      score: 80, 
      trend_template: 1 
    } 
  },
  { 
    id: 'stage2_fresh', 
    label: 'Stage 2', 
    icon: Layers, 
    desc: 'Stan Weinstein Advancing Phase: Price above rising 30W/150D SMA', 
    features: { 
      stage: 2, 
      sma200_slope: 1, 
      sma_stack: 1, 
      score: 75 
    } 
  },
  { 
    id: 'cup_handle', 
    label: 'Cup', 
    icon: Layers, 
    desc: 'Cup and Handle: 15-35% depth with tight handle in upper half', 
    features: { 
      cup_handle: 1, 
      tight: 85, 
      score: 82, 
      dist52: 6 
    } 
  },
  { 
    id: 'double_bottom', 
    label: 'Dbl Bot', 
    icon: Crosshair, 
    desc: 'W-shaped pattern: Second bottom higher than first (shakeout)', 
    features: { 
      double_bottom: 1, 
      tight: 75, 
      score: 78, 
      dist_low: 5 
    } 
  },
];

interface CopyWinnerTabProps {
  results: any[];
  marketKey: string;
  selectedTicker?: string | null;
  onSelectTicker?: (ticker: string) => void;
  selectedMarketCaps?: string[];
  selectedSectors?: string[];
}

interface FeatureComparison {
  source: number;
  match: number;
}

interface CopyMatch {
  ticker: string;
  name: string;
  sector: string;
  cap: string;
  last_price: number;
  score: number;
  stage: number;
  similarity: number;
  ml_probability: number;
  feature_comparison: Record<string, FeatureComparison>;
}

interface CopyWinnerData {
  success: boolean;
  message: string;
  source_ticker: string;
  source_features: Record<string, number>;
  matches: CopyMatch[];
  generated_at: string;
}

const HORIZON_OPTIONS = [
  { value: 2, label: '2D', target: '3%' },
  { value: 5, label: '5D', target: '5%' },
  { value: 10, label: '10D', target: '8%' },
];

const STAGE_OPTIONS = [
  { value: 1, label: 'Stage 1', desc: 'Basing' },
  { value: 2, label: 'Stage 2', desc: 'Advancing' },
  { value: 3, label: 'Stage 3', desc: 'Topping' },
  { value: 4, label: 'Stage 4', desc: 'Declining' },
];

const FEATURE_LABELS: Record<string, string> = {
  score: 'VCP Score',
  tight: 'Tightness',
  bbw_pctl: 'BB Width %',
  rs_ratio: 'RS Ratio',
  rsi: 'RSI',
  adx: 'ADX',
  vol_ratio: 'Vol Ratio',
  stage: 'Stage',
};

export default function CopyWinnerTab({ 
  results, 
  marketKey, 
  selectedTicker: externalSelectedTicker, 
  onSelectTicker,
  selectedMarketCaps = [],
  selectedSectors = []
}: CopyWinnerTabProps) {
  const [selectedTicker, setSelectedTicker] = useState(externalSelectedTicker || '');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [horizon, setHorizon] = useState(5);
  const [nSimilar, setNSimilar] = useState(10);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [selectedStages, setSelectedStages] = useState<number[]>([1, 2]); // More inclusive default

  // Query available dates
  const { data: availableDates } = useQuery({
    queryKey: ['dates', marketKey],
    queryFn: () => fetchDates(marketKey),
  });

  // Query scan data for selected date
  const { data: dateScanData } = useQuery({
    queryKey: ['scan', marketKey, selectedDate],
    queryFn: () => fetchScan(marketKey, selectedDate),
    enabled: !!selectedDate,
  });

  // Set default date on load
  useEffect(() => {
    if (availableDates && availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  // Update tickers list based on selected date
  // Note: We don't filter the selection dropdown by Sidebar filters to avoid "hidden ticker" confusion
  const dateBasedTickers = (selectedDate && dateScanData ? dateScanData : results) || [];
  
  const filteredDateTickers = dateBasedTickers.filter((r: any) => {
    // Stage Filter (only filter the dropdown by stage to keep it clean)
    if (selectedStages.length > 0) {
      if (!selectedStages.includes(r.stage)) return false;
    }
    return true;
  });

  const allTickers = filteredDateTickers.map((r: any) => r.ticker).sort();

  // Tooltip state
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [stickyTicker, setStickyTicker] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef<any>(null);

  const handleMouseEnter = (e: React.MouseEvent, ticker: string) => {
    if (stickyTicker) return;
    const x = e.clientX;
    const y = e.clientY;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredTicker(ticker);
      setTooltipPos({ x, y });
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredTicker(null);
  };

  const copyMutation = useMutation<CopyWinnerData, Error>({
    mutationFn: () => fetchCopyWinner(selectedTicker, marketKey, nSimilar, horizon, selectedDate),
  });

  const presetMutation = useMutation<any, Error, string>({
    mutationFn: (presetId: string) => fetchPresetScan(presetId, marketKey, 100), // High limit to ensure we have enough after filtering
  });

  const handlePresetClick = (presetId: string) => {
    setActivePreset(presetId);
    setSelectedTicker('');
    presetMutation.mutate(presetId);
  };

  const handleSimpleClick = (ticker: string) => {
    setStickyTicker(ticker === stickyTicker ? null : ticker);
    setHoveredTicker(null);
    if (onSelectTicker) onSelectTicker(ticker);
  };

  const handleFind = useCallback(() => {
    if (!selectedTicker) return;
    copyMutation.mutate();
  }, [selectedTicker, copyMutation]);

  const filteredTickers = searchFilter
    ? allTickers.filter((t: string) => t.toLowerCase().includes(searchFilter.toLowerCase()))
    : allTickers;

  const data = copyMutation.data;

  // Final matches - we filter these by sidebar so they stay relevant to user's focus
  const rawMatches = data?.matches || [];
  const filteredMatches = rawMatches.filter((m: any) => {
    if (selectedMarketCaps.length > 0) {
      const mCap = m.cap || 'Unknown';
      if (!selectedMarketCaps.includes(mCap)) return false;
    }
    if (selectedSectors.length > 0) {
      const mSector = m.sector || 'Unknown';
      if (!selectedSectors.includes(mSector)) return false;
    }
    if (selectedStages.length > 0) {
      if (!selectedStages.includes(m.stage)) return false;
    }
    return true;
  });

  // Also filter preset results
  const rawPresetMatches = presetMutation.data?.matches || [];
  const filteredPresetMatches = rawPresetMatches.filter((r: any) => {
    if (selectedMarketCaps.length > 0) {
      const rCap = r.cap || 'Unknown';
      if (!selectedMarketCaps.includes(rCap)) return false;
    }
    if (selectedSectors.length > 0) {
      const rSector = r.sector || 'Unknown';
      if (!selectedSectors.includes(rSector)) return false;
    }
    if (selectedStages.length > 0 && !selectedStages.includes(r.stage)) return false;
    return true;
  });

  const getSimilarityColor = (sim: number) => {
    if (sim >= 85) return 'text-emerald-400';
    if (sim >= 70) return 'text-yellow-400';
    if (sim >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getSimilarityBg = (sim: number) => {
    if (sim >= 85) return 'bg-emerald-500/20 border-emerald-500/30';
    if (sim >= 70) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-orange-500/20 border-orange-500/30';
  };

  const getProbColor = (prob: number) => {
    if (prob >= 0.7) return 'text-emerald-400';
    if (prob >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const resultsArray = Array.isArray(results) ? results : [];

  // Derived tools data
  const marketHealth = resultsArray.length > 0 ? (resultsArray[0].market_health ?? true) : true;
  const stage2Count = resultsArray.filter(r => r.stage === 2).length;
  const stage2Pct = resultsArray.length > 0 ? (stage2Count / resultsArray.length * 100).toFixed(1) : '0';
  const avgVcpScore = resultsArray.length > 0 ? (resultsArray.reduce((acc, r) => acc + (r.score || 0), 0) / resultsArray.length).toFixed(1) : '0';

  return (
    <div className="tab-panel overflow-y-auto">
      <div className="panel-card">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Copy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">VCP Breakout Scanner</h2>
              <p className="text-slate-400 text-sm">
                Advanced filtering & pattern matching for explosive breakouts
              </p>
            </div>
          </div>

          {/* Important Tools Section */}
          <div className="flex items-center gap-4 bg-[#111827] border border-[#1f2937] rounded-xl px-4 py-2">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-slate-500 font-bold">Market Health</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${marketHealth ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-xs font-bold ${marketHealth ? 'text-emerald-400' : 'text-red-400'}`}>
                  {marketHealth ? 'BULLISH' : 'CAUTION'}
                </span>
              </div>
            </div>
            <div className="w-px h-8 bg-[#1f2937]" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-slate-500 font-bold">VCP Breadth</span>
              <span className="text-xs font-bold text-amber-400">{stage2Pct}% Stage 2</span>
            </div>
            <div className="w-px h-8 bg-[#1f2937]" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-slate-500 font-bold">Avg Intensity</span>
              <span className="text-xs font-bold text-white">{avgVcpScore}</span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar: Stage Selection */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Focus Stage
            </label>
            <div className="flex bg-[#0a0e1a] rounded-lg p-1 border border-[#1f2937]">
              {STAGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedStages(prev => 
                      prev.includes(opt.value) 
                        ? prev.filter(v => v !== opt.value)
                        : [...prev, opt.value]
                    );
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex flex-col items-center ${
                    selectedStages.includes(opt.value)
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[8px] opacity-70`}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Active Filters
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedMarketCaps.length > 0 && (
                <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] rounded-md font-bold uppercase">
                  {selectedMarketCaps.length} Caps Selected
                </span>
              )}
              {selectedSectors.length > 0 && (
                <span className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] rounded-md font-bold uppercase">
                  {selectedSectors.length} Sectors Selected
                </span>
              )}
              {selectedStages.length > 0 && (
                <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] rounded-md font-bold uppercase">
                  Stage {selectedStages.join(', ')}
                </span>
              )}
              {selectedMarketCaps.length === 0 && selectedSectors.length === 0 && (
                <span className="px-2 py-1 bg-[#111827] border border-[#1f2937] text-slate-500 text-[10px] rounded-md font-bold uppercase">
                  No Sidebar Filters
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Preset Setups */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 block">
            Quick Setups
          </label>
          <div className="grid grid-cols-6 md:grid-cols-9 gap-1.5">
            {PRESET_SETUPS.map((setup) => {
              const Icon = setup.icon;
              return (
                <button
                  key={setup.id}
                  onClick={() => handlePresetClick(setup.id)}
                  className={`flex flex-col items-center gap-0.5 p-1.5 bg-[#0a0e1a] border rounded-md hover:bg-[#111827] transition-all group ${activePreset === setup.id ? 'border-amber-500 bg-[#111827]' : 'border-[#1f2937] hover:border-amber-500/50'}`}
                  title={setup.desc}
                >
                  <Icon className={`w-3.5 h-3.5 ${activePreset === setup.id ? 'text-white' : 'text-amber-400'}`} />
                  <span className={`text-[9px] font-medium ${activePreset === setup.id ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{setup.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Selector */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Scan Date
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-[#0a0e1a] border border-[#1f2937] rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none min-w-[140px]"
              >
                {availableDates?.map((date: string) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>

            {/* Stock Selector */}
            <div className="flex-1 min-w-[250px]">
              <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5 block flex items-center gap-1">
                <Target className="w-3 h-3" />
                Select Winner Stock
                {selectedDate && <span className="text-amber-500 text-[9px] ml-1">from {selectedDate}</span>}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Search ticker..."
                  className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div className="mt-1 bg-[#0a0e1a] border border-[#1f2937] rounded-lg max-h-40 overflow-y-auto custom-scrollbar">
                {filteredTickers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-600">No tickers found</div>
                ) : (
                  filteredTickers.slice(0, 50).map((t: string) => (
                    <button
                      key={t}
                      onClick={() => { setSelectedTicker(t); setSearchFilter(''); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#1a1a28] transition-colors ${
                        selectedTicker === t
                          ? 'bg-amber-500/10 text-amber-400 font-semibold'
                          : 'text-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Horizon */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5 block">
                Horizon
              </label>
              <div className="flex bg-[#0a0e1a] rounded-lg p-1 border border-[#1f2937]">
                {HORIZON_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setHorizon(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      horizon === opt.value
                        ? 'bg-amber-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* N Similar */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5 block">
                Results
              </label>
              <select
                value={nSimilar}
                onChange={e => setNSimilar(Number(e.target.value))}
                className="bg-[#0a0e1a] border border-[#1f2937] rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none"
              >
                {[5, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n} matches</option>
                ))}
              </select>
            </div>

            {/* Find Button */}
            <button
              onClick={handleFind}
              disabled={!selectedTicker || copyMutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
            >
              {copyMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Finding...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Find Similar</>
              )}
            </button>
          </div>

          {/* Selected ticker badge */}
          {selectedTicker && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-500">Selected:</span>
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-sm rounded-lg">
                {selectedTicker}
              </span>
              <span className="text-xs text-slate-600">from {selectedDate}</span>
            </div>
          )}
        </div>

        {/* Feature Panel for Selected Ticker */}
        {selectedTicker && dateScanData && (
          <div className="mb-6 bg-[#111827] border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white">{selectedTicker} Features on {selectedDate}</span>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {(() => {
                const tickerData = dateScanData.find((r: any) => r.ticker === selectedTicker);
                if (!tickerData) return null;
                const displayFeatures = [
                  { key: 'score', label: 'VCP Score' },
                  { key: 'tight', label: 'Tightness' },
                  { key: 'bbw_pctl', label: 'BB Width %' },
                  { key: 'rs_ratio', label: 'RS Ratio' },
                  { key: 'rsi', label: 'RSI' },
                  { key: 'adx', label: 'ADX' },
                  { key: 'vol_ratio', label: 'Vol Ratio' },
                  { key: 'stage', label: 'Stage' },
                  { key: 'sector', label: 'Sector' },
                  { key: 'cap', label: 'Cap' },
                  { key: 'last_price', label: 'Price' },
                  { key: 'pdh_brk', label: 'PDH Brk' },
                ];
                return displayFeatures.map(f => (
                  <div key={f.key} className="bg-[#0a0e1a] rounded-lg p-2 text-center">
                    <div className="text-[9px] text-slate-600 uppercase">{f.label}</div>
                    <div className="text-sm font-bold text-amber-400">
                      {f.key === 'last_price' ? '¥' : ''}{typeof tickerData[f.key] === 'number' ? tickerData[f.key].toFixed(f.key === 'last_price' ? 2 : 1) : tickerData[f.key] || '-'}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Results */}
        {copyMutation.isPending && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Brain className="w-12 h-12 text-amber-400 animate-pulse mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Analyzing VCP features and finding similar setups...</p>
            </div>
          </div>
        )}

        {data && !data.success && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-red-400 font-semibold text-sm">Error</div>
              <p className="text-slate-400 text-sm mt-1">{data.message}</p>
            </div>
          </div>
        )}

        {data && data.success && (
          <>
            {/* Source Features Summary */}
            <div className="bg-[#111827] border border-amber-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">Similarity Analysis for {data.source_ticker}</span>
                <span className="text-xs text-slate-500 ml-auto">{filteredMatches.length} filtered matches found</span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <div key={key} className="bg-[#0a0e1a] rounded-lg p-2 text-center">
                    <div className="text-[9px] text-slate-600 uppercase">{label}</div>
                    <div className="text-sm font-bold text-amber-400">
                      {(data.source_features[key] ?? 0).toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Match Cards */}
            <div className="space-y-4">
              {filteredMatches.map((match: any, idx: number) => (
                <div
                  key={match.ticker}
                  className={`bg-[#0a0e1a] border border-[#1f2937] rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all ${expandedMatch === match.ticker ? 'ring-1 ring-amber-500/50' : ''}`}
                >
                  <div
                    className="p-4 flex flex-wrap items-center gap-4 cursor-pointer"
                    onClick={() => setExpandedMatch(expandedMatch === match.ticker ? null : match.ticker)}
                    onMouseEnter={(e) => handleMouseEnter(e, match.ticker)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Rank & Ticker */}
                    <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                        {idx + 1}
                      </div>
                      <div onClick={(e) => { e.stopPropagation(); handleSimpleClick(match.ticker); }}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-400 text-lg hover:underline transition-all cursor-pointer">
                            {match.ticker.replace('-EQ', '')}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${['', 'bg-slate-800 text-slate-400', 'bg-emerald-900/30 text-emerald-400', 'bg-blue-900/30 text-blue-400', 'bg-amber-900/30 text-amber-400'][match.stage] || 'bg-slate-800 text-slate-400'}`}>
                            S{match.stage}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[150px]">{match.name}</div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sector</div>
                          <div className="text-xs text-slate-300">{match.sector}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Market Cap</div>
                          <div className="text-xs text-slate-300">{match.cap}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">VCP Score</div>
                          <div className="font-semibold text-white">{match.score.toFixed(1)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Price</div>
                          <div className="font-semibold text-slate-300">
                            {match.ticker.endsWith('-EQ') ? '₹' : '$'}{match.last_price.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Similarity Badge */}
                      <div className={`px-3 py-2 rounded-xl border ${getSimilarityBg(match.similarity)}`}>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Similarity</div>
                        <div className={`font-bold text-lg ${getSimilarityColor(match.similarity)}`}>
                          {match.similarity.toFixed(1)}%
                        </div>
                      </div>

                      {/* ML Probability */}
                      <div className="text-center px-3">
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ML Win%</div>
                        <div className={`font-bold text-sm ${getProbColor(match.ml_probability)}`}>
                          {(match.ml_probability * 100).toFixed(0)}%
                        </div>
                      </div>

                      {expandedMatch === match.ticker
                        ? <ChevronUp className="w-4 h-4 text-slate-500" />
                        : <ChevronDown className="w-4 h-4 text-slate-500" />
                      }
                    </div>
                  </div>

                  {/* Expanded: Feature Comparison */}
                  {expandedMatch === match.ticker && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-3">
                      <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Feature Comparison (Source vs Match)
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(match.feature_comparison).map(([feat, vals]: [string, any]) => {
                          const label = FEATURE_LABELS[feat] || feat;
                          const diff = vals.match - vals.source;
                          const diffPct = vals.source !== 0 ? (diff / Math.abs(vals.source)) * 100 : 0;
                          return (
                            <div key={feat} className="bg-slate-900/50 rounded-lg p-3">
                              <div className="text-[10px] uppercase text-slate-600 mb-2">{label}</div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-amber-400">Source</span>
                                <span className="text-sm font-bold text-amber-400">{vals.source.toFixed(1)}</span>
                              </div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-blue-400">Match</span>
                                <span className="text-sm font-bold text-blue-400">{vals.match.toFixed(1)}</span>
                              </div>
                              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    Math.abs(diffPct) < 20 ? 'bg-emerald-500' :
                                    Math.abs(diffPct) < 50 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.max(5, 100 - Math.abs(diffPct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
                <span>High similarity (≥85%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30" />
                <span>Good similarity (70-85%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500/20 border border-orange-500/30" />
                <span>Moderate similarity (&lt;70%)</span>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!copyMutation.isPending && !data && !presetMutation.data && (
          <div className="text-center py-16">
            <Copy className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Select a Winning Stock</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Choose a stock you like from the dropdown above, or click one of the quick setup buttons above to scan for active VCP breakout patterns.
            </p>
          </div>
        )}

        {/* Preset Scan Results */}
        {presetMutation.isPending && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Brain className="w-12 h-12 text-amber-400 animate-pulse mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Scanning for {PRESET_SETUPS.find(p => p.id === activePreset)?.label || 'preset'} setups...</p>
            </div>
          </div>
        )}

        {presetMutation.data && presetMutation.data.success && (
          <>
            <div className="bg-[#111827] border border-amber-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">{presetMutation.data.preset_name}</span>
                <span className="text-xs text-slate-500 ml-auto">{filteredPresetMatches.length} filtered matches found</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(presetMutation.data.matches[0]?.features || {}).map(([k, v]) => (
                  <span key={k} className="text-[10px] px-2 py-1 bg-slate-800 rounded text-slate-400">
                    {k}: <span className="text-amber-400">{String(v)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredPresetMatches.map((match: any, idx: number) => (
                <div
                  key={match.ticker}
                  onClick={() => handleSimpleClick(match.ticker)}
                  onMouseEnter={(e) => handleMouseEnter(e, match.ticker)}
                  onMouseLeave={handleMouseLeave}
                  className={`bg-[#0a0e1a] border rounded-lg p-3 flex items-center gap-3 hover:border-amber-500/50 transition-all cursor-pointer ${idx === 0 ? 'border-amber-500/50' : 'border-[#1f2937]'}`}
                >
                  <div className="text-lg font-bold text-slate-500 w-6">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-400">{match.ticker.replace('-EQ', '')}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${['', 'bg-slate-800 text-slate-400', 'bg-emerald-900/30 text-emerald-400', 'bg-blue-900/30 text-blue-400', 'bg-amber-900/30 text-amber-400'][match.stage] || 'bg-slate-800 text-slate-400'}`}>
                        S{match.stage}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{match.sector}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">${match.last_price?.toFixed(2) || '0'}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Score: {match.score?.toFixed(0) || '0'}</div>
                  </div>
                  <div className="text-center px-3">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Match</div>
                    <div className="font-bold text-amber-400">{match.match_score?.toFixed(0) || '0'}%</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Hover/Sticky Tooltip */}
      {(hoveredTicker || stickyTicker) && (
        <ChartTooltip
          ticker={stickyTicker || hoveredTicker || ''}
          visible={true}
          x={tooltipPos.x}
          y={tooltipPos.y}
          isSticky={!!stickyTicker}
          onClose={() => setStickyTicker(null)}
        />
      )}
    </div>
  );
}

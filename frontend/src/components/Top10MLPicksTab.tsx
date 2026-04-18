import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Trophy, Brain, Target, AlertCircle,
  RefreshCw, Sparkles, BarChart3, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { fetchTopMLPicks, fetchMLStatus, trainMLModels, buildMLDataset } from '../api';

interface Top10MLPicksTabProps {
  results: any[];
  marketKey: string;
}

interface MLPick {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  cap: string;
  last_price: number;
  score: number;
  ml_probability: number;
  avg_probability: number;
  horizon: number;
  top_features: { name: string; importance: number; value: number }[];
  stage: number;
  checklist: number;
  rsi: number;
  rs_1y: number;
  trend_template?: boolean;
  dist_low?: number;
}

const HORIZON_OPTIONS = [
  { value: 2, label: '2 Days', target: '3%' },
  { value: 5, label: '5 Days', target: '5%' },
  { value: 10, label: '10 Days', target: '8%' },
];

export default function Top10MLPicksTab({ results, marketKey }: Top10MLPicksTabProps) {
  const [horizon, setHorizon] = useState(5);
  const [expandedPick, setExpandedPick] = useState<number | null>(null);
  const [localPicks, setLocalPicks] = useState<MLPick[]>([]);

  // Check ML status
  const { data: mlStatus } = useQuery({
    queryKey: ['ml-status', marketKey],
    queryFn: () => fetchMLStatus(marketKey),
    refetchInterval: 30_000,
  });

  const hasModels = mlStatus?.has_models ?? false;

  // Build dataset mutation
  const buildDatasetMutation = useMutation({
    mutationFn: () => buildMLDataset(marketKey),
  });

  // Train models mutation
  const trainModelsMutation = useMutation({
    mutationFn: () => trainMLModels(marketKey),
  });

  // Fetch top picks
  const { data: picksData, isLoading: loadingPicks, refetch: refetchPicks } = useQuery({
    queryKey: ['top-ml-picks', marketKey, horizon, results.length],
    queryFn: async () => {
      if (!results.length || !hasModels) return null;
      const data = await fetchTopMLPicks(marketKey, results, horizon);
      return data;
    },
    enabled: hasModels && results.length > 0,
    refetchOnWindowFocus: false,
  });

  // Update local picks when data arrives
  useEffect(() => {
    if (picksData?.success && picksData.picks) {
      setLocalPicks(picksData.picks);
    }
  }, [picksData]);

  // Manual refresh
  const handleRefresh = useCallback(() => {
    refetchPicks();
  }, [refetchPicks]);

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-yellow-600';
    if (rank === 2) return 'from-gray-300 to-gray-500';
    if (rank === 3) return 'from-amber-600 to-amber-800';
    return 'from-slate-600 to-slate-700';
  };

  const getRankIcon = (rank: number) => {
    if (rank <= 3) return <Trophy className="w-4 h-4 text-white" />;
    return <span className="text-white font-bold text-sm">{rank}</span>;
  };

  const getProbabilityColor = (prob: number) => {
    if (prob >= 0.7) return 'text-emerald-400';
    if (prob >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getCurrency = (ticker: string) => {
    return ticker.endsWith('-EQ') ? '₹' : '$';
  };

  const getProbabilityBg = (prob: number) => {
    if (prob >= 0.7) return 'bg-emerald-500/20 border-emerald-500/30';
    if (prob >= 0.5) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  // Training panel when no models
  if (!hasModels) {
    return (
      <div className="tab-panel">
        <div className="panel-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Top 10 ML Picks</h2>
              <p className="text-slate-400 text-sm">AI-powered stock selection based on XGBoost models</p>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 text-center">
            <Sparkles className="w-16 h-16 text-violet-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">ML Models Not Trained</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              To generate top picks, you need to build a training dataset and train the ML models first.
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => buildDatasetMutation.mutate()}
                disabled={buildDatasetMutation.isPending}
                className="btn btn-primary"
              >
                {buildDatasetMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Building Dataset...</>
                ) : (
                  <><BarChart3 className="w-4 h-4" /> Build Dataset</>
                )}
              </button>

              <button
                onClick={() => trainModelsMutation.mutate()}
                disabled={trainModelsMutation.isPending || buildDatasetMutation.isPending}
                className="btn btn-secondary"
              >
                {trainModelsMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Training...</>
                ) : (
                  <><Brain className="w-4 h-4" /> Train Models</>
                )}
              </button>
            </div>

            {buildDatasetMutation.data && (
              <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-emerald-400 font-medium">Dataset Built Successfully</p>
                <p className="text-slate-400 text-sm mt-1">
                  {buildDatasetMutation.data.total_samples} samples from {buildDatasetMutation.data.unique_tickers} tickers
                </p>
              </div>
            )}

            {trainModelsMutation.data && (
              <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-emerald-400 font-medium">Models Trained Successfully</p>
                <p className="text-slate-400 text-sm mt-1">
                  {trainModelsMutation.data.models?.length} models trained
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="panel-card">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Top 10 ML Picks</h2>
              <p className="text-slate-400 text-sm">
                AI-ranked stocks with highest probability of reaching target
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Horizon selector */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              {HORIZON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHorizon(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${horizon === opt.value
                      ? 'bg-violet-500 text-white'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={loadingPicks}
              className="btn btn-icon"
              title="Refresh picks"
            >
              <RefreshCw className={`w-4 h-4 ${loadingPicks ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Target info */}
        <div className="flex items-center gap-2 mb-6 text-sm text-slate-400 bg-slate-800/50 px-4 py-2 rounded-lg">
          <Target className="w-4 h-4 text-violet-400" />
          <span>
            Target: Reach <strong className="text-white">
              {HORIZON_OPTIONS.find(h => h.value === horizon)?.target}
            </strong> gain within <strong className="text-white">{horizon} days</strong> (7% stop loss)
          </span>
        </div>

        {/* Picks list */}
        {loadingPicks && localPicks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : localPicks.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-3" />
            <p>No ML picks available. Try refreshing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {localPicks.map((pick) => (
              <div
                key={pick.ticker}
                className={`bg-slate-800/50 rounded-xl border transition-all overflow-hidden ${expandedPick === pick.rank
                    ? 'border-violet-500/50'
                    : 'border-slate-700/50 hover:border-slate-600/50'
                  }`}
              >
                {/* Main row */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedPick(expandedPick === pick.rank ? null : pick.rank)}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank badge */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getRankColor(pick.rank)} flex items-center justify-center flex-shrink-0`}>
                      {getRankIcon(pick.rank)}
                    </div>

                    {/* Ticker info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                        {pick.ticker}
                        {pick.trend_template && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase">Trend Verified</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="bg-slate-700/50 px-2 py-0.5 rounded">{pick.sector || 'N/A'}</span>
                        <span className="bg-slate-700/50 px-2 py-0.5 rounded">{pick.cap || 'N/A'}</span>
                        <span>Stage {pick.stage}</span>
                        <span>Checklist {pick.checklist}/7</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-0.5">VCP Score</div>
                        <div className="font-semibold text-white">{pick.score.toFixed(1)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-0.5">RS (1Y)</div>
                        <div className={`font-semibold ${pick.rs_1y > 100 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {pick.rs_1y.toFixed(0)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-0.5">RSI</div>
                        <div className={`font-semibold ${pick.rsi > 70 ? 'text-red-400' : pick.rsi < 30 ? 'text-emerald-400' : 'text-slate-300'
                          }`}>
                          {pick.rsi.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* ML Probability */}
                    <div className={`px-4 py-2 rounded-xl border ${getProbabilityBg(pick.ml_probability)}`}>
                      <div className="text-xs text-slate-400 mb-0.5">ML Probability</div>
                      <div className={`font-bold text-lg ${getProbabilityColor(pick.ml_probability)}`}>
                        {(pick.ml_probability * 100).toFixed(1)}%
                      </div>
                    </div>

                    {/* Expand icon */}
                    {expandedPick === pick.rank ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedPick === pick.rank && (
                  <div className="px-4 pb-4 border-t border-slate-700/50 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Price info */}
                      <div className="bg-slate-900/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-2">Price Info</div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Last Price</span>
                            <div className="text-lg font-mono font-bold text-slate-200">
                              {getCurrency(pick.ticker)}{pick.last_price.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Price</span>
                            <span className="text-emerald-400 font-medium">
                              {getCurrency(pick.ticker)}{(pick.last_price * (1 + parseFloat(HORIZON_OPTIONS.find(h => h.value === horizon)?.target || '5') / 100)).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Stop Loss</span>
                            <span className="text-red-400 font-medium">
                              {getCurrency(pick.ticker)}{(pick.last_price * 0.93).toFixed(2)} (7%)
                            </span>
                          </div>
                          {pick.dist_low !== undefined && (
                            <div className="flex justify-between pt-1 border-t border-slate-700/30 mt-1">
                              <span className="text-slate-500 text-[10px]">Off 52w Low</span>
                              <span className="text-slate-400 text-[10px] font-medium">{pick.dist_low.toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Probabilities */}
                      <div className="bg-slate-900/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-2">All Horizons</div>
                        <div className="space-y-2">
                          {[2, 5, 10].map((h) => (
                            <div key={h} className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 w-12">{h}d:</span>
                              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${h === horizon ? 'bg-violet-500' : 'bg-slate-500'
                                    }`}
                                  style={{ width: `${(pick.avg_probability * 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${pick.avg_probability >= 0.5 ? 'text-emerald-400' : 'text-slate-400'
                                }`}>
                                {(pick.avg_probability * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top features */}
                      <div className="bg-slate-900/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-2">Top ML Features</div>
                        <div className="space-y-2">
                          {pick.top_features?.map((feat, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <span className="text-xs text-slate-400 capitalize">
                                {feat.name.replace(/_/g, ' ')}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full"
                                    style={{ width: `${feat.importance * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs text-white font-medium">
                                  {feat.value.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          )) || <span className="text-slate-500 text-xs">No feature data</span>}
                        </div>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-800/30 p-2 rounded-lg">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        ML predictions are based on historical patterns and technical features.
                        Past performance does not guarantee future results. Always do your own research.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
            <span>High probability (≥70%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30" />
            <span>Medium probability (50-70%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
            <span>Lower probability (&lt;50%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

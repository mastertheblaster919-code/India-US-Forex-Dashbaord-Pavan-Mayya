import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Brain, RefreshCw, Download, AlertCircle, Database, 
  TrendingUp, Activity, BarChart3, Search
} from 'lucide-react';
import { 
  fetchMLStatus, 
  buildMLDataset, 
  trainMLModels, 
  fetchMLPredictions
} from '../api';

// Sub-tab components
import WinnerDNASubTab from './WinnerDNASubTab';
import PatternMatcherSubTab from './PatternMatcherSubTab';
import MLRankedPicksSubTab from './MLRankedPicksSubTab';
import ModelHealthSubTab from './ModelHealthSubTab';

interface MLIntelligenceTabProps {
  results: any[];
  marketKey: string;
}

interface MLStatus {
  market_key: string;
  xgb_available: boolean;
  shap_available: boolean;
  cache_dates_available: number;
  has_training_data: boolean;
  has_models: boolean;
  training_data?: {
    total_samples: number;
    unique_tickers: number;
    date_range: string;
    winners: number;
    losers: number;
  };
  models?: {
    trained_models: number;
    horizons: number[];
  };
}

export default function MLIntelligenceTab({ results, marketKey }: MLIntelligenceTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'winner-dna' | 'pattern' | 'ranked' | 'health'>('winner-dna');
  const [predictions, setPredictions] = useState<any[]>([]);
  const queryClient = useQueryClient();

  // Fetch ML status
  const { data: mlStatus, isLoading: statusLoading } = useQuery<MLStatus>({
    queryKey: ['ml-status', marketKey],
    queryFn: () => fetchMLStatus(marketKey),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Build dataset mutation
  const buildDatasetMutation = useMutation({
    mutationFn: () => buildMLDataset(marketKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-status', marketKey] });
    },
  });

  // Train models mutation
  const trainModelsMutation = useMutation({
    mutationFn: () => trainMLModels(marketKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-status', marketKey] });
    },
  });

  // Fetch predictions when results change
  useEffect(() => {
    if (results.length > 0 && mlStatus?.has_models) {
      fetchMLPredictions(results, 5).then(data => {
        if (data.success) {
          setPredictions(data.predictions);
        }
      });
    }
  }, [results, mlStatus?.has_models]);

  // Determine status colors
  const getDatasetStatus = () => {
    if (!mlStatus?.has_training_data) {
      return { color: 'text-red-400', text: 'No training data — Click Rebuild Dataset' };
    }
    const samples = mlStatus.training_data?.total_samples || 0;
    if (samples >= 100) return { color: 'text-emerald-400', text: `${samples.toLocaleString()} samples` };
    if (samples >= 50) return { color: 'text-amber-400', text: `${samples} samples (minimum)` };
    return { color: 'text-red-400', text: `${samples} samples — Need more data` };
  };

  const getModelStatus = () => {
    if (!mlStatus?.xgb_available) {
      return { color: 'text-red-400', text: 'XGBoost not installed' };
    }
    if (!mlStatus?.has_models) {
      return { color: 'text-red-400', text: 'Not trained — Click Train Models' };
    }
    return { color: 'text-emerald-400', text: `${mlStatus.models?.trained_models || 0} models trained` };
  };

  const getCacheStatus = () => {
    const dates = mlStatus?.cache_dates_available || 0;
    if (dates === 0) return { color: 'text-red-400', text: 'No scan cache available' };
    return { color: 'text-emerald-400', text: `${dates} dates available` };
  };

  const datasetStatus = getDatasetStatus();
  const modelStatus = getModelStatus();
  const cacheStatus = getCacheStatus();

  const insufficientData = !mlStatus?.has_training_data || !mlStatus?.has_models || !mlStatus?.xgb_available;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Status Bar */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-purple-400" />
          <h2 className="text-sm font-bold text-white">ML Intelligence Status</h2>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-[#0a0e1a] rounded-lg p-3">
            <div className="text-[10px] uppercase text-[#6b7280] mb-1">Dataset</div>
            <div className={`text-sm font-semibold ${datasetStatus.color}`}>
              {statusLoading ? 'Loading...' : datasetStatus.text}
            </div>
          </div>
          <div className="bg-[#0a0e1a] rounded-lg p-3">
            <div className="text-[10px] uppercase text-[#6b7280] mb-1">Models</div>
            <div className={`text-sm font-semibold ${modelStatus.color}`}>
              {statusLoading ? 'Loading...' : modelStatus.text}
            </div>
          </div>
          <div className="bg-[#0a0e1a] rounded-lg p-3">
            <div className="text-[10px] uppercase text-[#6b7280] mb-1">Cache</div>
            <div className={`text-sm font-semibold ${cacheStatus.color}`}>
              {statusLoading ? 'Loading...' : cacheStatus.text}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => buildDatasetMutation.mutate()}
            disabled={buildDatasetMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {buildDatasetMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Rebuild Dataset
          </button>
          <button
            onClick={() => trainModelsMutation.mutate()}
            disabled={trainModelsMutation.isPending || !mlStatus?.has_training_data}
            className="flex items-center gap-2 px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {trainModelsMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Brain className="w-4 h-4" />
            )}
            Train XGBoost Models
          </button>
          {mlStatus?.has_training_data && (
            <button
              className="flex items-center gap-2 px-4 py-2 bg-[#374151] hover:bg-[#4b5563] text-white rounded-lg text-sm font-semibold transition-colors ml-auto"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      {insufficientData && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-amber-400 font-semibold text-sm">Setup Required</div>
            <p className="text-[#94a3b8] text-sm mt-1">
              The ML Intelligence system needs training data and models to make predictions.
              {!mlStatus?.has_training_data && ' Click "Rebuild Dataset" to collect historical data.'}
              {mlStatus?.has_training_data && !mlStatus?.has_models && ' Click "Train XGBoost Models" to train the prediction engines.'}
              {!mlStatus?.xgb_available && ' Install XGBoost: pip install xgboost'}
            </p>
          </div>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="border-b border-[#1f2937]">
        <div className="flex gap-1">
          {[
            { key: 'winner-dna', label: '🏆 Winner DNA', icon: Activity },
            { key: 'pattern', label: '🔍 Pattern Matcher', icon: Search },
            { key: 'ranked', label: '📊 ML Ranked Picks', icon: TrendingUp },
            { key: 'health', label: '🏥 Model Health', icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSubTab(key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeSubTab === key
                  ? 'text-white border-purple-500 bg-[#111827]'
                  : 'text-[#6b7280] border-transparent hover:text-[#94a3b8] hover:bg-[#0a0e1a]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeSubTab === 'winner-dna' && (
          <WinnerDNASubTab 
            marketKey={marketKey} 
            hasTrainingData={mlStatus?.has_training_data} 
            hasModels={mlStatus?.has_models}
          />
        )}
        {activeSubTab === 'pattern' && (
          <PatternMatcherSubTab 
            results={results}
            marketKey={marketKey}
            hasTrainingData={mlStatus?.has_training_data}
          />
        )}
        {activeSubTab === 'ranked' && (
          <MLRankedPicksSubTab 
            results={results}
            predictions={predictions}
            hasModels={mlStatus?.has_models}
          />
        )}
        {activeSubTab === 'health' && (
          <ModelHealthSubTab 
            marketKey={marketKey}
            hasTrainingData={mlStatus?.has_training_data}
            hasModels={mlStatus?.has_models}
          />
        )}
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Activity, Trophy, Brain } from 'lucide-react';
import { fetchMLStatus, fetchModelHealth } from '../api';

interface WinnerDNASubTabProps {
  marketKey: string;
  hasTrainingData?: boolean;
  hasModels?: boolean;
}

export default function WinnerDNASubTab({ marketKey, hasTrainingData, hasModels }: WinnerDNASubTabProps) {
  const { data: mlStatus } = useQuery({
    queryKey: ['ml-status', marketKey],
    queryFn: () => fetchMLStatus(marketKey),
    enabled: !!hasTrainingData,
  });

  const { data: healthData } = useQuery({
    queryKey: ['model-health', marketKey],
    queryFn: () => fetchModelHealth(marketKey),
    enabled: !!hasTrainingData && !!hasModels,
  });

  if (!hasTrainingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#94a3b8]">
        <Activity className="w-12 h-12 mb-4 opacity-30" />
        <p>Build training dataset to see Winner DNA analysis</p>
      </div>
    );
  }

  const td = mlStatus?.training_data;
  const winRate = td ? Math.round((td.winners / Math.max(td.total_samples, 1)) * 100) : null;

  // Get feature importance from the 5-day model
  const model5 = healthData?.models?.find((m: any) => m.horizon === 5);
  const featureImportance: [string, number][] = model5?.feature_importance
    ? Object.entries(model5.feature_importance as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
    : [];
  const maxImp = featureImportance[0]?.[1] ?? 1;

  // For each horizon model, compute win rate
  const modelMap: Record<number, any> = {};
  if (healthData?.models) {
    for (const m of healthData.models) modelMap[m.horizon] = m;
  }

  return (
    <div className="space-y-6">
      {/* Dataset Summary */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Dataset Summary</h3>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{td ? td.total_samples.toLocaleString() : '—'}</div>
            <div className="text-[10px] uppercase text-[#6b7280] mt-1">Total Samples</div>
          </div>
          <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{td ? td.winners.toLocaleString() : '—'}</div>
            <div className="text-[10px] uppercase text-[#6b7280] mt-1">Winners</div>
          </div>
          <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{td ? td.losers.toLocaleString() : '—'}</div>
            <div className="text-[10px] uppercase text-[#6b7280] mt-1">Losers</div>
          </div>
          <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-amber-400">{winRate != null ? `${winRate}%` : '—'}</div>
            <div className="text-[10px] uppercase text-[#6b7280] mt-1">Base Win Rate</div>
          </div>
        </div>
        {td?.date_range && (
          <div className="mt-3 text-xs text-[#6b7280] text-center font-mono">{td.date_range}</div>
        )}
      </div>

      {/* Model AUC Summary */}
      {hasModels && healthData?.models && healthData.models.length > 0 && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">XGBoost Model ROC-AUC</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[2, 5, 10].map((h) => {
              const m = modelMap[h];
              const auc = m?.auc;
              const aucPct = auc != null ? Math.round(auc * 100) : null;
              return (
                <div key={h} className="bg-[#0a0e1a] rounded-lg p-3 text-center">
                  <div className="text-xs text-[#6b7280] mb-1">{h}-Day</div>
                  <div className={`text-xl font-bold font-mono ${aucPct != null ? (aucPct >= 65 ? 'text-emerald-400' : aucPct >= 55 ? 'text-blue-400' : 'text-red-400') : 'text-[#6b7280]'}`}>
                    {auc != null ? auc.toFixed(3) : '—'}
                  </div>
                  {aucPct != null && (
                    <div className="mt-1 h-1 bg-[#1f2937] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${aucPct >= 65 ? 'bg-emerald-500' : aucPct >= 55 ? 'bg-blue-500' : 'bg-red-500'}`}
                        style={{ width: `${aucPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feature Importance */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-4">
          {featureImportance.length > 0 ? 'Top Feature Importance (5-Day Model)' : 'Feature Importance'}
        </h3>
        {featureImportance.length > 0 ? (
          <div className="space-y-2">
            {featureImportance.map(([feat, imp]) => (
              <div key={feat} className="flex items-center gap-3">
                <span className="text-xs text-[#94a3b8] w-44 truncate font-mono">{feat}</span>
                <div className="flex-1 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full"
                    style={{ width: `${(imp / maxImp) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-purple-400 w-12 text-right">
                  {(imp * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-[#6b7280]">
            Train models to see feature importance
          </div>
        )}
      </div>
    </div>
  );
}

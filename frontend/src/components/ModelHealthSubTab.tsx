import { useQuery } from '@tanstack/react-query';
import { BarChart3, Activity } from 'lucide-react';
import { fetchModelHealth } from '../api';

interface ModelHealthSubTabProps {
  marketKey: string;
  hasTrainingData?: boolean;
  hasModels?: boolean;
}

function AucBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 65 ? '#4ade80' : pct >= 55 ? '#60a5fa' : '#f87171';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ModelHealthSubTab({ marketKey, hasTrainingData, hasModels }: ModelHealthSubTabProps) {
  const { data: healthData, isLoading } = useQuery({
    queryKey: ['model-health', marketKey],
    queryFn: () => fetchModelHealth(marketKey),
    enabled: !!hasTrainingData && !!hasModels,
  });

  if (!hasTrainingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#94a3b8]">
        <Activity className="w-12 h-12 mb-4 opacity-30" />
        <p>Build training dataset to see model health metrics</p>
      </div>
    );
  }

  // Build a map: horizon → model metrics from API
  const modelMap: Record<number, any> = {};
  if (healthData?.models) {
    for (const m of healthData.models) {
      modelMap[m.horizon] = m;
    }
  }

  return (
    <div className="space-y-6">
      {/* Model Performance Metrics */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white">Model Performance Metrics</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[2, 5, 10].map((horizon) => {
            const m = modelMap[horizon];
            const isLoaded = !!m;
            const auc = isLoaded ? m.auc : null;
            const aucPct = auc != null ? Math.round(auc * 100) : null;
            const winRate = isLoaded ? Math.round((m.n_winners / Math.max(m.n_train, 1)) * 100) : null;
            const edge = aucPct != null ? (aucPct - 50) : null;
            return (
              <div key={horizon} className="bg-[#0a0e1a] rounded-lg p-4">
                <div className="text-xs text-[#6b7280] uppercase mb-2">{horizon}-Day Model</div>
                {isLoading ? (
                  <div className="text-sm text-[#6b7280] animate-pulse">Loading...</div>
                ) : isLoaded ? (
                  <>
                    <div className={`text-2xl font-bold ${aucPct! >= 65 ? 'text-emerald-400' : aucPct! >= 55 ? 'text-blue-400' : 'text-red-400'}`}>
                      {auc!.toFixed(3)}
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-0.5">ROC-AUC</div>
                    <AucBar value={auc!} />
                    <div className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between text-[#6b7280]">
                        <span>Samples:</span>
                        <span className="text-white font-mono">{m.n_train.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[#6b7280]">
                        <span>Winners:</span>
                        <span className="text-emerald-400 font-mono">{m.n_winners} ({winRate}%)</span>
                      </div>
                      <div className="flex justify-between text-[#6b7280]">
                        <span>Edge:</span>
                        <span className={`font-mono ${edge! > 0 ? 'text-emerald-400' : 'text-red-400'}`}>+{edge}%</span>
                      </div>
                      <div className="flex justify-between text-[#6b7280]">
                        <span>AUC ±:</span>
                        <span className="text-white font-mono">{m.auc_std?.toFixed(3) ?? '—'}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[#6b7280]">Not trained</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature Importance */}
      {hasModels && healthData?.models && healthData.models.length > 0 && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Top Feature Importance (5-Day Model)</h3>
          </div>
          <div className="space-y-2">
            {(() => {
              const m5 = modelMap[5];
              if (!m5?.feature_importance) return <p className="text-[#6b7280] text-sm">No feature data</p>;
              const sorted = Object.entries(m5.feature_importance as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);
              const maxVal = sorted[0]?.[1] ?? 1;
              return sorted.map(([feat, imp]) => (
                <div key={feat} className="flex items-center gap-3">
                  <span className="text-xs text-[#94a3b8] w-40 truncate font-mono">{feat}</span>
                  <div className="flex-1 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(imp / maxVal) * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono text-purple-400 w-12 text-right">{(imp * 100).toFixed(1)}%</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Confusion Matrices */}
      {hasModels && healthData?.confusion_matrices && Object.keys(healthData.confusion_matrices).length > 0 && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-bold text-white">Confusion Matrices (In-Sample)</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[2, 5, 10].map((h) => {
              const cm = healthData.confusion_matrices[h];
              if (!cm) return <div key={h} className="bg-[#0a0e1a] rounded-lg p-3 text-[#6b7280] text-sm text-center">No data for {h}d</div>;
              const [[tn, fp], [fn, tp]] = cm;
              const total = tn + fp + fn + tp;
              const acc = total > 0 ? Math.round(((tn + tp) / total) * 100) : 0;
              return (
                <div key={h} className="bg-[#0a0e1a] rounded-lg p-3">
                  <div className="text-xs text-[#6b7280] uppercase mb-2">{h}d — Acc: {acc}%</div>
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                    <div className="bg-emerald-900/30 text-emerald-400 rounded p-1 text-center">TN: {tn}</div>
                    <div className="bg-red-900/30 text-red-400 rounded p-1 text-center">FP: {fp}</div>
                    <div className="bg-amber-900/30 text-amber-400 rounded p-1 text-center">FN: {fn}</div>
                    <div className="bg-blue-900/30 text-blue-400 rounded p-1 text-center">TP: {tp}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

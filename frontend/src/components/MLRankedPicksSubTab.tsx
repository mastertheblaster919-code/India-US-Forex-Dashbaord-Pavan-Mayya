import { useState, useMemo } from 'react';
import { TrendingUp, Target, Filter } from 'lucide-react';

interface MLRankedPicksSubTabProps {
  results: any[];
  predictions: any[];
  hasModels?: boolean;
}

export default function MLRankedPicksSubTab({ results, predictions, hasModels }: MLRankedPicksSubTabProps) {
  const [horizon, setHorizon] = useState<number>(5);
  const [minProb, setMinProb] = useState<number>(50);
  const [stage2Only, setStage2Only] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('probability');

  if (!hasModels) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#94a3b8]">
        <TrendingUp className="w-12 h-12 mb-4 opacity-30" />
        <p>Train ML models to see ranked picks</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#94a3b8]">
        <Target className="w-12 h-12 mb-4 opacity-30" />
        <p>Run a scan first to get predictions</p>
      </div>
    );
  }

  // Build a lookup map from ticker → prediction
  const predMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of predictions) {
      m[p.ticker] = p;
    }
    return m;
  }, [predictions]);

  // Merge results with predictions and apply filters
  const enriched = useMemo(() => {
    let rows = results.map((r) => {
      const pred = predMap[r.ticker];
      const prob = pred?.probabilities?.[horizon] ?? null;
      const vcpScore = r.score ?? 0;
      const combinedScore = prob !== null ? (prob * 100 * 0.6 + vcpScore * 0.4) : vcpScore;
      return { ...r, prob, combinedScore };
    });

    if (stage2Only) rows = rows.filter((r) => r.stage === 2);
    if (minProb > 0) rows = rows.filter((r) => r.prob === null || (r.prob * 100) >= minProb);

    rows.sort((a, b) => {
      if (sortBy === 'probability') return (b.prob ?? 0) - (a.prob ?? 0);
      if (sortBy === 'vcp-score') return (b.score ?? 0) - (a.score ?? 0);
      return b.combinedScore - a.combinedScore;
    });

    return rows;
  }, [results, predMap, horizon, minProb, stage2Only, sortBy]);

  const hasPredictions = predictions.length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white">Filters</h3>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] uppercase text-[#6b7280] mb-1 block">Horizon</label>
            <div className="flex gap-2">
              {[2, 5, 10].map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                    horizon === h
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                      : 'bg-[#0a0e1a] text-[#6b7280] border border-transparent'
                  }`}
                >
                  {h}d
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase text-[#6b7280] mb-1 block">
              Min Probability: {minProb}%
            </label>
            <input
              type="range" min={0} max={100} value={minProb}
              onChange={(e) => setMinProb(Number(e.target.value))}
              className="w-full h-2 bg-[#1f2937] rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-[#6b7280] mb-1 block">Stage Filter</label>
            <label className="flex items-center gap-2 text-sm text-[#94a3b8] cursor-pointer">
              <input
                type="checkbox" checked={stage2Only}
                onChange={(e) => setStage2Only(e.target.checked)}
                className="rounded border-[#1f2937] bg-[#0a0e1a]"
              />
              Stage 2 Only
            </label>
          </div>
          <div>
            <label className="text-[10px] uppercase text-[#6b7280] mb-1 block">Sort By</label>
            <select
              value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
            >
              <option value="probability">Win Probability</option>
              <option value="vcp-score">VCP Score</option>
              <option value="combined">Combined Score</option>
            </select>
          </div>
        </div>
      </div>

      {!hasPredictions && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3 text-amber-400 text-sm">
          No ML predictions yet — predictions load automatically after models are trained and a scan is run.
          Showing VCP scan results ranked by score.
        </div>
      )}

      {/* Stock Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {enriched.slice(0, 9).map((result) => {
          const pred = predMap[result.ticker];
          return (
            <div key={result.ticker} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 hover:border-purple-500/50 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-lg font-bold text-white font-mono">{result.ticker}</div>
                  <div className="text-xs text-[#6b7280]">{result.sector || result.name || '—'}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${
                  result.stage === 1 ? 'bg-emerald-900/40 text-emerald-400' :
                  result.stage === 2 ? 'bg-blue-900/40 text-blue-400' :
                  result.stage === 3 ? 'bg-amber-900/40 text-amber-400' :
                  'bg-red-900/40 text-red-400'
                }`}>S{result.stage}</span>
              </div>

              {/* Probability Bars */}
              <div className="space-y-2 mb-3">
                {[2, 5, 10].map((h) => {
                  const p = pred?.probabilities?.[h];
                  const pct = p != null ? Math.round(p * 100) : null;
                  const barWidth = pct ?? 0;
                  return (
                    <div key={h} className="flex items-center gap-2">
                      <span className="text-xs text-[#6b7280] w-8">{h}d</span>
                      <div className="flex-1 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct !== null ? (pct >= 60 ? 'bg-emerald-500' : pct >= 50 ? 'bg-purple-500' : 'bg-red-500') : 'bg-[#374151]'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-10 text-right ${pct !== null ? (pct >= 60 ? 'text-emerald-400' : pct >= 50 ? 'text-purple-400' : 'text-red-400') : 'text-[#6b7280]'}`}>
                        {pct !== null ? `${pct}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Metrics */}
              <div className="flex gap-3 text-xs">
                <span className="text-[#94a3b8]">Score: <span className="text-white font-mono">{result.score?.toFixed(0) ?? '—'}</span></span>
                <span className="text-[#94a3b8]">RSI: <span className="text-white font-mono">{result.rsi?.toFixed(0) ?? '—'}</span></span>
                <span className="text-[#94a3b8]">Vol: <span className="text-white font-mono">{(result.vol_ratio ?? result.vol_r)?.toFixed(1) ?? '—'}×</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {enriched.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-[#6b7280]">
          <Target className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No results match current filters.</p>
        </div>
      )}
    </div>
  );
}

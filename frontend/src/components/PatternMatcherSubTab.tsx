import { useState } from 'react';
import { Search, GitCompare } from 'lucide-react';

interface PatternMatcherSubTabProps {
  results: any[];
  marketKey: string;
  hasTrainingData?: boolean;
}

export default function PatternMatcherSubTab({ results, marketKey: _marketKey, hasTrainingData }: PatternMatcherSubTabProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>('');

  if (!hasTrainingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#94a3b8]">
        <GitCompare className="w-12 h-12 mb-4 opacity-30" />
        <p>Build training dataset to use Pattern Matcher</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[0.4fr_0.6fr] gap-4 h-full">
      {/* Left Column - Ticker Selection */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white">Select Ticker</h3>
        </div>
        
        {results.length > 0 ? (
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Choose a ticker...</option>
            {results.map((r) => (
              <option key={r.ticker} value={r.ticker}>
                {r.ticker} - Score: {r.score?.toFixed(1)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[#6b7280] text-sm">No scan results available</p>
        )}

        {selectedTicker && (
          <div className="mt-4 p-3 bg-[#0a0e1a] rounded-lg">
            <div className="text-sm font-semibold text-white mb-2">Current Features</div>
            <div className="text-[#94a3b8] text-xs">
              Feature values will appear here...
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Similar Setups */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-4">5 Most Similar Historical Setups</h3>
        
        {!selectedTicker ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#6b7280]">
            <GitCompare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Select a ticker to find similar setups</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-[#0a0e1a] rounded-lg p-3 text-[#6b7280] text-sm">
              Similar setups will appear here after pattern matching...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

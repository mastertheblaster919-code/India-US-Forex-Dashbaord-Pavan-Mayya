import { useState } from 'react';
import { Send, Bot, User, Loader2, MessageSquare } from 'lucide-react';
import { aiChat } from '../api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "Which VCP stocks should I buy today for intraday?",
  "Analyze the current market breadth for NSE",
  "What are the best momentum stocks in Nifty 50?",
  "Suggest FOREX pairs for swing trading",
  "Which S&P 500 stocks are in Stage 2 uptrend?",
  "Compare HDFC Bank vs ICICI Bank for VCP setup",
];

export default function AIChatTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "👋 Hi! I'm your AI trading assistant powered by NVIDIA Llama. Ask me about:\n\n• VCP stock analysis\n• Market breadth & trends\n• Trading strategies\n• Stock comparisons\n• Risk assessment\n• FOREX signals",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const result = await aiChat(input.trim());
      const assistantMessage: Message = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message || 'Failed to get response. Please check your API key.'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggested = (question: string) => {
    setInput(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      <div className="p-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">AI Trading Assistant</h2>
          <span className="text-xs text-slate-500 bg-[#1e1e2e] px-2 py-0.5 rounded">NVIDIA Llama</span>
        </div>
        <p className="text-sm text-slate-400 mt-1">Ask about VCP patterns, stock analysis, trading strategies</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div className={`max-w-[80%] rounded-lg p-3 ${
              msg.role === 'user'
                ? 'bg-blue-600/20 text-blue-100 mr-2'
                : 'bg-[#1e1e2e] text-slate-200'
            }`}>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#1e1e2e] rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
            {error}
          </div>
        )}

        {messages.length === 1 && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">Try these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggested(q)}
                  className="text-xs bg-[#1e1e2e] hover:bg-[#2a2a3e] text-slate-300 px-3 py-1.5 rounded-full border border-[#2a2a3e] transition-colors"
                >
                  <MessageSquare className="w-3 h-3 inline mr-1" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[#1e1e2e]">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about stocks, trading, VCP patterns..."
            className="flex-1 bg-[#1e1e2e] text-white text-sm rounded-lg px-4 py-2 border border-[#2a2a3e] focus:border-purple-500 focus:outline-none resize-none"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Powered by NVIDIA Llama 70B • Responses are for educational purposes only
        </p>
      </div>
    </div>
  );
}

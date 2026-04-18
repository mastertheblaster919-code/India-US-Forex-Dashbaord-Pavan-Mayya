import { useEffect, useRef, useState } from 'react';

interface TradingViewChartProps {
    symbol?: string;
    interval?: string;
    theme?: 'light' | 'dark';
}

const DEFAULT_SYMBOL = 'NSE:RELIANCE-EQ';

const INTERVALS = [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1h', value: '60' },
    { label: '4h', value: '240' },
    { label: '1D', value: 'D' },
    { label: '1W', value: 'W' },
    { label: '1M', value: 'M' },
];

export default function TradingViewChart({ 
    symbol = DEFAULT_SYMBOL, 
    interval = '60',
    theme = 'dark' 
}: TradingViewChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentSymbol, setCurrentSymbol] = useState(symbol);
    const [currentInterval, setCurrentInterval] = useState(interval);
    const [showSymbolSearch, setShowSymbolSearch] = useState(false);
    const [symbolInput, setSymbolInput] = useState('');

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous widget
        containerRef.current.innerHTML = '';

        // Create TradingView widget
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": currentSymbol,
            "interval": currentInterval,
            "timezone": "Asia/Kolkata",
            "theme": theme,
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "calendar": false,
            "support_host": "https://www.tradingview.com",
            "hide_top_toolbar": false,
            "hide_legend": false,
            "allow_symbol_change": true,
            "save_image": true,
            "toolbar_bg": theme === 'dark' ? '#0a0e1a' : '#ffffff',
            "studies": [
                "STD;SMA",
                "STD;RSI"
            ],
            "show_popup_button": true,
            "popup_width": "1000",
            "popup_height": "650",
            "backgroundColor": theme === 'dark' ? 'rgba(10, 14, 26, 1)' : 'rgba(255, 255, 255, 1)',
        });

        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container';
        widgetContainer.style.height = '100%';
        widgetContainer.style.width = '100%';

        const widgetInner = document.createElement('div');
        widgetInner.className = 'tradingview-widget-container__widget';
        widgetInner.style.height = '100%';
        widgetInner.style.width = '100%';

        widgetContainer.appendChild(widgetInner);
        widgetContainer.appendChild(script);
        containerRef.current.appendChild(widgetContainer);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [currentSymbol, currentInterval, theme]);

    const handleSymbolChange = (newSymbol: string) => {
        const formatted = newSymbol.toUpperCase().includes('NSE:') 
            ? newSymbol.toUpperCase() 
            : `NSE:${newSymbol.toUpperCase()}-EQ`;
        setCurrentSymbol(formatted);
        setShowSymbolSearch(false);
        setSymbolInput('');
    };

    const displaySymbol = currentSymbol.replace('NSE:', '').replace('-EQ', '');

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-2 bg-panel/60 border-b border-border/40">
                {/* Symbol Search */}
                <div className="relative">
                    <button
                        onClick={() => setShowSymbolSearch(!showSymbolSearch)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a28] border border-border/40 rounded-lg text-sm text-white hover:border-primary/40"
                    >
                        <span className="font-semibold">{displaySymbol}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    
                    {showSymbolSearch && (
                        <div className="absolute top-full left-0 mt-1 z-[100]">
                            <div className="fixed inset-0" onClick={() => setShowSymbolSearch(false)} />
                            <div className="relative bg-[#12121c] border border-border/40 rounded-lg shadow-2xl w-64 p-2">
                                <input
                                    type="text"
                                    placeholder="Enter symbol (e.g., RELIANCE)"
                                    value={symbolInput}
                                    onChange={e => setSymbolInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSymbolChange(symbolInput)}
                                    autoFocus
                                    className="w-full bg-[#1a1a28] border border-border/30 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50"
                                />
                                <button
                                    onClick={() => handleSymbolChange(symbolInput)}
                                    className="w-full mt-2 bg-primary text-white rounded px-3 py-2 text-sm font-medium hover:bg-primary/90"
                                >
                                    Load Chart
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-border/50" />

                {/* Timeframe selector */}
                <div className="flex items-center gap-1">
                    {INTERVALS.map(int => (
                        <button
                            key={int.value}
                            onClick={() => setCurrentInterval(int.value)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                currentInterval === int.value
                                    ? 'bg-primary text-white'
                                    : 'bg-[#1a1a28] text-slate-400 hover:text-white hover:bg-[#2a2a3a]'
                            }`}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-border/50" />

                {/* Fullscreen button */}
                <button
                    onClick={() => {
                        if (containerRef.current) {
                            if (containerRef.current.requestFullscreen) {
                                containerRef.current.requestFullscreen();
                            }
                        }
                    }}
                    className="p-1.5 bg-[#1a1a28] border border-border/40 rounded text-slate-400 hover:text-white"
                    title="Fullscreen"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>

            {/* TradingView Widget */}
            <div ref={containerRef} className="flex-1 min-h-0" />
        </div>
    );
}

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface TradingViewFullProps {
    selectedTicker?: string;
    tickers?: string[];
    onSelectTicker?: (t: string) => void;
}

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

export default function TradingViewFull({ 
    selectedTicker, 
    tickers = [] 
}: TradingViewFullProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const watchlistRef = useRef<HTMLDivElement>(null);
    const detailsRef = useRef<HTMLDivElement>(null);
    const [currentSymbol, setCurrentSymbol] = useState(
        selectedTicker ? `NSE:${selectedTicker.replace('-EQ', '')}` : 'NSE:RELIANCE'
    );
    const [currentInterval, setCurrentInterval] = useState('60');
    const [showSymbolSearch, setShowSymbolSearch] = useState(false);
    const [symbolInput, setSymbolInput] = useState('');
    const [leftPanelVisible, setLeftPanelVisible] = useState(true);
    const [rightPanelVisible, setRightPanelVisible] = useState(true);

    const openInTradingView = () => {
        const symbol = selectedTicker ? `NSE:${selectedTicker.replace('-EQ', '')}` : 'NSE:RELIANCE';
        window.open(`https://www.tradingview.com/chart/?symbol=${symbol}&interval=${currentInterval}`, '_blank');
    };

    // Update symbol when selectedTicker changes from parent (TradingView uses NSE:SYMBOL without -EQ)
    useEffect(() => {
        if (selectedTicker) {
            const newSymbol = `NSE:${selectedTicker.replace('-EQ', '')}`;
            if (newSymbol !== currentSymbol) {
                setCurrentSymbol(newSymbol);
            }
        }
    }, [selectedTicker]);

    // Load TradingView widget
    useEffect(() => {
        if (!chartRef.current) return;
        chartRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": currentSymbol,
            "interval": currentInterval,
            "timezone": "Asia/Kolkata",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "calendar": false,
            "support_host": "https://www.tradingview.com",
            "hide_top_toolbar": false,
            "hide_legend": false,
            "allow_symbol_change": true,
            "save_image": true,
            "toolbar_bg": "#0a0e1a",
            "studies": ["STD;SMA", "STD;RSI"],
            "show_popup_button": true,
            "popup_width": "1000",
            "popup_height": "650",
            "backgroundColor": "rgba(10, 14, 26, 1)",
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
        chartRef.current.appendChild(widgetContainer);

        return () => { if (chartRef.current) chartRef.current.innerHTML = ''; };
    }, [currentSymbol, currentInterval]);

    // Load Watchlist widget
    useEffect(() => {
        if (!watchlistRef.current || !leftPanelVisible) return;
        
        // Clear and rebuild
        watchlistRef.current.innerHTML = '';
        
        // Get top tickers from scanner results or use default list
        const watchlistTickers = tickers.length > 0 ? tickers.slice(0, 25) : [
            'RELIANCE-EQ', 'TCS-EQ', 'INFY-EQ', 'HDFCBANK-EQ', 'ICICIBANK-EQ',
            'SBIN-EQ', 'BHARTIARTL-EQ', 'ITC-EQ', 'LT-EQ', 'HINDUNILVR-EQ',
            'AXISBANK-EQ', 'KOTAKBANK-EQ', 'BAJFINANCE-EQ', 'MARUTI-EQ', 'SUNPHARMA-EQ'
        ];

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "width": "100%",
            "height": "100%",
            "symbolsGroups": [
                {
                    "name": "NSE - My Watchlist",
                    "symbols": watchlistTickers.map(t => ({
                        "name": `NSE:${t.replace('-EQ', '')}`,
                        "displayName": t.replace('-EQ', '')
                    }))
                }
            ],
            "showSymbolLogo": true,
            "colorTheme": "dark",
            "isTransparent": false,
            "locale": "en",
            "largeMode": false
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
        watchlistRef.current.appendChild(widgetContainer);

        return () => { if (watchlistRef.current) watchlistRef.current.innerHTML = ''; };
    }, [tickers, leftPanelVisible]);

    // Load Symbol Info widget
    useEffect(() => {
        if (!detailsRef.current || !rightPanelVisible) return;
        detailsRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "symbol": currentSymbol,
            "width": "100%",
            "height": "100%",
            "colorTheme": "dark",
            "isTransparent": false,
            "locale": "en"
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
        detailsRef.current.appendChild(widgetContainer);

        return () => { if (detailsRef.current) detailsRef.current.innerHTML = ''; };
    }, [currentSymbol, rightPanelVisible]);

    const handleSymbolChange = (newSymbol: string) => {
        // TradingView uses NSE:SYMBOL format without -EQ
        const formatted = newSymbol.toUpperCase().includes('NSE:') 
            ? newSymbol.toUpperCase() 
            : `NSE:${newSymbol.toUpperCase()}`;
        setCurrentSymbol(formatted);
        setShowSymbolSearch(false);
        setSymbolInput('');
    };

    const displaySymbol = currentSymbol.replace('NSE:', '').replace('-EQ', '');

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-2 bg-[#0a0e1a] border-b border-[#1e1e32]">
                {/* Toggle Panels */}
                <button
                    onClick={() => setLeftPanelVisible(!leftPanelVisible)}
                    className={`p-1.5 rounded ${leftPanelVisible ? 'bg-primary text-white' : 'bg-[#1a1a28] text-slate-400'}`}
                    title="Toggle Watchlist"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                </button>

                {/* Symbol Search */}
                <div className="relative">
                    <button
                        onClick={() => setShowSymbolSearch(!showSymbolSearch)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a28] border border-[#1e1e32] rounded text-sm text-white hover:border-primary/40"
                    >
                        <span className="font-semibold">{displaySymbol}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    
                    {showSymbolSearch && (
                        <div className="absolute top-full left-0 mt-1 z-[100]">
                            <div className="fixed inset-0" onClick={() => setShowSymbolSearch(false)} />
                            <div className="relative bg-[#12121c] border border-[#1e1e32] rounded-lg shadow-2xl w-64 p-2">
                                <input
                                    type="text"
                                    placeholder="Enter symbol (e.g., RELIANCE)"
                                    value={symbolInput}
                                    onChange={e => setSymbolInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSymbolChange(symbolInput)}
                                    autoFocus
                                    className="w-full bg-[#1a1a28] border border-[#1e1e32] rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50"
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

                <div className="h-6 w-px bg-[#1e1e32]" />

                {/* Timeframe selector */}
                <div className="flex items-center gap-1">
                    {INTERVALS.map(int => (
                        <button
                            key={int.value}
                            onClick={() => setCurrentInterval(int.value)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                currentInterval === int.value
                                    ? 'bg-primary text-white'
                                    : 'bg-[#1a1a28] text-slate-400 hover:text-white'
                            }`}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-[#1e1e32]" />

                {/* Toggle Details Panel */}
                <button
                    onClick={() => setRightPanelVisible(!rightPanelVisible)}
                    className={`p-1.5 rounded ${rightPanelVisible ? 'bg-primary text-white' : 'bg-[#1a1a28] text-slate-400'}`}
                    title="Toggle Details"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>

                {/* Open in TradingView (Premium) */}
                <button
                    onClick={openInTradingView}
                    className="flex items-center gap-1 px-2 py-1.5 bg-[#1a1a28] border border-[#1e1e32] rounded text-slate-400 hover:text-primary hover:border-primary/40"
                    title="Open in TradingView (Premium features)"
                >
                    <ExternalLink size={14} />
                    <span className="text-xs">Open TV</span>
                </button>

                {/* Fullscreen */}
                <button
                    onClick={() => {
                        const container = document.getElementById('tv-full-container');
                        if (container?.requestFullscreen) container.requestFullscreen();
                    }}
                    className="p-1.5 bg-[#1a1a28] border border-[#1e1e32] rounded text-slate-400 hover:text-white"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>

            {/* Main Content - TradingView Layout */}
            <div id="tv-full-container" className="flex-1 flex min-h-0">
                {/* Left Panel - Watchlist */}
                {leftPanelVisible && (
                    <div className="w-64 border-r border-[#1e1e32] flex-shrink-0">
                        <div ref={watchlistRef} className="h-full" />
                    </div>
                )}

                {/* Center - Chart */}
                <div className="flex-1 min-w-0">
                    <div ref={chartRef} className="h-full" />
                </div>

                {/* Right Panel - Details */}
                {rightPanelVisible && (
                    <div className="w-72 border-l border-[#1e1e32] flex-shrink-0">
                        <div ref={detailsRef} className="h-full" />
                    </div>
                )}
            </div>
        </div>
    );
}

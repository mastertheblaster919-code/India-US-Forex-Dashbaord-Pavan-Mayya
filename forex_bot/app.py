"""
FOREX Bot Web Interface
Simple Flask frontend for the Global Swing Command Center
"""
import os
import sys
import json
from flask import Flask, render_template_string, jsonify, request
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from scanner_v2 import get_signals_above_threshold, scan_all
from portfolio_v2 import Portfolio
from journal_v2 import TradeJournal
from config_full import CONFIG

app = Flask(__name__)

# Add CORS headers for all routes
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.route('/api/scan', methods=['OPTIONS'])
@app.route('/api/status', methods=['OPTIONS'])
@app.route('/api/journal', methods=['OPTIONS'])
def options_handler(*args, **kwargs):
    return '', 200

# HTML Template
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FOREX Bot - Global Swing Command Center</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #e2e8f0; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .card { background: linear-gradient(145deg, #12121a 0%, #0d0d12 100%); border: 1px solid #1e1e2e; }
        .btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4); }
        .btn-scan { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .btn-scan:hover { box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); }
        .btn-status { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        .btn-journal { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
        .btn-scheduler { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .gradient-text { background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status-positive { color: #10b981; }
        .status-negative { color: #ef4444; }
        .signal-long { border-left: 3px solid #10b981; }
        .signal-short { border-left: 3px solid #ef4444; }
    </style>
</head>
<body class="min-h-screen">
    <!-- Header -->
    <header class="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </div>
                    <div>
                        <h1 class="text-xl font-bold gradient-text">FOREX Bot</h1>
                        <p class="text-xs text-gray-500">Global Swing Command Center v2</p>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/50">
                        <span class="w-2 h-2 rounded-full bg-green-500 pulse"></span>
                        <span class="text-xs text-gray-400">2H Timeframe</span>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-gray-500">Instruments</p>
                        <p class="text-lg font-bold mono">{{ symbols_count }}</p>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-6">
        <!-- Action Buttons -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <button onclick="runScan()" class="btn-scan p-4 rounded-xl text-white font-semibold flex flex-col items-center gap-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <span>Run Scanner</span>
            </button>
            <button onclick="showStatus()" class="btn-status p-4 rounded-xl text-white font-semibold flex flex-col items-center gap-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <span>Portfolio Status</span>
            </button>
            <button onclick="showJournal()" class="btn-journal p-4 rounded-xl text-white font-semibold flex flex-col items-center gap-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                <span>Trade Journal</span>
            </button>
            <button onclick="toggleScheduler()" class="btn-scheduler p-4 rounded-xl text-white font-semibold flex flex-col items-center gap-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Auto-Scheduler</span>
            </button>
        </div>

        <!-- Config Summary -->
        <div class="card rounded-xl p-4 mb-6">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-sm font-semibold text-gray-400">Configuration</h3>
                    <p class="text-xs text-gray-500 mt-1">Min Score: {{ config.min_score }}% | SL: {{ config.sl_atr }}×ATR | R:R {{ config.rr }}:1</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-500">Scan Interval</p>
                    <p class="font-bold mono">{{ config.scan_interval_hours }} hours</p>
                </div>
            </div>
        </div>

        <!-- Results Section -->
        <div id="results" class="space-y-4">
            <!-- Scanner Results -->
            <div id="scanner-results" class="hidden">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-bold">Scanner Results</h2>
                    <span id="signal-count" class="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-sm"></span>
                </div>
                <div id="signals-list" class="space-y-2"></div>
            </div>

            <!-- Portfolio Status -->
            <div id="portfolio-results" class="hidden">
                <h2 class="text-lg font-bold mb-4">Portfolio Status</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div class="card rounded-xl p-4">
                        <p class="text-xs text-gray-500">Balance</p>
                        <p id="balance" class="text-2xl font-bold mono"></p>
                    </div>
                    <div class="card rounded-xl p-4">
                        <p class="text-xs text-gray-500">Return</p>
                        <p id="return-pct" class="text-2xl font-bold mono"></p>
                    </div>
                    <div class="card rounded-xl p-4">
                        <p class="text-xs text-gray-500">Win Rate</p>
                        <p id="win-rate" class="text-2xl font-bold mono"></p>
                    </div>
                    <div class="card rounded-xl p-4">
                        <p class="text-xs text-gray-500">Open Positions</p>
                        <p id="open-pos" class="text-2xl font-bold mono"></p>
                    </div>
                </div>
                <div id="positions-list" class="space-y-2"></div>
            </div>

            <!-- Journal -->
            <div id="journal-results" class="hidden">
                <h2 class="text-lg font-bold mb-4">Trade Journal</h2>
                <div class="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Total Trades</p>
                        <p id="journal-total" class="text-xl font-bold mono"></p>
                    </div>
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Win Rate</p>
                        <p id="journal-win-rate" class="text-xl font-bold mono"></p>
                    </div>
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Avg Win</p>
                        <p id="journal-avg-win" class="text-xl font-bold mono status-positive"></p>
                    </div>
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Avg Loss</p>
                        <p id="journal-avg-loss" class="text-xl font-bold mono status-negative"></p>
                    </div>
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Best Trade</p>
                        <p id="journal-best" class="text-xl font-bold mono status-positive"></p>
                    </div>
                    <div class="card rounded-xl p-3">
                        <p class="text-xs text-gray-500">Total P&L</p>
                        <p id="journal-pnl" class="text-xl font-bold mono"></p>
                    </div>
                </div>
                <div id="journal-list" class="space-y-2"></div>
            </div>

            <!-- Scheduler -->
            <div id="scheduler-results" class="hidden">
                <h2 class="text-lg font-bold mb-4">Auto-Scheduler</h2>
                <div class="card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="font-semibold">Scheduler Status</p>
                            <p class="text-sm text-gray-500">Runs every {{ config.scan_interval_hours }} hours</p>
                        </div>
                        <span id="scheduler-status" class="px-3 py-1 rounded-full bg-green-500/20 text-green-400">Running</span>
                    </div>
                    <p class="text-sm text-gray-400">To start the auto-scheduler, run:</p>
                    <div class="mt-2 p-3 bg-gray-800 rounded-lg mono text-sm">
                        python forex_bot/scheduler_v2.py
                    </div>
                </div>
            </div>
        </div>

        <!-- Loading -->
        <div id="loading" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="card rounded-xl p-8 flex flex-col items-center gap-4">
                <div class="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-gray-400">Processing...</p>
            </div>
        </div>
    </main>

    <script>
        function showLoading() { document.getElementById('loading').classList.remove('hidden'); }
        function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
        
        function hideAll() {
            document.getElementById('scanner-results').classList.add('hidden');
            document.getElementById('portfolio-results').classList.add('hidden');
            document.getElementById('journal-results').classList.add('hidden');
            document.getElementById('scheduler-results').classList.add('hidden');
        }

        async function runScan() {
            showLoading();
            hideAll();
            try {
                const response = await fetch('/api/scan');
                const data = await response.json();
                
                document.getElementById('scanner-results').classList.remove('hidden');
                document.getElementById('signal-count').textContent = data.signals.length + ' signals';
                
                const list = document.getElementById('signals-list');
                if (data.signals.length === 0) {
                    list.innerHTML = '<p class="text-gray-500">No signals above threshold</p>';
                } else {
                    list.innerHTML = data.signals.map(s => `
                        <div class="card rounded-lg p-3 signal-${s.direction.toLowerCase()}">
                            <div class="flex items-center justify-between">
                                <div>
                                    <span class="font-semibold">${s.name}</span>
                                    <span class="text-xs text-gray-500 ml-2">${s.type}</span>
                                </div>
                                <div class="text-right">
                                    <span class="text-lg font-bold mono ${s.direction === 'LONG' ? 'status-positive' : 'status-negative'}">${s.direction}</span>
                                    <span class="text-xs text-gray-500 ml-2">Score: ${s.score}%</span>
                                </div>
                            </div>
                            <div class="mt-2 flex gap-4 text-xs text-gray-500">
                                <span>Price: ${s.price.toFixed(4)}</span>
                                <span>SL: ${s.sl.toFixed(4)}</span>
                                <span>TP: ${s.tp.toFixed(4)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            } catch(e) { alert('Error: ' + e); }
            hideLoading();
        }

        async function showStatus() {
            showLoading();
            hideAll();
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                document.getElementById('portfolio-results').classList.remove('hidden');
                document.getElementById('balance').textContent = '$' + data.stats.balance.toLocaleString();
                document.getElementById('return-pct').textContent = data.stats.total_return_pct + '%';
                document.getElementById('return-pct').className = 'text-2xl font-bold mono ' + (data.stats.total_return_pct >= 0 ? 'status-positive' : 'status-negative');
                document.getElementById('win-rate').textContent = data.stats.win_rate + '%';
                document.getElementById('open-pos').textContent = data.stats.open_positions;
                
                const list = document.getElementById('positions-list');
                if (data.positions.length === 0) {
                    list.innerHTML = '<p class="text-gray-500">No open positions</p>';
                } else {
                    list.innerHTML = data.positions.map(p => `
                        <div class="card rounded-lg p-3">
                            <div class="flex items-center justify-between">
                                <span class="font-semibold">${p.symbol}</span>
                                <span class="${p.dir === 'LONG' ? 'status-positive' : 'status-negative'}">${p.dir}</span>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                Entry: ${p.entry_price.toFixed(4)} | SL: ${p.sl.toFixed(4)} | TP: ${p.tp.toFixed(4)}
                            </div>
                        </div>
                    `).join('');
                }
            } catch(e) { alert('Error: ' + e); }
            hideLoading();
        }

        async function showJournal() {
            showLoading();
            hideAll();
            try {
                const response = await fetch('/api/journal');
                const data = await response.json();
                
                document.getElementById('journal-results').classList.remove('hidden');
                document.getElementById('journal-total').textContent = data.stats.total_trades;
                document.getElementById('journal-win-rate').textContent = data.stats.win_rate + '%';
                document.getElementById('journal-avg-win').textContent = (data.stats.avg_win || 0) + '%';
                document.getElementById('journal-avg-loss').textContent = (data.stats.avg_loss || 0) + '%';
                document.getElementById('journal-best').textContent = (data.stats.best_trade || 0) + '%';
                document.getElementById('journal-pnl').textContent = (data.stats.total_pnl || 0) + '%';
                document.getElementById('journal-pnl').className = 'text-xl font-bold mono ' + ((data.stats.total_pnl || 0) >= 0 ? 'status-positive' : 'status-negative');
                
                const list = document.getElementById('journal-list');
                if (data.entries.length === 0) {
                    list.innerHTML = '<p class="text-gray-500">No trades yet</p>';
                } else {
                    list.innerHTML = data.entries.slice(0, 10).map(e => `
                        <div class="card rounded-lg p-3">
                            <div class="flex items-center justify-between">
                                <span class="font-semibold">${e.symbol}</span>
                                <span class="${parseFloat(e.pnl_pct || 0) >= 0 ? 'status-positive' : 'status-negative'}">${e.pnl_pct || 0}%</span>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                ${e.date} | ${e.direction} | Score: ${e.score}
                            </div>
                        </div>
                    `).join('');
                }
            } catch(e) { alert('Error: ' + e); }
            hideLoading();
        }

        function toggleScheduler() {
            hideAll();
            document.getElementById('scheduler-results').classList.remove('hidden');
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE, 
        symbols_count=len(CONFIG['symbols']),
        config=CONFIG['settings'])

@app.route('/api/scan')
def api_scan():
    try:
        min_score = CONFIG['settings']['min_score']
        signals, _ = get_signals_above_threshold(min_score)
        return jsonify({'signals': signals})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/status')
def api_status():
    try:
        port = Portfolio()
        return jsonify({
            'stats': port.get_stats(),
            'positions': port.get_positions()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/journal')
def api_journal():
    try:
        journal = TradeJournal()
        return jsonify({
            'stats': journal.get_stats(),
            'entries': journal.get_entries(20)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("="*60)
    print("FOREX Bot Web Interface")
    print("Open http://localhost:5001 in your browser")
    print("="*60)
    app.run(host='0.0.0.0', port=5001, debug=True)

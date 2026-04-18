"""
India Market Bot Web Interface
VCP-based trading for NSE stocks
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify

from scanner import get_vcp_signals
from portfolio import Portfolio
from journal import TradeJournal
from config import CONFIG

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

@app.route('/api/scan')
def api_scan():
    try:
        min_score = CONFIG["settings"]["min_score"]
        signals = get_vcp_signals(min_score)
        return jsonify({"signals": signals, "count": len(signals)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/status')
def api_status():
    try:
        port = Portfolio()
        return jsonify({"stats": port.get_stats(), "positions": port.get_positions()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/journal')
def api_journal():
    try:
        journal = TradeJournal()
        return jsonify({"entries": journal.get_entries(20), "stats": journal.get_stats()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print(f"India Bot running on port 5003 - {len(CONFIG['symbols'])} stocks")
    app.run(host='0.0.0.0', port=5003, debug=True)

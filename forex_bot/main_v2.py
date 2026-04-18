"""
FOREX Trading Bot - Main Entry Point
Global Swing Command Center v2 - 2H Timeframe
"""
import sys
import argparse
from datetime import datetime

from scanner_v2 import get_signals_above_threshold, scan_all, log_signal
from portfolio_v2 import Portfolio
from journal_v2 import TradeJournal
from config_full import CONFIG


def run_scan():
    """Run scanner and process signals"""
    print(f"\n{'='*60}")
    print(f"FOREX SCANNER - 2H TIMEFRAME - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")
    
    min_score = CONFIG["settings"]["min_score"]
    signals, current_prices = get_signals_above_threshold(min_score)
    
    print(f"\nSignals above {min_score}% threshold: {len(signals)}")
    
    # Show all signals
    for s in signals:
        dir_emoji = "LONG" if s["direction"] == "LONG" else "SHORT"
        print(f"  {s['name']:12} | {s['type']:3} | {dir_emoji:5} | Score: {s['score']:5.0f} | Price: {s['price']:.4f}")
    
    # Update portfolio
    port = Portfolio()
    closed = port.update_positions(current_prices)
    
    if closed:
        print(f"\nClosed positions:")
        for pos, reason in closed:
            print(f"  {pos['symbol']}: {reason} | PnL: {pos.get('pnl_pct', 0):.2f}%")
    
    # Open new positions
    opened = 0
    for sig in signals:
        if port.open_position(
            sig["symbol"],
            sig["direction"],
            sig["price"],
            sig["sl"],
            sig["tp"],
            sig["score"]
        ):
            log_signal(
                sig["symbol"], sig["name"], sig["direction"],
                sig["price"], sig["sl"], sig["tp"], sig["score"],
                {"rsi": sig["rsi"], "adx": sig["adx"]}
            )
            opened += 1
    
    if opened:
        print(f"\nOpened {opened} new position(s)")
    
    # Show portfolio status
    stats = port.get_stats()
    print(f"\n{'='*60}")
    print("PORTFOLIO STATUS")
    print(f"{'='*60}")
    print(f"Balance:      ${stats['balance']:,.2f}")
    print(f"Return:       {stats['total_return_pct']:+.2f}%")
    print(f"Open Pos:     {stats['open_positions']}")
    print(f"Total Trades: {stats['total_trades']}")
    print(f"Win Rate:     {stats['win_rate']:.1f}%")
    print(f"W/L:          {stats['winning_trades']}W / {stats['losing_trades']}L")
    
    # Show open positions
    positions = port.get_positions()
    if positions:
        print(f"\nOpen Positions:")
        for p in positions:
            print(f"  {p['symbol']:12} | {p['dir']:5} | Entry: {p['entry_price']:.4f} | SL: {p['sl']:.4f} | TP: {p['tp']:.4f}")


def show_status():
    """Show current portfolio status"""
    port = Portfolio()
    stats = port.get_stats()
    positions = port.get_positions()
    history = port.get_history(10)
    
    print(f"\n{'='*60}")
    print("FOREX BOT STATUS - 2H TIMEFRAME")
    print(f"{'='*60}")
    print(f"Balance:      ${stats['balance']:,.2f}")
    print(f"Return:       {stats['total_return_pct']:+.2f}%")
    print(f"Win Rate:     {stats['win_rate']:.1f}%")
    print(f"Total Trades: {stats['total_trades']}")
    
    if positions:
        print(f"\nOpen Positions ({len(positions)}):")
        for p in positions:
            print(f"  {p['symbol']:12} | {p['dir']:5} | Entry: {p['entry_price']:.4f}")
    
    if history:
        print(f"\nRecent Trades:")
        for h in reversed(history):
            print(f"  {h['symbol']:12} | {h['dir']:5} | {h['outcome']:2} | PnL: {h.get('pnl_pct', 0):+.2f}%")


def show_journal():
    """Show trade journal"""
    journal = TradeJournal()
    stats = journal.get_stats()
    entries = journal.get_entries(20)
    
    print(f"\n{'='*60}")
    print("TRADE JOURNAL")
    print(f"{'='*60}")
    
    if stats:
        print(f"Total Trades: {stats['total_trades']}")
        print(f"Win Rate:     {stats['win_rate']:.1f}%")
        print(f"Avg Win:      {stats['avg_win']:+.2f}%")
        print(f"Avg Loss:     {stats['avg_loss']:.2f}%")
        print(f"Total PnL:    {stats['total_pnl']:+.2f}%")
        print(f"Best Trade:   {stats['best_trade']:+.2f}%")
        print(f"Worst Trade:  {stats['worst_trade']:.2f}%")
    
    if entries:
        print(f"\nRecent Entries:")
        for e in reversed(entries[-10:]):
            print(f"  {e['symbol']:12} | {e['direction']:5} | {e.get('outcome', 'OPEN'):4} | PnL: {e.get('pnl_pct', 0):+.2f}%")


def show_config():
    """Show bot configuration"""
    print(f"\n{'='*60}")
    print("FOREX BOT CONFIG - Global Swing Command Center v2")
    print(f"{'='*60}")
    print(f"Timeframe:    {CONFIG['settings']['timeframe']}")
    print(f"Min Score:    {CONFIG['settings']['min_score']}%")
    print(f"SL (ATR):     {CONFIG['settings']['sl_atr']}")
    print(f"Risk:Reward:  {CONFIG['settings']['rr']}:1")
    print(f"Scan Interval: {CONFIG['settings']['scan_interval_hours']} hours")
    print(f"\nInstruments:  {len(CONFIG['symbols'])}")
    
    # Count by type
    types = {}
    for s in CONFIG["symbols"].values():
        t = s["type"]
        types[t] = types.get(t, 0) + 1
    
    print("\nBy Type:")
    for t, c in types.items():
        print(f"  {t}: {c}")


def main():
    parser = argparse.ArgumentParser(description="FOREX Trading Bot - 2H Timeframe")
    parser.add_argument("command", choices=["scan", "status", "journal", "config", "help"], 
                        help="Command to run")
    
    args = parser.parse_args()
    
    if args.command == "scan":
        run_scan()
    elif args.command == "status":
        show_status()
    elif args.command == "journal":
        show_journal()
    elif args.command == "config":
        show_config()
    else:
        print("""
FOREX Trading Bot Commands (2H Timeframe):
  python main_v2.py scan    - Run scanner and process signals
  python main_v2.py status  - Show portfolio status
  python main_v2.py journal - Show trade journal
  python main_v2.py config  - Show bot configuration
        """)


if __name__ == "__main__":
    main()

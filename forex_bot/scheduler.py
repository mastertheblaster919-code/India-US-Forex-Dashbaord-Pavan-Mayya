"""
FOREX Bot Scheduler
Auto-runs scanner and portfolio updates
"""
import schedule
import time
import logging
from datetime import datetime
from scanner import get_signals_above_threshold, log_signal
from portfolio import Portfolio
from config import CONFIG

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def run_scan():
    """Run scanner and process signals"""
    logger.info("=" * 50)
    logger.info(f"Starting scheduled scan at {datetime.now()}")
    
    try:
        # Get signals above threshold
        min_score = CONFIG["settings"]["min_score"]
        signals, current_prices = get_signals_above_threshold(min_score)
        
        logger.info(f"Found {len(signals)} signals above {min_score}% threshold")
        
        # Update portfolio (check for exits)
        port = Portfolio()
        closed = port.update_positions(current_prices)
        
        for pos, reason in closed:
            logger.info(f"  CLOSED: {pos['symbol']} | {reason} | PnL: {pos.get('pnl_pct', 0):.2f}%")
        
        # Open new positions
        for sig in signals:
            if port.open_position(
                sig["symbol"],
                sig["direction"],
                sig["price"],
                sig["sl"],
                sig["tp"],
                sig["score"]
            ):
                logger.info(f"  OPENED: {sig['name']} | {sig['direction']} | Score: {sig['score']:.0f}")
                log_signal(
                    sig["symbol"], sig["name"], sig["direction"],
                    sig["price"], sig["sl"], sig["tp"], sig["score"],
                    {"rsi": sig["rsi"], "adx": sig["adx"]}
                )
        
        # Print portfolio stats
        stats = port.get_stats()
        logger.info(f"Portfolio: Balance ${stats['balance']:.2f} | Return: {stats['total_return_pct']:.2f}%")
        logger.info(f"Stats: {stats['winning_trades']}W/{stats['losing_trades']}L | Win Rate: {stats['win_rate']:.1f}%")
        
    except Exception as e:
        logger.error(f"Error in scan: {e}")
    
    logger.info("=" * 50)


def run_portfolio_check():
    """Quick portfolio check for exits"""
    logger.info("Checking for position exits...")
    
    try:
        from scanner import scan_all
        _, current_prices = scan_all()
        
        port = Portfolio()
        closed = port.update_positions(current_prices)
        
        for pos, reason in closed:
            logger.info(f"  EXIT: {pos['symbol']} | {reason}")
        
        if closed:
            stats = port.get_stats()
            logger.info(f"  Balance: ${stats['balance']:.2f}")
            
    except Exception as e:
        logger.error(f"Error in portfolio check: {e}")


def start_scheduler():
    """Start the scheduler"""
    interval = CONFIG["settings"]["scan_interval_hours"]
    
    logger.info(f"Starting FOREX Bot Scheduler")
    logger.info(f"Scan interval: every {interval} hours")
    
    # Run immediately on start
    run_scan()
    
    # Schedule regular scans
    schedule.every(interval).hours.do(run_scan)
    
    # Check for exits every hour
    schedule.every(1).hours.do(run_portfolio_check)
    
    logger.info("Scheduler started. Press Ctrl+C to stop.")
    
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    start_scheduler()

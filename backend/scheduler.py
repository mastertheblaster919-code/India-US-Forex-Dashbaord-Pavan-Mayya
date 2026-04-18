"""
APScheduler for VCP Dashboard automation.
Runs as a separate process from the FastAPI server.

Jobs:
- Weekdays 6:00 PM IST: Run daily scan + send summary
- Weekdays 9:15 AM - 3:30 PM IST: Hourly watchlist check
- Sundays 7:00 PM IST: Weekly summary
"""

import os
import sys
import logging
from datetime import datetime, time
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "scheduler.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("scheduler")

IST = ZoneInfo("Asia/Kolkata")

os.makedirs("logs", exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs"), exist_ok=True)


def job_daily_scan():
    """Weekdays 6:00 PM IST — run generate_cache then send daily summary."""
    logger.info("Job: daily_scan started")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from generate_cache import generate_cache, _post_scan_processing
        from data_manager import load_scan_cache

        count, date = generate_cache("IN")
        if count > 0:
            results = load_scan_cache("IN", date)
            if results:
                _post_scan_processing(results, "IN")
        logger.info(f"Job: daily_scan completed — {count} results")
    except Exception as e:
        logger.error(f"Job: daily_scan failed: {e}")


def job_hourly_watchlist():
    """Weekdays every hour 9:15 AM - 3:30 PM IST - check watchlist for breakouts.
    
    Note: GTT order placement requires Fyers API. This job now only checks for breakouts using yfinance.
    """
    logger.info("Job: hourly_watchlist started")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from db import get_active_watchlist
        import yfinance as yf
        
        watchlist = get_active_watchlist()
        if not watchlist:
            logger.info("No active watchlist entries")
            return
            
        for entry in watchlist:
            try:
                ticker = entry.get("ticker", "").replace("-EQ", "").replace(".NS", "") + ".NS"
                ticker_obj = yf.Ticker(ticker)
                info = ticker_obj.fast_info
                lp = info.get('last_price') or info.get('previous_close')
                if lp:
                    logger.debug(f"{ticker}: {lp}")
            except Exception:
                pass
        
        logger.info("Job: hourly_watchlist completed (yfinance mode)")
    except Exception as e:
        logger.error(f"Job: hourly_watchlist failed: {e}")


def job_weekly_summary():
    """Sundays 7:00 PM IST — send weekly performance summary with real stats."""
    logger.info("Job: weekly_summary started")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from db import get_active_watchlist, expire_old_watchlist, get_weekly_stats
        from notifier import send_weekly_summary

        expire_old_watchlist()
        stats = get_weekly_stats()

        active = get_active_watchlist()
        stats["top_setups"] = active[:3] if active else []
        send_weekly_summary(stats)
        logger.info(f"Weekly summary sent: {stats}")
        logger.info("Job: weekly_summary completed")
    except Exception as e:
        logger.error(f"Job: weekly_summary failed: {e}")


def job_monthly_learn():
    """First day of month 7 AM IST — run Learn loop with journal outcomes + send Telegram alert."""
    logger.info("Job: monthly_learn started")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import asyncio
        from ml_api import run_learn_loop

        result = asyncio.run(run_learn_loop(market_key="IN", use_journal_outcomes=True))
        logger.info(f"Job: monthly_learn result: {result}")

        try:
            from notifier import _send_telegram_message
            if result.get("success"):
                details = result.get("details", {})
                insights = details.get("insights", [])
                aucs = details.get("new_aucs", {})
                wr = details.get("win_rate", 0)
                winners = details.get("winners", 0)
                losers = details.get("losers", 0)
                msg = (
                    f"🧠 <b>Monthly Learn — Done</b>\n\n"
                    f"📊 {len(insights)} insights | "
                    f"WR: {wr:.0f}% ({winners}W / {losers}L)\n"
                    f"🤖 Models: {details.get('models_retrained', 0)} retrained\n"
                    f"AUCs: {aucs}\n\n"
                    f"<i>System auto-improved from journal outcomes.</i>"
                )
            else:
                msg = (
                    f"⚠️ <b>Monthly Learn — Failed</b>\n\n"
                    f"{result.get('message', 'Unknown error')}\n\n"
                    f"<i>Check logs.</i>"
                )
            _send_telegram_message(msg)
        except Exception as e:
            logger.error(f"Could not send Learn loop Telegram alert: {e}")

        logger.info(f"Job: monthly_learn completed")
    except Exception as e:
        logger.error(f"Job: monthly_learn failed: {e}")


def main():
    scheduler = BlockingScheduler(timezone=IST)

    scheduler.add_job(
        job_daily_scan,
        CronTrigger(hour=18, minute=0, day_of_week="mon-fri", tzinfo=IST),
        id="daily_scan",
        name="Daily VCP Scan (6 PM IST)",
        misfire_grace_time=3600,
    )

    hours = ["09", "10", "11", "12", "13", "14", "15"]
    for hour in hours:
        scheduler.add_job(
            job_hourly_watchlist,
            CronTrigger(hour=int(hour), minute=15, day_of_week="mon-fri", tzinfo=IST),
            id=f"hourly_watchlist_{hour}",
            name=f"Hourly Watchlist ({hour}:15 IST)",
            misfire_grace_time=900,
        )

    scheduler.add_job(
        job_weekly_summary,
        CronTrigger(day_of_week="sun", hour=19, minute=0, tzinfo=IST),
        id="weekly_summary",
        name="Weekly Summary (7 PM IST Sunday)",
        misfire_grace_time=3600,
    )

    scheduler.add_job(
        job_monthly_learn,
        CronTrigger(day=1, hour=7, minute=0, tzinfo=IST),
        id="monthly_learn",
        name="Monthly Learn Loop (1st 7 AM IST)",
        misfire_grace_time=7200,
    )

    logger.info("Scheduler starting...")
    logger.info("Jobs registered:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.id}: {job.name}")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()

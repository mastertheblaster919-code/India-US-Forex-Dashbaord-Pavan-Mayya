import sqlite3
import os
import logging
from ohlcv_store import bulk_download, download_ticker

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

db_path = r'd:\Production\vcp_dashboard_india\backend\data\vcp.db'
if not os.path.exists(db_path):
    log.error(f"Database not found at {db_path}")
    exit()

def get_incomplete_tickers():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Find tickers with less than 400 rows (less than ~2 years)
    cursor.execute("SELECT ticker, COUNT(*) as count FROM ohlcv GROUP BY ticker HAVING count < 400")
    rows = cursor.fetchall()
    
    # Also find tickers that are completely missing from the ohlcv table but exist in watchlist or other sources
    # For now, let's just focus on what's already in the ohlcv table but incomplete
    tickers = [row[0] for row in rows]
    
    # Check if there are tickers in watchlist that are not in ohlcv at all
    cursor.execute("SELECT DISTINCT ticker FROM watchlist WHERE ticker NOT IN (SELECT DISTINCT ticker FROM ohlcv)")
    missing_rows = cursor.fetchall()
    tickers.extend([row[0] for row in missing_rows])
    
    conn.close()
    return list(set(tickers))

def main():
    log.info("Starting full sync for incomplete tickers...")
    tickers_to_sync = get_incomplete_tickers()
    total = len(tickers_to_sync)
    
    if total == 0:
        log.info("All tickers are already fully synced!")
        return

    log.info(f"Found {total} tickers that need a full sync.")
    
    # We use bulk_download with force=True to ensure we get the full 2 years
    # for these specific incomplete tickers.
    summary = bulk_download(
        market="IN",
        tickers=tickers_to_sync,
        workers=20,
        force=True,
        incremental=False
    )
    
    log.info(f"Full sync completed: {summary['done']} successful, {summary['failed']} failed.")

if __name__ == "__main__":
    main()

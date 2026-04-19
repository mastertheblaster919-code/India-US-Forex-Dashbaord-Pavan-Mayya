"""
Database connection module for SQLite.
Provides connection and helper functions for database operations.
"""

import os
import sqlite3
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

_db_path: Optional[str] = None


def get_db_config() -> Dict[str, str]:
    """Get database configuration from config.json."""
    from config_loader import get_config
    cfg = get_config()
    db_cfg = cfg.get('database', {})
    
    db_type = db_cfg.get('type', 'sqlite')
    if db_type != 'sqlite':
        raise ValueError(f"SQLite not configured. Found: {db_type}")
    
    return {
        'path': db_cfg.get('path', 'backend/data/vcp.db'),
    }


def init_db_pool():
    """Initialize database connection."""
    global _db_path
    
    if _db_path is not None:
        return
    
    try:
        config = get_db_config()
        db_path = config['path']
        
        # Make path absolute if relative
        if not os.path.isabs(db_path):
            db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), db_path)
        
        _db_path = db_path
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(_db_path), exist_ok=True)
        
        logger.info(f"SQLite database initialized: {_db_path}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


def get_db_path() -> str:
    """Get the database path, initializing if needed."""
    global _db_path
    
    if _db_path is None:
        init_db_pool()
    
    return _db_path


@contextmanager
def get_connection():
    """Get a database connection."""
    conn = None
    try:
        conn = sqlite3.connect(get_db_path(), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            conn.close()


@contextmanager
def get_cursor():
    """Get a cursor from the connection."""
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()


def execute_query(query: str, params: tuple = None) -> List[Dict[str, Any]]:
    """Execute a SELECT query and return results as list of dicts."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return results


def execute_update(query: str, params: tuple = None) -> int:
    """Execute an INSERT/UPDATE/DELETE query and return row count."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        return cursor.rowcount


def execute_insert_returning(query: str, params: tuple = None) -> Dict[str, Any]:
    """Execute INSERT with RETURNING clause (SQLite uses lastrowid)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params or ())
        row_id = cursor.lastrowid
        return {'lastrowid': row_id} if row_id else {}


def bulk_insert(query: str, data: List[tuple]) -> int:
    """Execute bulk INSERT with conflict handling for UNIQUE constraints."""
    if not data:
        return 0
    with get_connection() as conn:
        cursor = conn.cursor()
        if query.strip().upper().startswith("INSERT"):
            if "OR IGNORE" not in query.upper():
                query = query.replace("INSERT", "INSERT OR IGNORE", 1)
        cursor.executemany(query, data)
        return len(data)


def init_tables():
    """Initialize database tables if they don't exist."""
    with get_cursor() as cursor:
        # OHLCV data table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ohlcv (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                datetime TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ticker, datetime)
            )
        """)
        
        # Create index for faster queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_date 
            ON ohlcv(ticker, datetime DESC)
        """)
        
        # Scan results cache table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scan_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                market TEXT NOT NULL,
                scan_date TEXT NOT NULL,
                ticker TEXT NOT NULL,
                vcp_score REAL,
                stage INTEGER,
                tight_rank INTEGER,
                dist52 REAL,
                rs_rating REAL,
                sector TEXT,
                market_cap TEXT,
                data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(market, scan_date, ticker)
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_scan_results_date 
            ON scan_results(market, scan_date DESC)
        """)
        
        # Positions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                entry_price REAL NOT NULL,
                stop_loss REAL,
                target REAL,
                quantity INTEGER NOT NULL,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Intraday signals table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intraday_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                scan_time TEXT NOT NULL,
                intraday_score REAL,
                entry_signal INTEGER,
                entry_type TEXT,
                signals TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_intraday_signals_time
            ON intraday_signals(scan_time DESC)
        """)

        # Watchlist table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL UNIQUE,
                pivot_price REAL,
                stop_price REAL,
                target_price REAL,
                score REAL,
                ml_prob REAL,
                rs_rank REAL,
                signals_fired TEXT,
                added_date DATE NOT NULL,
                expire_date DATE NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Alert log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alert_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                message TEXT,
                fired_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_alert_log_time
            ON alert_log(fired_at DESC)
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trade_journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                entry_date DATE NOT NULL,
                entry_price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                stop_loss REAL,
                target REAL,
                trade_type TEXT DEFAULT 'long',
                status TEXT DEFAULT 'open',
                exited_date DATE,
                exit_price REAL,
                pnl_realized REAL,
                pnl_pct REAL,
                signal_type TEXT,
                score_at_entry REAL,
                ml_prob_at_entry REAL,
                rs_rank_at_entry REAL,
                watchlist_entry_id INTEGER,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trade_journal_ticker
            ON trade_journal(ticker)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trade_journal_status
            ON trade_journal(status)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trade_journal_entry_date
            ON trade_journal(entry_date DESC)
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trade_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                scan_date DATE NOT NULL,
                horizon INTEGER NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL,
                exit_date DATE,
                label INTEGER,
                pnl_pct REAL,
                holding_days INTEGER,
                signal_type TEXT,
                vcp_score REAL,
                tight_rank INTEGER,
                stage_at_entry INTEGER,
                rs_rank_6m REAL,
                ml_prob REAL,
                strategy TEXT DEFAULT 'vcp',
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trade_outcomes_ticker
            ON trade_outcomes(ticker)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trade_outcomes_scan_date
            ON trade_outcomes(scan_date DESC)
        """)

        logger.info("SQLite database tables initialized")


# ─── Watchlist CRUD Functions ─────────────────────────────────────────────────

def insert_watchlist(row: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a new watchlist entry. Returns the inserted row id."""
    import json
    import datetime
    from dateutil.relativedelta import relativedelta

    ticker = row.get('ticker')
    pivot_price = row.get('pivot_price')
    stop_price = row.get('stop_price')
    target_price = row.get('target_price')
    score = row.get('score')
    ml_prob = row.get('ml_prob')
    rs_rank = row.get('rs_rank')
    signals_fired = row.get('signals_fired', {})
    added_date = datetime.date.today().isoformat()
    expire_date = (datetime.datetime.now() + relativedelta(days=10)).date().isoformat()

    signals_json = json.dumps(signals_fired) if isinstance(signals_fired, dict) else signals_fired

    query = """
        INSERT INTO watchlist
        (ticker, pivot_price, stop_price, target_price, score, ml_prob, rs_rank, signals_fired, added_date, expire_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    """
    params = (ticker, pivot_price, stop_price, target_price, score, ml_prob, rs_rank, signals_json, added_date, expire_date)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return {'lastrowid': cursor.lastrowid, 'ticker': ticker}


def get_watchlist_entry(ticker: str) -> Optional[Dict[str, Any]]:
    """Get a watchlist entry by ticker."""
    query = "SELECT * FROM watchlist WHERE ticker = ? AND status = 'active'"
    results = execute_query(query, (ticker,))
    return results[0] if results else None


def add_to_trade_journal(fill_data: Dict[str, Any], watchlist_entry: Dict[str, Any] = None):
    """Add a filled order to the trade journal."""
    ticker = fill_data["ticker"].replace("NSE:", "")
    entry_price = fill_data["price"]
    qty = fill_data["qty"]
    
    sl = watchlist_entry.get("stop_price") if watchlist_entry else 0
    tgt = watchlist_entry.get("target_price") if watchlist_entry else 0
    score = watchlist_entry.get("score") if watchlist_entry else 0
    
    query = """
        INSERT INTO trade_journal (
            ticker, entry_date, entry_price, quantity, stop_loss, target, 
            status, score_at_entry, watchlist_entry_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    """
    params = (
        ticker,
        datetime.now().strftime('%Y-%m-%d'),
        entry_price,
        qty,
        sl,
        tgt,
        score,
        watchlist_entry.get("id") if watchlist_entry else None
    )
    execute_update(query, params)


def get_active_watchlist() -> List[Dict[str, Any]]:
    """Get all active watchlist entries."""
    import json
    query = """
        SELECT ticker, pivot_price, stop_price, target_price, score, ml_prob, rs_rank,
               signals_fired, added_date, expire_date, status
        FROM watchlist
        WHERE status = 'active'
        ORDER BY score DESC
    """
    results = execute_query(query)
    for r in results:
        if r.get('signals_fired'):
            try:
                r['signals_fired'] = json.loads(r['signals_fired'])
            except Exception:
                pass
    return results


def get_weekly_stats() -> Dict[str, Any]:
    """Compute weekly performance stats from trade_journal for the past 7 days."""
    query = """
        SELECT ticker, entry_date, exit_date, exit_price, entry_price,
               quantity, trade_type, pnl_pct, pnl_realized, status
        FROM trade_journal
        WHERE entry_date >= date('now', '-7 days')
        ORDER BY entry_date DESC
    """
    trades = execute_query(query)
    if not trades:
        return {
            "alerts_sent": 0, "triggered": 0, "avg_return": 0.0,
            "best_performer": {}, "worst_performer": {},
            "top_setups": [],
            "total_closed": 0, "total_open": 0, "week_win_rate": 0.0,
        }

    closed = [t for t in trades if t.get("status") == "closed"]
    open_ = [t for t in trades if t.get("status") == "open"]

    pnls = [t.get("pnl_pct", 0) for t in closed if t.get("pnl_pct") is not None]
    winners = [p for p in pnls if p > 0]
    avg_return = round(sum(pnls) / len(pnls), 2) if pnls else 0.0

    best = max(closed, key=lambda t: t.get("pnl_pct", 0)) if closed else {}
    worst = min(closed, key=lambda t: t.get("pnl_pct", 0)) if closed else {}

    return {
        "alerts_sent": len(trades),
        "triggered": len(closed),
        "avg_return": avg_return,
        "best_performer": best,
        "worst_performer": worst,
        "top_setups": [],
        "total_closed": len(closed),
        "total_open": len(open_),
        "week_win_rate": round(len(winners) / len(pnls) * 100, 1) if pnls else 0.0,
    }


def update_watchlist_status(ticker: str, status: str) -> int:
    """Update the status of a watchlist entry. Returns row count."""
    query = "UPDATE watchlist SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticker = ?"
    return execute_update(query, (status, ticker))


def expire_old_watchlist() -> int:
    """Set status='expired' for entries where expire_date < today. Returns row count."""
    import datetime
    today = datetime.date.today().isoformat()
    query = "UPDATE watchlist SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE expire_date < ? AND status = 'active'"
    return execute_update(query, (today,))


def get_watchlist_by_ticker(ticker: str) -> Dict[str, Any]:
    """Get a single watchlist entry by ticker."""
    import json
    query = "SELECT * FROM watchlist WHERE ticker = ?"
    results = execute_query(query, (ticker,))
    if results:
        r = results[0]
        if r.get('signals_fired'):
            try:
                r['signals_fired'] = json.loads(r['signals_fired'])
            except Exception:
                pass
        return r
    return None


def delete_watchlist(ticker: str) -> int:
    """Delete a watchlist entry. Returns row count."""
    query = "DELETE FROM watchlist WHERE ticker = ?"
    return execute_update(query, (ticker,))


# ─── Alert Log Functions ───────────────────────────────────────────────────────

def insert_alert_log(ticker: str, alert_type: str, message: str = "") -> Dict[str, Any]:
    """Insert a new alert log entry. Returns the inserted row id."""
    query = "INSERT INTO alert_log (ticker, alert_type, message) VALUES (?, ?, ?)"
    params = (ticker, alert_type, message)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return {'lastrowid': cursor.lastrowid, 'ticker': ticker}


def get_alert_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Get recent alert history. Returns last `limit` alerts."""
    query = """
        SELECT ticker, alert_type, message, fired_at
        FROM alert_log
        ORDER BY fired_at DESC
        LIMIT ?
    """
    return execute_query(query, (limit,))


def get_alerts_by_ticker(ticker: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get alerts for a specific ticker."""
    query = """
        SELECT ticker, alert_type, message, fired_at
        FROM alert_log
        WHERE ticker = ?
        ORDER BY fired_at DESC
        LIMIT ?
    """
    return execute_query(query, (ticker, limit))


def insert_journal_trade(row: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a new journal trade entry. Returns the inserted row id."""
    query = """
        INSERT INTO trade_journal
        (ticker, entry_date, entry_price, quantity, stop_loss, target, trade_type,
         status, signal_type, score_at_entry, ml_prob_at_entry, rs_rank_at_entry,
         watchlist_entry_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
    """
    params = (
        row.get("ticker"),
        row.get("entry_date"),
        row.get("entry_price"),
        row.get("quantity", 0),
        row.get("stop_loss"),
        row.get("target"),
        row.get("trade_type", "long"),
        row.get("signal_type"),
        row.get("score_at_entry"),
        row.get("ml_prob_at_entry"),
        row.get("rs_rank_at_entry"),
        row.get("watchlist_entry_id"),
        row.get("notes"),
    )
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return {"lastrowid": cursor.lastrowid, "ticker": row.get("ticker")}


def get_open_trades() -> List[Dict[str, Any]]:
    """Get all open trades."""
    query = "SELECT * FROM trade_journal WHERE status = 'open' ORDER BY entry_date DESC"
    return execute_query(query)


def get_all_trades(limit: int = 100) -> List[Dict[str, Any]]:
    """Get all trades (open + closed), most recent first."""
    query = "SELECT * FROM trade_journal ORDER BY entry_date DESC LIMIT ?"
    return execute_query(query, (limit,))


def close_trade(ticker: str, exit_price: float, exit_date: str, pnl_realized: float,
                 pnl_pct: float, notes: str = "") -> int:
    """Close an open trade. Returns row count."""
    query = """
        UPDATE trade_journal
        SET status = 'closed', exited_date = ?, exit_price = ?,
            pnl_realized = ?, pnl_pct = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE ticker = ? AND status = 'open'
    """
    return execute_update(query, (exit_date, exit_price, pnl_realized, pnl_pct, notes, ticker))


def update_trade_status(ticker: str, status: str) -> int:
    """Update trade status (open/closed/stopped/expired)."""
    query = "UPDATE trade_journal SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticker = ? AND status = 'open'"
    return execute_update(query, (status, ticker))


def get_trade_stats() -> Dict[str, Any]:
    """Compute aggregate trade statistics."""
    closed = execute_query(
        "SELECT pnl_pct, pnl_realized FROM trade_journal WHERE status = 'closed'"
    )
    if not closed:
        return {"total_trades": 0, "winners": 0, "losers": 0, "win_rate": 0,
                "avg_pnl_pct": 0, "avg_pnl_abs": 0, "best_pct": 0, "worst_pct": 0}
    pnls = [r["pnl_pct"] for r in closed if r["pnl_pct"] is not None]
    abs_pnls = [r["pnl_realized"] for r in closed if r["pnl_realized"] is not None]
    winners = sum(1 for p in pnls if p > 0)
    return {
        "total_trades": len(pnls),
        "winners": winners,
        "losers": len(pnls) - winners,
        "win_rate": round(winners / len(pnls) * 100, 1) if pnls else 0,
        "avg_pnl_pct": round(sum(pnls) / len(pnls), 2) if pnls else 0,
        "avg_pnl_abs": round(sum(abs_pnls) / len(abs_pnls), 2) if abs_pnls else 0,
        "best_pct": round(max(pnls), 2) if pnls else 0,
        "worst_pct": round(min(pnls), 2) if pnls else 0,
    }


def insert_trade_outcome(row: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a trade outcome record (used by ML Learn loop)."""
    query = """
        INSERT INTO trade_outcomes
        (ticker, scan_date, horizon, entry_price, exit_price, exit_date, label,
         pnl_pct, holding_days, signal_type, vcp_score, tight_rank, stage_at_entry,
         rs_rank_6m, ml_prob, strategy, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = (
        row.get("ticker"), row.get("scan_date"), row.get("horizon"),
        row.get("entry_price"), row.get("exit_price"), row.get("exit_date"),
        row.get("label"), row.get("pnl_pct"), row.get("holding_days"),
        row.get("signal_type"), row.get("vcp_score"), row.get("tight_rank"),
        row.get("stage_at_entry"), row.get("rs_rank_6m"), row.get("ml_prob"),
        row.get("strategy", "vcp"), row.get("notes"),
    )
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return {"lastrowid": cursor.lastrowid}


def get_outcomes_for_retrain(days: int = 365) -> List[Dict[str, Any]]:
    """Get outcomes for retraining ML models (last `days`)."""
    query = """
        SELECT * FROM trade_outcomes
        WHERE scan_date >= date('now', '-' || ? || ' days')
        ORDER BY scan_date ASC
    """
    return execute_query(query, (days,))


def close_pool():
    """Close database connection."""
    global _db_path
    _db_path = None
    logger.info("SQLite connection closed")

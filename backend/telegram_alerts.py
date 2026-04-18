"""
Telegram Alert System for VCP Dashboard Intraday Trading
Handles all Telegram notifications for intraday entry signals.
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import httpx
import pytz

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

IST = pytz.timezone('Asia/Kolkata')

# ============================================================================
# CONFIGURATION
# ============================================================================
ALERT_HISTORY_FILE = os.path.join(os.path.dirname(__file__), "outputs", "alert_history.json")
MAX_ALERT_HISTORY = 500

# ============================================================================
# MODULE-LEVEL VARIABLES
# ============================================================================
SENT_ALERTS: Dict[str, datetime] = {}  # For deduplication within session
_alert_history: List[Dict] = []  # Persistent history

# ============================================================================
# 1. TELEGRAM BOT CLASS
# ============================================================================
class TelegramAlerter:
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
    
    async def send_message(self, text: str) -> bool:
        """Send a message to the configured Telegram chat."""
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram not configured - no token or chat_id")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.base_url}/sendMessage",
                    json={
                        "chat_id": self.chat_id,
                        "text": text,
                        "parse_mode": "HTML"
                    }
                )
                
                if response.status_code == 200:
                    logger.info(f"Telegram message sent successfully")
                    return True
                else:
                    logger.error(f"Telegram API error: {response.status_code} - {response.text}")
                    return False
                    
        except httpx.TimeoutException:
            logger.error("Telegram request timed out")
            return False
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
            return False
    
    def _format_signal_list(self, signal_data: dict) -> str:
        """Format the list of active signals."""
        signals = []
        
        signal_icons = {
            "ema9_cross": "EMA9 crossed above EMA21",
            "vwap_reclaim": "VWAP reclaimed",
            "volume_surge_15m": "Volume surge (2x avg)",
            "inside_bar_break": "Inside bar breakout",
            "ema_stack_1h": "1H EMA stack aligned",
            "rsi_momentum": "RSI momentum (>55 rising)",
            "hourly_breakout": "1H level breakout"
        }
        
        for key, label in signal_icons.items():
            if signal_data.get(key, False):
                signals.append(f"  - {label}")
        
        return "\n".join(signals) if signals else "  - No specific signals"
    
    async def send_entry_alert(self, signal_data: dict) -> bool:
        """Send an intraday entry signal alert."""
        symbol = signal_data.get('symbol', 'UNKNOWN')
        current_time = datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')
        
        message = f"""<b>INTRADAY ENTRY SIGNAL</b>

<b>{symbol}</b> | {signal_data.get('sector', 'N/A')} | {signal_data.get('market_cap', 'N/A')}

Entry: <b>Rs{signal_data.get('suggested_entry', 0):.2f}</b>
Stop Loss: <b>Rs{signal_data.get('stop_loss', 0):.2f}</b> ({signal_data.get('risk_pct', 0):.1f}% risk)
Target 1: <b>Rs{signal_data.get('target_1', 0):.2f}</b> (1.5R)
Target 2: <b>Rs{signal_data.get('target_2', 0):.2f}</b> (2.5R)

VCP Score: {signal_data.get('vcp_score', 0)}/100 | Intraday Score: {signal_data.get('intraday_score', 0)}/100
Timeframe: 15min + 1H confirmed

<b>Signals Active:</b>
{self._format_signal_list(signal_data)}

Time: {current_time}"""
        
        result = await self.send_message(message)
        
        if result:
            _save_alert_to_history({
                "type": "entry",
                "symbol": symbol,
                "time": current_time,
                "entry": signal_data.get('suggested_entry'),
                "score": signal_data.get('intraday_score')
            })
        
        return result
    
    async def send_strong_alert(self, signal_data: dict) -> bool:
        """Send a STRONG signal alert (score >= 80)."""
        symbol = signal_data.get('symbol', 'UNKNOWN')
        current_time = datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')
        
        message = f"""<b>INTRADAY ENTRY SIGNAL</b>

<b>INTRADAY ENTRY SIGNAL</b>

<b>{symbol}</b> | {signal_data.get('sector', 'N/A')} | {signal_data.get('market_cap', 'N/A')}

Entry: <b>Rs{signal_data.get('suggested_entry', 0):.2f}</b>
Stop Loss: <b>Rs{signal_data.get('stop_loss', 0):.2f}</b> ({signal_data.get('risk_pct', 0):.1f}% risk)
Target 1: <b>Rs{signal_data.get('target_1', 0):.2f}</b> (1.5R)
Target 2: <b>Rs{signal_data.get('target_2', 0):.2f}</b> (2.5R)

VCP Score: {signal_data.get('vcp_score', 0)}/100 | Intraday Score: {signal_data.get('intraday_score', 0)}/100
Timeframe: 15min + 1H confirmed

<b>Signals Active:</b>
{self._format_signal_list(signal_data)}

Time: {current_time}"""
        
        result = await self.send_message(message)
        
        if result:
            _save_alert_to_history({
                "type": "strong",
                "symbol": symbol,
                "time": current_time,
                "entry": signal_data.get('suggested_entry'),
                "score": signal_data.get('intraday_score')
            })
        
        return result
    
    async def send_test_message(self) -> bool:
        """Send a test message to verify the bot is working."""
        message = "VCP Intraday Dashboard connected!\nBot is active and monitoring."
        return await self.send_message(message)
    
    async def send_scan_summary(self, results: list) -> bool:
        """Send a summary after each scan completes."""
        if not results:
            return False
        
        current_time = datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')
        
        # Count signals by type
        strong_count = len([r for r in results if r.get('entry_type') == 'STRONG'])
        moderate_count = len([r for r in results if r.get('entry_type') == 'MODERATE'])
        
        # Get top 3 picks
        top_picks = sorted(results, key=lambda x: x.get('intraday_score', 0), reverse=True)[:3]
        
        top_3_text = ""
        for i, pick in enumerate(top_picks, 1):
            score = pick.get('intraday_score', 0)
            price = pick.get('suggested_entry', 0)
            emoji = "STRONG" if score >= 80 else "MODERATE"
            top_3_text += f"{i}. {pick.get('symbol', 'UNKNOWN')} - Score: {score} - Rs{price:.2f} [{emoji}]\n"
        
        message = f"""<b>Intraday Scan Complete</b> - {current_time}

Stocks scanned: {len(results)}
Strong signals: {strong_count}
Moderate signals: {moderate_count}

<b>Top 3 picks:</b>
{top_3_text}"""
        
        return await self.send_message(message)


# ============================================================================
# 2. ALERT DEDUPLICATION
# ============================================================================
def is_duplicate(symbol: str, price: float) -> bool:
    """
    Check if an alert for this symbol was already sent recently.
    Uses price bucket (rounded to nearest 0.5%) to avoid duplicate alerts.
    """
    if price <= 0:
        return True
    
    # Create price bucket (round to nearest 0.5%)
    price_bucket = round(price * 2) / 2
    
    today = datetime.now(IST).strftime('%Y-%m-%d')
    key = f"{symbol}_{today}_{price_bucket}"
    
    # Check if we sent this alert in the last 60 minutes
    if key in SENT_ALERTS:
        sent_time = SENT_ALERTS[key]
        if datetime.now(IST) - sent_time < timedelta(minutes=60):
            logger.info(f"Duplicate alert detected for {symbol} at price {price}")
            return True
    
    # Mark as sent
    SENT_ALERTS[key] = datetime.now(IST)
    return False


def clear_old_sent_alerts():
    """Clear sent alerts older than 24 hours."""
    global SENT_ALERTS
    cutoff = datetime.now(IST) - timedelta(hours=24)
    SENT_ALERTS = {
        k: v for k, v in SENT_ALERTS.items() 
        if v > cutoff
    }


# ============================================================================
# 3. ALERT DISPATCHER
# ============================================================================
async def dispatch_alerts(scan_results: list, config: dict) -> int:
    """
    Dispatch alerts based on scan results and configuration.
    Returns count of alerts sent.
    """
    if not config.get('send_telegram', False):
        logger.info("Telegram alerts disabled in config")
        return 0
    
    bot_token = config.get('telegram_bot_token', '')
    chat_id = config.get('telegram_chat_id', '')
    
    if not bot_token or not chat_id:
        logger.warning("Telegram not configured - missing token or chat_id")
        return 0
    
    alerter = TelegramAlerter(bot_token, chat_id)
    
    # Filter for entry signals
    entry_signals = [r for r in scan_results if r.get('entry_signal', False)]
    
    # Filter for strong only if configured
    if config.get('alert_on_strong_only', False):
        entry_signals = [r for r in entry_signals if r.get('entry_type') == 'STRONG']
    
    alerts_sent = 0
    
    for signal in entry_signals:
        symbol = signal.get('symbol', '')
        price = signal.get('suggested_entry', 0)
        
        # Check for duplicates
        if is_duplicate(symbol, price):
            continue
        
        # Send appropriate alert
        if signal.get('entry_type') == 'STRONG':
            success = await alerter.send_strong_alert(signal)
        else:
            success = await alerter.send_entry_alert(signal)
        
        if success:
            alerts_sent += 1
            logger.info(f"Alert sent for {symbol} with score {signal.get('intraday_score')}")
    
    # Send scan summary
    if alerts_sent > 0:
        await alerter.send_scan_summary(scan_results)
    
    return alerts_sent


# ============================================================================
# 4. BOT TOKEN VALIDATOR
# ============================================================================
async def validate_bot_token(token: str, chat_id: str) -> dict:
    """
    Validate a Telegram bot token and test sending a message.
    """
    if not token or not chat_id:
        return {"valid": False, "bot_name": "", "error": "Missing token or chat_id"}
    
    base_url = f"https://api.telegram.org/bot{token}"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # First, get bot info
            me_response = await client.get(f"{base_url}/getMe")
            
            if me_response.status_code != 200:
                return {"valid": False, "bot_name": "", "error": "Invalid token"}
            
            me_data = me_response.json()
            if not me_data.get('ok'):
                return {"valid": False, "bot_name": "", "error": me_data.get('description', 'Unknown error')}
            
            bot_name = me_data.get('result', {}).get('first_name', 'Unknown')
            
            # Try sending a test message
            test_response = await client.post(
                f"{base_url}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": "VCP Dashboard connected! Intraday alerts are active.",
                    "parse_mode": "HTML"
                }
            )
            
            if test_response.status_code == 200:
                return {"valid": True, "bot_name": bot_name, "error": ""}
            else:
                test_data = test_response.json()
                return {"valid": False, "bot_name": bot_name, "error": test_data.get('description', 'Failed to send message')}
    
    except httpx.TimeoutException:
        return {"valid": False, "bot_name": "", "error": "Request timed out"}
    except Exception as e:
        return {"valid": False, "bot_name": "", "error": str(e)}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def _load_alert_history() -> List[Dict]:
    """Load alert history from file."""
    global _alert_history
    
    if os.path.exists(ALERT_HISTORY_FILE):
        try:
            with open(ALERT_HISTORY_FILE, 'r') as f:
                _alert_history = json.load(f)
        except:
            _alert_history = []
    
    return _alert_history


def _save_alert_to_history(alert: Dict):
    """Save an alert to the persistent history file."""
    global _alert_history
    
    _load_alert_history()
    
    _alert_history.append(alert)
    
    # Keep only last MAX_ALERT_HISTORY
    if len(_alert_history) > MAX_ALERT_HISTORY:
        _alert_history = _alert_history[-MAX_ALERT_HISTORY:]
    
    try:
        os.makedirs(os.path.dirname(ALERT_HISTORY_FILE), exist_ok=True)
        with open(ALERT_HISTORY_FILE, 'w') as f:
            json.dump(_alert_history, f)
    except Exception as e:
        logger.error(f"Error saving alert history: {e}")


def get_alert_history(limit: int = 50) -> List[Dict]:
    """Get recent alert history."""
    _load_alert_history()
    return _alert_history[-limit:]


# Initialize on import
_load_alert_history()
clear_old_sent_alerts()

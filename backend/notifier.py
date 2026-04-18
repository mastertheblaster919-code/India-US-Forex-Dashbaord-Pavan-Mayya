"""
Telegram notifier for VCP dashboard alerts.
Sends notifications via Telegram bot for daily alerts, breakouts, and weekly summaries.
"""

import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    import requests
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


def _send_telegram_message(text: str, parse_mode: str = "HTML") -> bool:
    """Send message to Telegram. Returns True on success."""
    if not TELEGRAM_AVAILABLE:
        logger.warning("requests library not available")
        return False
    
    token_str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id_str = os.getenv("TELEGRAM_CHAT_ID", "")
    
    if not token_str or not chat_id_str:
        logger.debug("Telegram credentials not configured (TOKEN or CHAT_ID missing)")
        return False
        
    tokens = [t.strip() for t in token_str.split(",") if t.strip()]
    chats = [c.strip() for c in chat_id_str.split(",") if c.strip()]
    
    success = False
    for i, token in enumerate(tokens):
        chat_id = chats[i] if i < len(chats) else chats[0]
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
                "disable_web_page_preview": True,
            }
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                success = True
            else:
                logger.error(f"Telegram send failed for chat {chat_id}: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Telegram error for chat {chat_id}: {e}")
            
    return success


def _signal_emoji(signals: Dict[str, bool]) -> str:
    """Convert signals dict to emoji string."""
    emojis = []
    if signals.get("volume_surge"):
        emojis.append("🔥VOL")
    if signals.get("msb"):
        emojis.append("📈MSB")
    if signals.get("pivot_breakout"):
        emojis.append("💥PVT")
    if signals.get("dma20_break"):
        emojis.append("〽️20MA")
    if signals.get("price_surge"):
        emojis.append("🚀PRC")
    if signals.get("tl_breakout"):
        emojis.append("📉TL")
    return " ".join(emojis) if emojis else "—"


def send_daily_summary(results: List[Dict[str, Any]], date: Optional[str] = None) -> bool:
    """
    Send daily VCP summary to Telegram.
    Fires every evening after scan completes.
    Only includes stocks with score >= 70.
    """
    if not results:
        return False

    date_str = date or datetime.now().strftime("%Y-%m-%d")
    filtered = [r for r in results if (r.get("score") or 0) >= 70]

    if not filtered:
        text = f"📊 <b>VCP Daily Alert — {date_str}</b>\n\nNo VCP setups found today (score >= 70)."
        return _send_telegram_message(text)

    lines = [f"📊 <b>VCP Daily Alert — {date_str}</b>", ""]

    market_health = "🟢 HEALTHY" if filtered else "🔴 UNHEALTHY"
    lines.append(f"Total Setups: <b>{len(filtered)}</b> | Market: {market_health}")
    lines.append("")

    for r in filtered:
        ticker = r.get("ticker", "N/A").replace("-EQ", "")
        price = r.get("last_price", r.get("close", 0))
        score = r.get("score", 0)
        rs_rank = r.get("rs_rank_6m", r.get("rs_rank", "—"))
        checklist = r.get("checklist", r.get("checklist_str", "—"))
        signals = r.get("signals_summary", r.get("signals_fired", r.get("signals", {})))
        pivot = r.get("pivot_price", r.get("entry_price", "—"))
        stop = r.get("stop_price", "—")
        target = r.get("target_price", "—")
        ml_prob = r.get("ml_prob", "—")
        stage = r.get("stage", "—")

        emoji_signals = _signal_emoji(signals) if isinstance(signals, dict) else "—"

        price_str = f"₹{price:.2f}" if price else "—"
        score_str = f"{score:.1f}" if isinstance(score, (int, float)) else str(score)
        rs_str = f"{rs_rank:.0f}" if isinstance(rs_rank, (int, float)) else str(rs_rank)
        pivot_str = f"₹{pivot:.2f}" if isinstance(pivot, (int, float)) else str(pivot)
        stop_str = f"₹{stop:.2f}" if isinstance(stop, (int, float)) else str(stop)
        target_str = f"₹{target:.2f}" if isinstance(target, (int, float)) else str(target)
        ml_str = f"{ml_prob*100:.0f}%" if isinstance(ml_prob, (int, float)) else str(ml_prob)

        lines.append(f"━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"<b>{ticker}</b> | {price_str} | <b>Score {score_str}</b>")
        lines.append(f"S{stage} | RS {rs_str} | Check {checklist}/7")
        lines.append(f"Signals: {emoji_signals}")
        lines.append(f"📍 Entry: {pivot_str} | SL: {stop_str} | Target: {target_str}")
        if ml_prob not in ("—", None):
            lines.append(f"🤖 ML Prob: {ml_str}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"<i>Auto-generated by VCP Dashboard</i>")

    text = "\n".join(lines)
    return _send_telegram_message(text)


def send_breakout_alert(result: Dict[str, Any], hourly_data: Dict[str, Any]) -> bool:
    """
    Send breakout alert to Telegram.
    Fires when hourly breakout is detected.
    """
    ticker = result.get("ticker", "N/A").replace("-EQ", "")
    price = result.get("last_price", result.get("close", 0))
    score = result.get("score", 0)
    ml_prob = result.get("ml_prob", "—")
    signals = result.get("signals_summary", result.get("signals", {}))
    pivot = result.get("pivot_price", "—")
    stop = result.get("stop_price", "—")
    target = result.get("target_price", "—")

    signals_summary = result.get("signals_summary", {})
    if isinstance(signals_summary, dict):
        days_since = signals_summary.get("days_since_last", 999)
        if days_since <= 0:
            entry_warning = "🟢 FRESH"
        elif days_since <= 3:
            entry_warning = "🟡 EARLY"
        elif days_since <= 10:
            entry_warning = "🟠 WATCH"
        else:
            entry_warning = "🔴 LATE"
    else:
        entry_warning = "—"

    pivot_crossed = hourly_data.get("pivot_crossed", pivot) if hourly_data else pivot
    vol_ratio = hourly_data.get("vol_ratio", result.get("vol_ratio", "—"))

    price_str = f"₹{price:.2f}" if price else "—"
    score_str = f"{score:.1f}" if isinstance(score, (int, float)) else str(score)
    pivot_str = f"₹{pivot_crossed:.2f}" if isinstance(pivot_crossed, (int, float)) else str(pivot_crossed)
    stop_str = f"₹{stop:.2f}" if isinstance(stop, (int, float)) else str(stop)
    target_str = f"₹{target:.2f}" if isinstance(target, (int, float)) else str(target)
    ml_str = f"{ml_prob*100:.0f}%" if isinstance(ml_prob, (int, float)) else str(ml_prob)
    vol_str = f"{vol_ratio:.2f}x" if isinstance(vol_ratio, (int, float)) else str(vol_ratio)

    emoji_signals = _signal_emoji(signals) if isinstance(signals, dict) else "—"

    lines = [
        "🚨 <b>BREAKOUT ALERT</b>",
        "",
        f"<b>{ticker}</b> | {price_str}",
        "",
        f"📍 Pivot Crossed: <b>{pivot_str}</b>",
        f"📊 Score: <b>{score_str}</b> | Vol: <b>{vol_str}</b>",
        f"⚡ Signals: {emoji_signals}",
        "",
        f"🎯 Entry: {price_str} | SL: {stop_str} | Target: {target_str}",
    ]

    if ml_prob not in ("—", None):
        lines.append(f"🤖 ML Prob: {ml_str}")

    lines.append("")
    lines.append(f"{entry_warning} — {entry_warning.split()[1] if ' ' in entry_warning else ''}")
    lines.append("")
    lines.append("⚡ <i>Act within 15 mins or bracket order fills automatically</i>")

    text = "\n".join(lines)
    return _send_telegram_message(text)


def send_order_filled(ticker: str, price: float, order_type: str) -> bool:
    """
    Send order filled confirmation to Telegram.
    Fires when GTT order is executed.
    """
    ticker_clean = ticker.replace("-EQ", "") if ticker else "N/A"
    price_str = f"₹{price:.2f}" if price else "—"

    text = (
        f"✅ <b>Order Filled</b>\n\n"
        f"<b>{ticker_clean}</b>\n"
        f"Price: <b>{price_str}</b>\n"
        f"Type: {order_type}\n\n"
        f"<i>Logged by VCP Dashboard</i>"
    )
    return _send_telegram_message(text)


def send_weekly_summary(stats: Dict[str, Any]) -> bool:
    """
    Send weekly summary to Telegram.
    Fires Sunday 7PM.
    Shows: alerts sent, triggered, avg return, best/worst performer, top 3 setups.
    """
    alerts_sent = stats.get("alerts_sent", 0)
    triggered = stats.get("triggered", 0)
    avg_return = stats.get("avg_return", 0)
    best_performer = stats.get("best_performer", {})
    worst_performer = stats.get("worst_performer", {})
    top_setups = stats.get("top_setups", [])
    trigger_rate = (triggered / alerts_sent * 100) if alerts_sent > 0 else 0
    avg_return_str = f"{avg_return:+.1f}%" if isinstance(avg_return, (int, float)) else str(avg_return)

    lines = [
        f"📈 <b>Weekly VCP Summary</b>",
        f"{datetime.now().strftime('%B %d, %Y')}",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        f"<b>Performance</b>",
        f"Alerts Sent: {alerts_sent}",
        f"Triggered: {triggered} ({trigger_rate:.0f}%)",
        f"Avg Return: {avg_return_str}",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
    ]

    if best_performer:
        best_ticker = best_performer.get("ticker", "N/A").replace("-EQ", "")
        best_return = best_performer.get("return", 0)
        best_return_str = f"{best_return:+.1f}%" if isinstance(best_return, (int, float)) else str(best_return)
        lines.append(f"<b>🏆 Best Performer</b>")
        lines.append(f"{best_ticker}: {best_return_str}")

    if worst_performer:
        worst_ticker = worst_performer.get("ticker", "N/A").replace("-EQ", "")
        worst_return = worst_performer.get("return", 0)
        worst_return_str = f"{worst_return:+.1f}%" if isinstance(worst_return, (int, float)) else str(worst_return)
        lines.append(f"<b>📉 Worst Performer</b>")
        lines.append(f"{worst_ticker}: {worst_return_str}")

    if top_setups:
        lines.append("")
        lines.append("━━━━━━━━━━━━━━━━━━━━")
        lines.append("<b>Top 3 Setups on Watchlist</b>")
        for i, setup in enumerate(top_setups[:3], 1):
            s_ticker = setup.get("ticker", "N/A").replace("-EQ", "")
            s_score = setup.get("score", 0)
            s_score_str = f"{s_score:.1f}" if isinstance(s_score, (int, float)) else str(s_score)
            lines.append(f"{i}. {s_ticker} — Score {s_score_str}")

    lines.append("")
    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("<i>Auto-generated by VCP Dashboard</i>")

    text = "\n".join(lines)
    return _send_telegram_message(text)

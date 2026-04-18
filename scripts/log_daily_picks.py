
import pickle
import os
from datetime import datetime

SCAN_CACHE_DIR = r"d:\Production\vcp_dashboard_india\backend\outputs\scan_cache"
JOURNAL_DIR = r"d:\Production\vcp_dashboard_india\trading_journal"
DATE_STR = datetime.now().strftime("%Y-%m-%d")

def log_picks():
    if not os.path.exists(JOURNAL_DIR):
        os.makedirs(JOURNAL_DIR)
        
    cache_path = os.path.join(SCAN_CACHE_DIR, f"IN_{DATE_STR}.pkl")
    if not os.path.exists(cache_path):
        print("Cache file not found.")
        return

    with open(cache_path, "rb") as f:
        results = pickle.load(f)

    # Filter for high score
    top_picks = [r for r in results if r.get('score', 0) >= 60]
    top_picks.sort(key=lambda x: x.get('score', 0), reverse=True)

    log_content = f"# 🏹 VCP Trading Picks - {DATE_STR}\n\n"
    log_content += f"Run at: {datetime.now().strftime('%H:%M:%S')}\n"
    log_content += f"Total Tickers Scanned: {len(results)}\n"
    log_content += f"Conviction Picks Found (Score > 60): {len(top_picks)}\n\n"
    
    log_content += "### Top 10 Setups for Today\n\n"
    log_content += "| Ticker | Score | Tightness | V-Dry | Pattern Status | Reasons |\n"
    log_content += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
    
    display_picks = results
    display_picks.sort(key=lambda x: x.get('score', 0), reverse=True)
    
    for p in display_picks[:10]:  # Top 10
        ticker = p.get('ticker', 'N/A')
        score = p.get('score', 0)
        tight = p.get('tight', 0)
        vdry = p.get('vdry', 0)
        stage = p.get('stage', 'Unknown')
        
        # Assemble reasons
        reasons = []
        if stage == 2: reasons.append("✅ Stage 2 Uptrend")
        if tight >= 80: reasons.append("💎 Extreme Tightness")
        if vdry >= 80: reasons.append("🔋 Volume Drying Up")
        if p.get('squeeze'): reasons.append("🚀 Squeeze Detected")
        if p.get('r63', 0) > 20: reasons.append("📈 Strong 3M Momentum")
        
        reason_str = ", ".join(reasons) if reasons else "High overall VCP score"
        
        log_content += f"| {ticker} | {score} | {tight} | {vdry} | Stage {stage} | {reason_str} |\n"

    journal_file = os.path.join(JOURNAL_DIR, f"{DATE_STR}.md")
    with open(journal_file, "w", encoding="utf-8") as f:
        f.write(log_content)
    
    print(f"Successfully saved picks to {journal_file}")
    print(log_content)

if __name__ == "__main__":
    log_picks()

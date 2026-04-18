import { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff, ExternalLink, RefreshCw, Save, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

const API_BASE = '/api';

interface IntradayConfig {
  auto_refresh_15m: boolean;
  auto_refresh_1h: boolean;
  min_intraday_score: number;
  max_stocks_to_scan: number;
  send_telegram: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  alert_on_strong_only: boolean;
}

interface BotConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BotConfigPanel({ isOpen, onClose }: BotConfigPanelProps) {
  const [config, setConfig] = useState<IntradayConfig>({
    auto_refresh_15m: false,
    auto_refresh_1h: false,
    min_intraday_score: 60,
    max_stocks_to_scan: 100,
    send_telegram: false,
    telegram_bot_token: '',
    telegram_chat_id: '',
    alert_on_strong_only: false,
  });
  const [originalConfig, setOriginalConfig] = useState<IntradayConfig | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [budget, setBudget] = useState({ calls_used: 0, calls_remaining: 100000, limit: 100000, pct_used: 0 });
  const [hasChanges, setHasChanges] = useState(false);
  const [alertCooldown, setAlertCooldown] = useState(60);
  const [sendScanSummary, setSendScanSummary] = useState(true);
  const [marketHoursOnly, setMarketHoursOnly] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/config`);
      setConfig(res.data);
      setOriginalConfig(res.data);
    } catch (e) {
      console.error('Error fetching config:', e);
    }
  }, []);

  const fetchBudget = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/intraday/budget`);
      setBudget(res.data);
    } catch (e) {
      console.error('Error fetching budget:', e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchBudget();
      const interval = setInterval(fetchBudget, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchConfig, fetchBudget]);

  useEffect(() => {
    if (originalConfig) {
      const changed = JSON.stringify(config) !== JSON.stringify(originalConfig);
      setHasChanges(changed);
    }
  }, [config, originalConfig]);

  const testTelegram = async () => {
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      setTestResult({ success: false, message: 'Please enter both token and chat ID' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API_BASE}/telegram/test`);
      setTestResult({ success: res.data.success, message: res.data.message });
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.detail || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (config.send_telegram && (!config.telegram_bot_token || !config.telegram_chat_id)) {
      setTestResult({ success: false, message: 'Please enter bot token and chat ID to enable Telegram alerts' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/intraday/config`, {
        ...config,
        alert_cooldown: alertCooldown,
        send_scan_summary: sendScanSummary,
        market_hours_only: marketHoursOnly,
      });
      setOriginalConfig(config);
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Error saving config:', e);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      const defaults: IntradayConfig = {
        auto_refresh_15m: false,
        auto_refresh_1h: false,
        min_intraday_score: 60,
        max_stocks_to_scan: 100,
        send_telegram: false,
        telegram_bot_token: '',
        telegram_chat_id: '',
        alert_on_strong_only: false,
      };
      setConfig(defaults);
      setAlertCooldown(60);
      setSendScanSummary(true);
      setMarketHoursOnly(true);
    }
  };

  const estimatedAlerts = Math.floor((100 - config.min_intraday_score + 1) * 0.5);
  const estimatedCalls = config.max_stocks_to_scan * 2;
  const remainingScans = Math.floor(budget.calls_remaining / estimatedCalls);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[420px] bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-out">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Bot Configuration</h2>
            {hasChanges && (
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">Unsaved</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* SECTION 1: TELEGRAM BOT SETUP */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Telegram Bot Configuration
            </h3>
            
            <div>
              <label className="block text-xs text-slate-400 mb-1">Bot Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={config.telegram_bot_token}
                  onChange={e => setConfig({ ...config, telegram_bot_token: e.target.value })}
                  placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSs4tG_XXXX"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 pr-10 text-sm text-white placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>Get this from @BotFather on Telegram</span>
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Chat ID</label>
              <input
                type="text"
                value={config.telegram_chat_id}
                onChange={e => setConfig({ ...config, telegram_chat_id: e.target.value })}
                placeholder="-1001234567890 or 123456789"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500"
              />
              <div className="mt-1 relative">
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-xs text-blue-400 hover:underline"
                >
                  How to find this?
                </button>
                {showTooltip && (
                  <div className="absolute left-0 top-6 bg-slate-800 border border-slate-600 p-2 rounded text-xs text-slate-300 z-10 w-64">
                    Message @userinfobot on Telegram to get your chat ID. For groups, use @userinfobot or check group info.
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={testTelegram}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors"
            >
              {testing && <RefreshCw className="w-4 h-4 animate-spin" />}
              Test Connection
            </button>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-300">Send entry alerts to Telegram</span>
              <div
                onClick={() => setConfig({ ...config, send_telegram: !config.send_telegram })}
                className={`w-11 h-6 rounded-full transition-colors ${config.send_telegram ? 'bg-green-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${config.send_telegram ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>
          </section>

          {/* SECTION 2: ALERT SETTINGS */}
          <section className="space-y-4 border-t border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Alert Rules
            </h3>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-300">Strong signals only</span>
              <div
                onClick={() => setConfig({ ...config, alert_on_strong_only: !config.alert_on_strong_only })}
                className={`w-11 h-6 rounded-full transition-colors ${config.alert_on_strong_only ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${config.alert_on_strong_only ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-300">Send scan summary</span>
              <div
                onClick={() => setSendScanSummary(!sendScanSummary)}
                className={`w-11 h-6 rounded-full transition-colors ${sendScanSummary ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${sendScanSummary ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Minimum score to alert</span>
                <span className="text-sm text-white font-medium">{config.min_intraday_score}</span>
              </div>
              <input
                type="range"
                min={60}
                max={100}
                value={config.min_intraday_score}
                onChange={e => setConfig({ ...config, min_intraday_score: Number(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-1">~{estimatedAlerts} alerts per scan</p>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Alert cooldown</label>
              <select
                value={alertCooldown}
                onChange={e => setAlertCooldown(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
              </select>
            </div>
          </section>

          {/* SECTION 3: SCAN SETTINGS */}
          <section className="space-y-4 border-t border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-white">Scan Settings</h3>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Max stocks to scan</label>
              <div className="flex gap-2">
                {[25, 50, 100].map(n => (
                  <button
                    key={n}
                    onClick={() => setConfig({ ...config, max_stocks_to_scan: n })}
                    className={`flex-1 py-2 rounded text-sm transition-colors ${
                      config.max_stocks_to_scan === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">~{estimatedCalls} API calls per scan</p>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-slate-300">Auto-refresh 15-min</span>
                <p className="text-xs text-slate-500">Scans every 15 minutes during market hours</p>
              </div>
              <div
                onClick={() => setConfig({ ...config, auto_refresh_15m: !config.auto_refresh_15m })}
                className={`w-11 h-6 rounded-full transition-colors ${config.auto_refresh_15m ? 'bg-green-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${config.auto_refresh_15m ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-slate-300">Auto-refresh 1-hour</span>
                <p className="text-xs text-slate-500">Scans at the start of each hour</p>
              </div>
              <div
                onClick={() => setConfig({ ...config, auto_refresh_1h: !config.auto_refresh_1h })}
                className={`w-11 h-6 rounded-full transition-colors ${config.auto_refresh_1h ? 'bg-green-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${config.auto_refresh_1h ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-slate-300">Market hours only</span>
                <p className="text-xs text-slate-500">9:15 AM - 3:30 PM IST</p>
              </div>
              <div
                onClick={() => setMarketHoursOnly(!marketHoursOnly)}
                className={`w-11 h-6 rounded-full transition-colors ${marketHoursOnly ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${marketHoursOnly ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>
          </section>

          {/* SECTION 4: API BUDGET */}
          <section className="space-y-4 border-t border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-white">Fyers API Usage Today</h3>
            
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-white">{budget.calls_used.toLocaleString()}</div>
              <div className="text-sm text-slate-500">/ {budget.limit.toLocaleString()}</div>
            </div>

            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  budget.pct_used < 50 ? 'bg-green-500' : budget.pct_used < 80 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(budget.pct_used, 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-slate-400">
              <span>~{estimatedCalls} calls/scan</span>
              <span>{remainingScans} scans remaining</span>
            </div>
          </section>

          {/* SECTION 5: SAVE / RESET */}
          <section className="space-y-3 border-t border-slate-700 pt-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Settings saved. Telegram active.
              </div>
            )}
            
            <button
              onClick={saveConfig}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded text-white font-medium transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>

            <button
              onClick={resetToDefaults}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>

            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-600 hover:bg-slate-800 rounded text-sm text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

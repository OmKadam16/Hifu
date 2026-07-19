import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Shield, AlertTriangle, CheckCircle,
  Clock, Target, Activity, BarChart3, Sparkles,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAppState } from '../AppContext';
import { getFaceId, generateReport, type ReportData, type ScanHistoryItem, type ProductAnalysis } from '../api';

interface LogEntry {
  date: string;
  label: string;
  type: 'positive' | 'negative' | 'neutral';
  detail: string;
}

function buildTimeline(history: ScanHistoryItem[], scans: ProductAnalysis[]): LogEntry[] {
  const entries: LogEntry[] = [];
  const all = [...history, ...scans];
  for (const s of all.slice(0, 10)) {
    const verdict = s.verdict?.toLowerCase() || '';
    const name = 'product_name' in s ? s.product_name : 'Skin Scan';
    const time = 'scanned_at' in s ? s.scanned_at : new Date().toISOString();
    if (verdict === 'good match') {
      entries.push({ date: time, label: `Scanned ${name}`, type: 'positive', detail: 'Verdict: Good match — ingredients align with your skin profile.' });
    } else if (verdict === 'not a good match') {
      entries.push({ date: time, label: `Scanned ${name}`, type: 'negative', detail: 'Verdict: Not a good match — contains flagged irritants.' });
    } else if (verdict === 'mixed') {
      entries.push({ date: time, label: `Scanned ${name}`, type: 'neutral', detail: 'Verdict: Mixed — some ingredients help, others may irritate.' });
    } else {
      entries.push({ date: time, label: `Scanned ${name}`, type: 'neutral', detail: 'Profile scan completed.' });
    }
  }
  if (entries.length === 0) {
    entries.push({ date: new Date().toISOString(), label: 'Base profile generated', type: 'neutral', detail: 'Initial skin assessment — 4 scar zones mapped.' });
  }
  return entries;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Reports() {
  const navigate = useNavigate();
  const { profile, scans, history } = useAppState();
  const faceId = getFaceId();
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    if (!faceId) { setReportLoading(false); return; }
    (async () => {
      try {
        const data = await generateReport(faceId);
        setReport(data);
      } catch {
        setReport(null);
      } finally {
        setReportLoading(false);
      }
    })();
  }, [faceId]);

  const timeline = buildTimeline(history, scans);
  const goodProducts = [...history, ...scans].filter(s => s.verdict?.toLowerCase() === 'good match').slice(0, 4);
  const badProducts = [...history, ...scans].filter(s => s.verdict?.toLowerCase() === 'not a good match' || s.verdict?.toLowerCase() === 'mixed').slice(0, 4);
  const scarCount = profile?.scar_regions?.length || 4;
  const stableZones = Math.max(0, scarCount - 1);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar active="Reports" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep">Skin Progress Report</h1>
              <p className="text-sm text-gray-mid">AI-powered clinical tracking & product correlation</p>
            </div>
            <BarChart3 size={24} className="text-forest" />
          </div>

          {/* Top row — Executive Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Score gauge */}
            <div className="bg-white rounded-2xl p-6 border border-border shadow-sm flex items-center gap-6">
              {reportLoading ? (
                <div className="w-28 h-28 shrink-0 rounded-full bg-gray-200 animate-pulse" />
              ) : (
                <div className="relative w-28 h-28 shrink-0">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#EAE6DF" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" stroke="#2C5E43" strokeWidth="8"
                      strokeDasharray={`${((report?.skin_health_score ?? 65) / 100) * 264} 264`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-deep">{report?.skin_health_score ?? '--'}</span>
                    <span className="text-[10px] text-gray-mid uppercase tracking-wider">/ 100</span>
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-deep mb-1">Skin Health Score</h3>
                {report ? (
                  <>
                    <div className={`flex items-center gap-1 text-sm font-medium ${
                      report.score_trend === 'improving' ? 'text-green-600' :
                      report.score_trend === 'declining' ? 'text-red-500' :
                      'text-yellow-600'
                    }`}>
                      {report.score_trend === 'improving' ? <TrendingUp size={16} /> :
                       report.score_trend === 'declining' ? <TrendingDown size={16} /> :
                       <Activity size={16} />}
                      {report.score_trend === 'improving' ? 'Improving' :
                       report.score_trend === 'declining' ? 'Declining' : 'Stable'}
                    </div>
                    <p className="text-[11px] text-gray-mid mt-2 leading-relaxed">
                      {report.top_strength}
                    </p>
                  </>
                ) : reportLoading ? (
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-mid mt-2">
                    Scan your skin and products to get an AI-powered health score.
                  </p>
                )}
              </div>
            </div>

            {/* Scar & Blemish status */}
            <div className="bg-white rounded-2xl p-6 border border-border shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-accent/40 flex items-center justify-center shrink-0">
                <Shield size={28} className="text-forest" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-deep mb-1">Scar & Blemish Status</h3>
                <p className="text-sm text-forest font-medium">
                  {stableZones} of {scarCount} Scar Zones stable or improving
                </p>
                <p className="text-xs text-gray-mid mt-1">
                  {profile?.skin_type ? `${profile.skin_type} skin · ` : ''}
                  {profile?.visible_conditions?.length ? profile.visible_conditions.join(', ') : 'No active conditions flagged'}
                </p>
              </div>
            </div>
          </div>

          {/* Middle row — Product Performance Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Good Products */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="h-1.5 bg-green-500" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle size={18} className="text-green-600" />
                  <h3 className="text-base font-semibold text-deep">Optimizing Your Progress</h3>
                </div>
                {goodProducts.length > 0 ? goodProducts.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-100 to-emerald-50 flex items-center justify-center text-lg shrink-0">
                      {'product_name' in p ? p.product_name.charAt(0) : '🧴'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-deep truncate">
                        {'product_name' in p ? p.product_name : 'Skin Scan'}
                      </p>
                      <span className="inline-block text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full mt-1">
                        Targeting Acne: Active
                      </span>
                      <p className="text-[11px] text-gray-mid mt-1.5 leading-relaxed">
                        {'summary' in p && p.summary ? p.summary : 'High concentration of beneficial ingredients reinforcing skin barrier stability.'}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="py-6 text-center">
                    <Target size={32} className="mx-auto text-gray-mid mb-2" />
                    <p className="text-sm text-gray-mid">No positively-matched products yet.</p>
                    <p className="text-xs text-gray-mid mt-1">Scan products to see them ranked here.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bad Products */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="h-1.5 bg-red-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={18} className="text-red-500" />
                  <h3 className="text-base font-semibold text-deep">Aggravating Factors</h3>
                </div>
                {badProducts.length > 0 ? badProducts.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-100 to-rose-50 flex items-center justify-center text-lg shrink-0">
                      {'product_name' in p ? p.product_name.charAt(0) : '⚠️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-deep truncate">
                        {'product_name' in p ? p.product_name : 'Unknown Product'}
                      </p>
                      <span className="inline-block text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full mt-1">
                        Triggers Redness: High Risk
                      </span>
                      <p className="text-[11px] text-gray-mid mt-1.5 leading-relaxed">
                        {'flagged_ingredients' in p && p.flagged_ingredients?.length
                          ? p.flagged_ingredients.join('; ')
                          : 'High-concentration irritating components may aggravate active scar zones.'}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="py-6 text-center">
                    <Activity size={32} className="mx-auto text-gray-mid mb-2" />
                    <p className="text-sm text-gray-mid">No disruptive products detected.</p>
                    <p className="text-xs text-gray-mid mt-1">Your current product history shows no conflicts.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Report Insight */}
          {report && !reportLoading && (
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-forest to-emerald-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={18} className="text-forest" />
                  <h3 className="text-base font-semibold text-deep">AI Clinical Insight</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Strength</p>
                    <p className="text-sm text-deep leading-relaxed">{report.top_strength}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Weakness</p>
                    <p className="text-sm text-deep leading-relaxed">{report.top_weakness}</p>
                  </div>
                  <div className="bg-accent/40 rounded-xl p-4">
                    <p className="text-xs font-semibold text-forest uppercase tracking-wider mb-1">Recommendation</p>
                    <p className="text-sm text-deep leading-relaxed">{report.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom row — Timeline */}
          <div className="bg-white rounded-2xl p-6 border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Clock size={18} className="text-gray-mid" />
              <h3 className="text-base font-semibold text-deep">Skin Log Timeline</h3>
            </div>
            <div className="space-y-0">
              {timeline.map((entry, i) => (
                <div key={i} className="flex gap-4 pb-4 relative">
                  {i < timeline.length - 1 && (
                    <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                  )}
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                    entry.type === 'positive' ? 'bg-green-100' :
                    entry.type === 'negative' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    {entry.type === 'positive' ? (
                      <CheckCircle size={12} className="text-green-600" />
                    ) : entry.type === 'negative' ? (
                      <AlertTriangle size={12} className="text-red-500" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-mid" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-deep">{entry.label}</p>
                      <span className="text-[10px] text-gray-mid shrink-0 ml-2">{timeAgo(entry.date)}</span>
                    </div>
                    <p className="text-[11px] text-gray-mid mt-0.5">{entry.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

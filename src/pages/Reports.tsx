import { useState } from 'react';
import { TrendingUp, TrendingDown, CheckCircle, AlertTriangle,
  Clock, Activity, BarChart3, Sparkles, Loader2, FileText } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAppState } from '../AppContext';
import { getFaceId, generateReport, type ReportData, type ScanHistoryItem, type ProductAnalysis } from '../api';

interface LogEntry { date: string; label: string; type: 'positive' | 'negative' | 'neutral'; detail: string }

function buildTimeline(history: ScanHistoryItem[], scans: ProductAnalysis[]): LogEntry[] {
  const all = [...history, ...scans];
  const entries: LogEntry[] = all.slice(0, 10).map(s => {
    const v = s.verdict?.toLowerCase() || '';
    const name = 'product_name' in s ? s.product_name : 'Skin Scan';
    const t = 'scanned_at' in s ? s.scanned_at : new Date().toISOString();
    if (v === 'good match') return { date: t, label: `Scanned ${name}`, type: 'positive' as const, detail: 'Good match — ingredients align with your profile.' };
    if (v === 'not a good match') return { date: t, label: `Scanned ${name}`, type: 'negative' as const, detail: 'Not a good match — contains flagged irritants.' };
    if (v === 'mixed') return { date: t, label: `Scanned ${name}`, type: 'neutral' as const, detail: 'Mixed — some ingredients help, others may irritate.' };
    return { date: t, label: `Scanned ${name}`, type: 'neutral' as const, detail: 'Profile scan completed.' };
  });
  if (!entries.length) entries.push({ date: new Date().toISOString(), label: 'Base profile generated', type: 'neutral', detail: 'Initial assessment recorded.' });
  return entries;
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Reports() {
  const { profile, scans, history } = useAppState();
  const faceId = getFaceId();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setReport(null);
    setError('');
    setLoading(true);
    try {
      const merged = [...history, ...scans];
      const data = await generateReport(faceId, profile || undefined, merged);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  const timeline = buildTimeline(history, scans);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar active="Reports" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[800px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep">Skin Progress Report</h1>
              <p className="text-sm text-gray-mid">AI-powered analysis of what's working, what's not, and what to do next</p>
            </div>
            <BarChart3 size={24} className="text-forest" />
          </div>

          {/* Score gauge / Generate */}
          {report ? (
            <div className="bg-white rounded-2xl p-6 border border-border shadow-sm flex items-center gap-6">
              <div className="relative w-28 h-28 shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#EAE6DF" strokeWidth="8" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#2C5E43" strokeWidth="8"
                    strokeDasharray={`${(report.skin_health_score / 100) * 264} 264`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-deep">{report.skin_health_score}</span>
                  <span className="text-[10px] text-gray-mid uppercase tracking-wider">/ 100</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-deep mb-1">Skin Health Score</h3>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  report.score_trend === 'improving' ? 'text-green-600' :
                  report.score_trend === 'declining' ? 'text-red-500' : 'text-yellow-600'
                }`}>
                  {report.score_trend === 'improving' ? <TrendingUp size={16} /> :
                   report.score_trend === 'declining' ? <TrendingDown size={16} /> : <Activity size={16} />}
                  {report.score_trend === 'improving' ? 'Improving' :
                   report.score_trend === 'declining' ? 'Declining' : 'Stable'}
                </div>
                <p className="text-[11px] text-gray-mid mt-2 leading-relaxed">{report.top_strength}</p>
              </div>
              <button onClick={handleGenerate} disabled={loading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-forest bg-accent/40 rounded-lg hover:bg-accent disabled:opacity-60">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
                {loading ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 border border-border shadow-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-accent/40 flex items-center justify-center mb-4">
                <FileText size={28} className="text-forest" />
              </div>
              <h3 className="text-lg font-semibold text-deep mb-1">Generate Your Report</h3>
              <p className="text-sm text-gray-mid mb-5 max-w-sm">
                Analyze your skin profile and scanned products to get an AI-powered clinical report with health score, what's working, what's not, and how to improve.
              </p>
              {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
              <button onClick={handleGenerate} disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-forest text-white rounded-xl font-medium hover:bg-forest/90 disabled:opacity-60">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          )}

          {/* AI Clinical Insight — What's Working / What's Not / How to Fix */}
          {report && !loading && (
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-forest to-emerald-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={18} className="text-forest" />
                  <h3 className="text-base font-semibold text-deep">AI Clinical Insight</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">What's Working</p>
                    <p className="text-sm text-deep leading-relaxed">{report.top_strength}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">What's Not</p>
                    <p className="text-sm text-deep leading-relaxed">{report.top_weakness}</p>
                  </div>
                  <div className="bg-accent/40 rounded-xl p-4">
                    <p className="text-xs font-semibold text-forest uppercase tracking-wider mb-1">How to Fix</p>
                    <p className="text-sm text-deep leading-relaxed">{report.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-6 border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Clock size={18} className="text-gray-mid" />
              <h3 className="text-base font-semibold text-deep">Timeline</h3>
            </div>
            <div className="space-y-0">
              {timeline.map((entry, i) => (
                <div key={i} className="flex gap-4 pb-4 relative">
                  {i < timeline.length - 1 && <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />}
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                    entry.type === 'positive' ? 'bg-green-100' : entry.type === 'negative' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    {entry.type === 'positive' ? <CheckCircle size={12} className="text-green-600" /> :
                     entry.type === 'negative' ? <AlertTriangle size={12} className="text-red-500" /> :
                     <div className="w-2 h-2 rounded-full bg-gray-mid" />}
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

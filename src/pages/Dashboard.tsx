import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, WifiOff, ScanLine } from 'lucide-react';
import { useAppState } from '../AppContext';
import Sidebar from '../components/Sidebar';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, scanLog, health, checkHealth, loading, userName } = useAppState();

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar active="Scan" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[960px] mx-auto">
          {/* Health banner */}
          {health && health.status !== 'ok' && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
              {health.status === 'offline' ? (
                <WifiOff size={18} className="text-red-500 shrink-0" />
              ) : (
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              )}
              <p className="text-sm text-red-700 flex-1">
                {health.reason || 'Backend is unreachable. AI scans and marketplace will not work.'}
              </p>
              <button
                onClick={checkHealth}
                className="text-sm font-medium text-red-700 hover:text-red-800 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-red-200"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {/* Top bar */}
          <div className="flex justify-end items-center gap-2 mb-8">
            <button className="p-2 rounded-lg hover:bg-white transition-colors" aria-label="Notifications">
              <svg className="w-5 h-5 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </button>
          </div>

          {/* Greeting */}
          {loading ? (
            <div className="space-y-3 mb-8">
              <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
            </div>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-deep mb-1">{greeting()}, {profile ? 'Welcome back' : userName.split(' ')[0]}.</h2>
              <p className="text-gray-mid mb-8">{profile ? 'Ready for another scan?' : 'Scan your skin to get started.'}</p>
            </>
          )}

          {/* Scan grid */}
          <div className="grid grid-cols-2 gap-6 mb-10">
            <ScanCard
              icon="🔬"
              title="Scan Your Skin"
              subtitle="Upload a photo for AI analysis"
              action={profile ? `Profile saved · ${profile.skin_type} skin` : 'NEW SCAN →'}
              onClick={() => navigate('/scan-skin')}
            />
            <ScanCard
              icon="🏷️"
              title="Scan a Product"
              subtitle="Analyze any product's ingredients"
              action="NEW SCAN →"
              onClick={() => navigate('/scan-product')}
            />
          </div>

          {/* Scan log */}
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-deep">Activity Log</h3>
                <span className="text-xs text-gray-mid">{scanLog.length} scan{scanLog.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-2 mb-10">
                {scanLog.length > 0 ? scanLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
                    onClick={() => {
                      if (entry.type === 'product' && entry.data) navigate('/result', { state: { scan: entry.data } });
                      if (entry.type === 'skin') navigate('/profile');
                    }}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      entry.type === 'skin' ? 'bg-blue-100' :
                      entry.verdict?.toLowerCase() === 'good match' ? 'bg-green-100' :
                      entry.verdict?.toLowerCase() === 'not a good match' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {entry.type === 'skin' ? <ScanLine size={14} className="text-blue-600" /> :
                       entry.verdict?.toLowerCase() === 'good match' ? <span className="text-green-600 text-xs">✓</span> :
                       entry.verdict?.toLowerCase() === 'not a good match' ? <span className="text-red-500 text-xs">✗</span> :
                       <span className="text-gray-500 text-xs">•</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-deep truncate">{entry.label}</p>
                      <p className="text-xs text-gray-mid truncate">{entry.detail}</p>
                    </div>
                    <span className="text-xs text-gray-mid shrink-0">{timeAgo(entry.timestamp)}</span>
                  </div>
                )) : (
                  <p className="text-gray-mid text-sm">No scans yet. Scan your skin or a product above.</p>
                )}
              </div>
            </>
          )}

          {/* CTA banner */}
          <div className="bg-forest rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-white text-lg font-semibold">Find your perfect match</p>
              <p className="text-white/70 text-sm">Personalized product recommendations based on your skin profile.</p>
            </div>
            <button onClick={() => navigate('/marketplace')} className="bg-white/15 hover:bg-white/25 text-white rounded-xl p-3 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l.647 3.857M5 3H3m2 0h2m0 0l.647 3.857M7 6.857L5 3m2 3.857l3 3m0 0l-3 3m3-3H4m15-6l.647 3.857M19 3h-2m2 0h2m0 0l.647 3.857M19 6.857L19 3m0 3.857l-3 3m0 0l3 3m-3-3h6" /></svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ScanCard({ icon, title, subtitle, action, onClick }: {
  icon: string; title: string; subtitle: string; action: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl p-6 border border-border text-left hover:shadow-md transition-shadow group">
      <div className="w-12 h-12 rounded-full bg-forest/10 flex items-center justify-center text-xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-deep mb-1">{title}</h3>
      <p className="text-sm text-gray-mid mb-4">{subtitle}</p>
      <span className={`text-sm font-medium ${action.includes('NEW') ? 'text-forest group-hover:underline' : 'text-gray-mid'}`}>{action}</span>
    </button>
  );
}

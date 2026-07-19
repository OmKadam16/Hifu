import { useNavigate } from 'react-router-dom';
import { Eye, Target, Ban, Quote, MapPin, ScanLine, RefreshCw, Leaf, Clock } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAppState } from '../AppContext';

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function detectType(region: string): string {
  const r = region.toLowerCase();
  if (r.includes('acne') || r.includes('pimple') || r.includes('breakout') || r.includes('blemish')) return 'acne';
  if (r.includes('redness') || r.includes('red') || r.includes('irritat') || r.includes('rosacea')) return 'redness';
  if (r.includes('pigment') || r.includes('dark spot') || r.includes('hyper')) return 'pigment';
  return 'scar';
}

function parseRegions(regions: string[]): { label: string; cx: number; cy: number }[] {
  const known: Record<string, [number, number]> = {
    'forehead': [60, 30],
    'left cheek': [40, 70],
    'right cheek': [80, 70],
    'chin': [60, 105],
    'nose': [60, 55],
    'left temple': [28, 40],
    'right temple': [92, 40],
    'under eye': [48, 50],
    'jawline': [60, 95],
  };
  return regions.map((r, i) => {
    const key = r.toLowerCase().replace(/^(small |large )/, '').trim();
    const coord = known[key] || [50 + (i % 3) * 15, 40 + (i % 4) * 18];
    return { label: `Z${i + 1}`, cx: coord[0], cy: coord[1] };
  });
}

export default function Profile() {
  const navigate = useNavigate();
  const { profile, loading, scanPhoto } = useAppState();

  if (loading) {
    return (
      <div className="flex min-h-screen bg-cream">
        <Sidebar active="Profile" />
        <main className="flex-1 p-8">
          <div className="max-w-[1000px] mx-auto space-y-6">
            <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
            <div className="grid grid-cols-[1fr_1.15fr] gap-6">
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl animate-pulse" />)}
              </div>
              <div className="h-96 bg-gray-200 rounded-2xl animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen bg-cream">
        <Sidebar active="Profile" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl p-8 border border-border max-w-md w-full text-center">
            <div className="text-5xl mb-4">🔬</div>
            <h2 className="text-xl font-bold text-deep mb-2">No Profile Yet</h2>
            <p className="text-gray-mid mb-6">Scan your skin first to create your skin profile.</p>
            <button onClick={() => navigate('/scan-skin')} className="bg-forest text-white px-6 py-2.5 rounded-xl font-medium hover:bg-forest/90 transition-colors">
              Scan Your Skin
            </button>
          </div>
        </main>
      </div>
    );
  }

  const regions = parseRegions(profile.scar_regions || []);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar active="Profile" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1000px] mx-auto space-y-6">
          {/* Hero Banner */}
          <div className="relative bg-accent/60 rounded-2xl p-7 overflow-hidden">
            <div className="relative z-10">
              <span className="inline-block bg-deep/80 text-white text-[11px] font-semibold px-3 py-1 rounded-full mb-3">
                Skin Analysis
              </span>
              <h2 className="text-3xl font-bold text-deep mb-1 capitalize">{profile.skin_type} skin</h2>
              <p className="text-sm text-gray-mid flex items-center gap-1.5">
                <Clock size={14} /> Scanned {timeAgo(profile.scanned_at)}
              </p>
            </div>
            <Leaf size={48} className="absolute bottom-3 right-5 text-forest/15" />
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-[1fr_1.15fr] gap-6">
            {/* Left column */}
            <div className="space-y-4">
              {/* Visible Conditions */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={18} className="text-gray-mid" />
                  <h3 className="text-sm font-semibold text-deep">Visible Conditions</h3>
                </div>
                {profile.visible_conditions?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.visible_conditions.map((c: string) => (
                      <span key={c} className="bg-accent/40 text-forest text-xs font-medium px-3 py-1 rounded-full">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-mid">No conditions detected.</p>
                )}
              </div>

              {/* Look for in Products */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={18} className="text-gray-mid" />
                  <h3 className="text-sm font-semibold text-deep">Look for in Products</h3>
                </div>
                {profile.helpful_ingredient_categories?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.helpful_ingredient_categories.map((ing: string) => (
                      <span key={ing} className="bg-forest text-white text-xs font-medium px-3 py-1 rounded-full">
                        {ing}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-mid">No recommendations yet.</p>
                )}
              </div>

              {/* Better to Avoid */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Ban size={18} className="text-gray-mid" />
                  <h3 className="text-sm font-semibold text-deep">Better to Avoid</h3>
                </div>
                {profile.avoid_ingredient_categories?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.avoid_ingredient_categories.map((a: string) => (
                      <span key={a} className="bg-gray-100 text-gray-mid text-xs font-medium px-3 py-1 rounded-full">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-mid">No restrictions noted.</p>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-border flex flex-col">
              {/* Personal Goals */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={18} className="text-gray-mid" />
                  <h3 className="text-sm font-semibold text-deep">Personal Goals</h3>
                </div>
                <div className="bg-cream rounded-xl px-4 py-3 border-l-4 border-forest">
                  <Quote size={14} className="text-gray-mid inline -ml-1 mr-1" />
                  <span className="italic text-deep text-sm font-serif tracking-wide">
                    {profile.stated_goal || 'No goal set'}
                  </span>
                </div>
              </div>

              {/* Scar Regions */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-gray-mid" />
                    <h3 className="text-sm font-semibold text-deep">Detected Scar Regions</h3>
                  </div>
                  <span className="text-xs font-semibold text-forest bg-accent/40 px-2 py-0.5 rounded-full">
                    {regions.length} Zones
                  </span>
                </div>
                {regions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.scar_regions?.map((r: string, i: number) => (
                      <span key={i} className="text-[10px] bg-cream text-deep px-2 py-0.5 rounded-full border border-border">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Live scan photo + heatmap overlay */}
              {scanPhoto ? (
                <div className="relative flex-1 rounded-xl overflow-hidden bg-neutral-900 min-h-[280px]">
                  <img
                    src={scanPhoto}
                    alt="Face scan"
                    className="w-full h-full object-cover opacity-85"
                  />
                  <div className="absolute inset-0 pointer-events-none">
                    {regions.map((z, i) => {
                      const zoneType = detectType(profile.scar_regions?.[i] || '');
                      const zoneColors: Record<string, string> = {
                        acne: 'bg-emerald-400',
                        redness: 'bg-rose-400',
                        pigment: 'bg-violet-400',
                        scar: 'bg-emerald-400',
                      };
                      const color = zoneColors[zoneType] || 'bg-emerald-400';
                      return (
                        <div
                          key={i}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                          style={{ left: `${(z.cx / 120) * 100}%`, top: `${(z.cy / 140) * 100}%` }}
                        >
                          <span className={`absolute inline-flex h-8 w-8 rounded-full ${color} opacity-40 animate-ping`} />
                          <div className={`relative h-5 w-5 rounded-full ${color} border-2 border-white shadow-md flex items-center justify-center`}>
                            <span className="text-[9px] text-white font-bold uppercase">{zoneType[0]}</span>
                          </div>
                          <span className="absolute top-6 bg-neutral-900/80 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                            {z.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-cream rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center min-h-[220px] p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-accent/40 flex items-center justify-center mb-3">
                    <MapPin size={22} className="text-forest" />
                  </div>
                  <p className="text-sm text-gray-mid font-medium">No scan photo available</p>
                  <p className="text-xs text-gray-mid mt-1">Click 'Rescan my skin' below to capture your profile photo.</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom CTAs */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => navigate('/scan-product')}
              className="w-full bg-forest text-white py-3.5 px-6 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-forest/90 transition-colors"
            >
              <ScanLine size={18} />
              Scan a Product with this profile
            </button>
            <button
              onClick={() => navigate('/scan-skin')}
              className="w-full bg-white text-forest py-3.5 px-6 rounded-2xl font-medium border-2 border-forest flex items-center justify-center gap-2 hover:bg-cream transition-colors"
            >
              <RefreshCw size={18} />
              Rescan my skin
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

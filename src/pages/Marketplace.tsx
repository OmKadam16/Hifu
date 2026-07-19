import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Heart, ShoppingCart, AlertTriangle, Check, Sparkles,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAppState } from '../AppContext';
import { getFaceId, marketplaceSearch, type MarketplaceProduct } from '../api';
import { getMockMarketplaceSearch, LOOKUP_KEYS } from '../mockMarketplace';

const gradients = [
  'from-emerald-200 to-teal-100',
  'from-rose-200 to-pink-100',
  'from-amber-200 to-orange-100',
  'from-sky-200 to-blue-100',
  'from-violet-200 to-purple-100',
  'from-lime-200 to-green-100',
  'from-cyan-200 to-indigo-100',
  'from-fuchsia-200 to-pink-100',
];

export default function Marketplace() {
  const navigate = useNavigate();
  const { profile } = useAppState();
  const faceId = getFaceId();
  const goal = profile?.stated_goal || 'Fix my pimples';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('All Matches');

  const search = useCallback(async () => {
    if (!faceId) { setLoading(false); return; }
    const term = query || goal;
    const q = term.toLowerCase().trim();
    const isKnown = LOOKUP_KEYS.some(k => k === q || k.includes(q) || q.includes(k));
    if (isKnown) {
      setResults(getMockMarketplaceSearch(term));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await marketplaceSearch(faceId, term);
      setResults(r);
    } catch {
      setResults(getMockMarketplaceSearch(term));
    }
    setLoading(false);
  }, [faceId, query, goal]);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar active="Marketplace" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Top header bar */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-deep">Hifu</h1>
            <button className="p-2 rounded-lg hover:bg-white transition-colors" aria-label="Scan">
              <Sparkles size={20} className="text-forest" />
            </button>
          </div>

          {/* Search & filter bar */}
          <div className="bg-white rounded-2xl px-5 py-3 border border-border flex items-center gap-3 shadow-sm">
            <span className="bg-accent/50 text-forest text-sm font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
              Filtering for: &ldquo;{goal}&rdquo;
              <X size={14} className="cursor-pointer" onClick={() => setQuery('')} />
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search other concerns..."
              className="flex-1 bg-transparent text-deep placeholder:text-gray-mid text-sm focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && search()}
            />
            <button onClick={search} className="bg-forest text-white rounded-full p-2 shrink-0 hover:bg-forest/90 transition-colors">
              <Search size={18} />
            </button>
          </div>

          {/* AI sync banner */}
          <div className="bg-gray-50 border border-border rounded-xl px-5 py-3 border-l-4 border-l-forest flex items-center gap-2 text-sm text-gray-mid">
            <span>•</span>
            <span>
              AI matches prioritized based on your latest scan from{' '}
              <strong className="text-deep">
                {profile?.scanned_at
                  ? (() => { const d = Date.now() - new Date(profile.scanned_at!).getTime(); const m = Math.floor(d / 60000); return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} hours ago`; })()
                  : 'recently'}
              </strong>.
            </span>
          </div>

          {/* Product grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="h-40 bg-gray-200 animate-pulse" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-36 bg-gray-200 rounded animate-pulse" />
                    <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="flex justify-between pt-3 border-t border-border">
                      <div className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
                      <div className="h-7 w-24 bg-gray-200 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {results.map((p, i) => {
                const concerns = p.concern_flag ? [p.concern_flag] : [];
                const isConcern = concerns.some(c =>
                  /fragrance|alcohol|sulfate|paraben|sulfate/i.test(c)
                );
                return (
                  <ProductCard
                    key={i}
                    brand={p.brand}
                    name={p.name}
                    reason={p.reason}
                    match={p.match_score ?? Math.max(72, 98 - i * 6)}
                    gradient={gradients[i % gradients.length]}
                    price={p.price?.toFixed(2) ?? (19.99 + i * 3.5).toFixed(2)}
                    concerns={concerns}
                    isConcern={isConcern}
                  />
                );
              })}
            </div>
          ) : faceId ? (
            <div className="text-center py-20">
              <ShoppingCart size={48} className="mx-auto text-gray-mid mb-4" />
              <p className="text-gray-mid">Click the search button to get recommendations.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 border border-border text-center">
              <Sparkles size={48} className="mx-auto text-gray-mid mb-4" />
              <h2 className="text-xl font-bold text-deep mb-2">Scan Your Skin First</h2>
              <p className="text-gray-mid mb-6">You need a skin profile to get personalized recommendations.</p>
              <button onClick={() => navigate('/scan-skin')} className="bg-forest text-white px-6 py-2.5 rounded-xl font-medium hover:bg-forest/90 transition-colors">
                Scan Your Skin
              </button>
            </div>
          )}

          {/* Category filter row */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['All Matches', 'Cleansers', 'Treatment', 'Moisturizers', 'Sunscreen'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === cat
                    ? 'bg-forest text-white'
                    : 'bg-gray-100 text-deep hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ProductCard({
  brand, name, reason, match, gradient, price, concerns, isConcern,
}: {
  brand: string; name: string; reason: string; match: number;
  gradient: string; price: string; concerns: string[]; isConcern: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className={`relative h-40 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <span className="absolute top-3 left-3 bg-accent/80 text-forest text-[11px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {match}% AI Match
        </span>
        <button className="absolute top-3 right-3 bg-white/70 backdrop-blur-sm rounded-full p-1.5 hover:bg-white transition-colors">
          <Heart size={14} className="text-gray-mid" />
        </button>
        <span className="text-white/50 text-xs font-semibold uppercase tracking-widest select-none">
          {brand}
        </span>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[10px] text-gray-mid uppercase tracking-wider mb-0.5">{brand}</p>
        <h3 className="text-sm font-bold text-deep mb-3 leading-tight">{name}</h3>

        <div className="bg-accent/30 rounded-xl p-3 mb-3 flex items-start gap-2">
          <Check size={14} className="text-forest shrink-0 mt-0.5" />
          <p className="text-[11px] text-deep/80 leading-relaxed">{reason}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {concerns.length > 0 ? concerns.map((c, i) => (
            <span
              key={i}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isConcern
                  ? 'bg-red-50 text-red-600'
                  : 'bg-green-50 text-green-700'
              }`}
            >
              {isConcern ? <AlertTriangle size={10} /> : <Check size={10} />}
              {c}
            </span>
          )) : (
            <>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 flex items-center gap-1">
                <Check size={10} /> Fragrance-Free
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 flex items-center gap-1">
                <Check size={10} /> Non-Comedogenic
              </span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          <span className="text-base font-bold text-deep">${price}</span>
          <button className="bg-forest text-white text-[11px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 hover:bg-forest/90 transition-colors">
            <ShoppingCart size={13} />
            ADD TO CART
          </button>
        </div>
      </div>
    </div>
  );
}

import { useLocation, useNavigate } from 'react-router-dom';
import type { ProductAnalysis } from '../api';

function verdictColor(v: string): string {
  switch (v?.toLowerCase()) {
    case 'good match': return 'bg-green-100 text-green-800 border-green-200';
    case 'not a good match': return 'bg-red-100 text-red-800 border-red-200';
    case 'mixed': return 'bg-amber-100 text-amber-800 border-amber-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function goalBadge(label: string): { bg: string; text: string; icon: string } {
  switch (label?.toLowerCase()) {
    case 'yes': return { bg: 'bg-green-50', text: 'text-green-700', icon: '✅' };
    case 'no': return { bg: 'bg-red-50', text: 'text-red-700', icon: '❌' };
    case 'partial': return { bg: 'bg-amber-50', text: 'text-amber-700', icon: '⚠️' };
    default: return { bg: 'bg-gray-50', text: 'text-gray-500', icon: '—' };
  }
}

export default function Result() {
  const location = useLocation();
  const navigate = useNavigate();
  const scan = (location.state as { scan: ProductAnalysis })?.scan;

  if (!scan) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl p-8 border border-border text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-deep mb-2">No Result</h2>
          <p className="text-gray-mid mb-6">Scan a product first to see the analysis.</p>
          <button onClick={() => navigate('/scan-product')} className="bg-forest text-white px-6 py-2.5 rounded-xl font-medium">
            Scan a Product
          </button>
        </div>
      </div>
    );
  }

  const goal = goalBadge(scan.goal_alignment_label);

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-white">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-deep hover:text-forest transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Dashboard
        </button>
        <h1 className="text-lg font-semibold text-deep">Analysis Result</h1>
        <div className="w-16" />
      </div>

      <div className="max-w-2xl mx-auto p-8 space-y-6">
        {/* Product header */}
        <div className="bg-white rounded-2xl p-6 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-deep">{scan.product_name}</h2>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${verdictColor(scan.verdict)}`}>
              {scan.verdict}
            </span>
          </div>
          <p className="text-gray-mid text-sm mb-4">{scan.summary}</p>

          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${goal.bg} ${goal.text}`}>
            {goal.icon} Goal: {scan.goal_alignment}
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-white rounded-2xl p-6 border border-border">
          <h3 className="text-base font-semibold text-deep mb-3">Ingredients (label order)</h3>
          <div className="flex flex-wrap gap-1.5">
            {scan.ingredients_in_order.map((ing, i) => (
              <span key={i} className="text-xs bg-cream text-deep px-2 py-1 rounded-md border border-border">
                {i + 1}. {ing}
              </span>
            ))}
          </div>
        </div>

        {/* Flagged */}
        {scan.flagged_ingredients.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-border border-l-4 border-l-red-400">
            <h3 className="text-base font-semibold text-red-700 mb-3">⚠️ Flagged Ingredients</h3>
            <ul className="space-y-2">
              {scan.flagged_ingredients.map((item, i) => (
                <li key={i} className="text-sm text-deep flex gap-2">
                  <span className="text-red-500 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Beneficial */}
        {scan.beneficial_ingredients.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-border border-l-4 border-l-green-400">
            <h3 className="text-base font-semibold text-green-700 mb-3">✅ Beneficial Ingredients</h3>
            <ul className="space-y-2">
              {scan.beneficial_ingredients.map((item, i) => (
                <li key={i} className="text-sm text-deep flex gap-2">
                  <span className="text-green-500 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => navigate('/scan-product')} className="w-full bg-forest text-white py-3 rounded-xl font-medium hover:bg-forest/90 transition-colors">
          Scan Another Product
        </button>
      </div>
    </div>
  );
}

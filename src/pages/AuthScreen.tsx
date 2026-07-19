import { useState } from 'react';
import { LogIn, UserPlus, Leaf, Loader2 } from 'lucide-react';

interface Props {
  onAuthSuccess: (faceId: string, name: string) => void;
}

export default function AuthScreen({ onAuthSuccess }: Props) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
    const payload = isSignUp ? { email, password, name } : { email, password };
    try {
      const res = await fetch(`${BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) throw new Error(data.error || `Server error (${res.status})`);
      localStorage.setItem('hifu_session_token', data.token);
      localStorage.setItem('hifu_face_id', data.face_id);
      localStorage.setItem('hifu_user_name', data.name || name || 'User');
      onAuthSuccess(data.face_id, data.name || name || 'User');
    } catch (err: any) {
      setError(err.message || 'Network error — is the backend running on port 8000?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Accent top header */}
        <div className="bg-forest rounded-t-2xl px-8 py-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Leaf size={22} className="text-white/80" />
            <h1 className="text-xl font-bold text-white tracking-tight">Hifu AI</h1>
          </div>
          <p className="text-white/50 text-xs tracking-widest uppercase">Clinical Naturalism</p>
        </div>

        {/* Auth card body */}
        <div className="bg-white rounded-b-2xl shadow-sm border-x border-b border-border px-8 py-8">
          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-cream rounded-xl p-1 mb-7">
            <button
              onClick={() => { setIsSignUp(false); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                !isSignUp ? 'bg-white text-deep shadow-sm' : 'text-gray-mid hover:text-deep'
              }`}
            >
              <LogIn size={15} />
              Sign In
            </button>
            <button
              onClick={() => { setIsSignUp(true); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSignUp ? 'bg-white text-deep shadow-sm' : 'text-gray-mid hover:text-deep'
              }`}
            >
              <UserPlus size={15} />
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="text-xs font-medium text-gray-mid mb-1.5 block">Full Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-deep placeholder:text-gray-mid/60 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-mid mb-1.5 block">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-deep placeholder:text-gray-mid/60 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-mid mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 4 characters"
                required
                minLength={4}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-deep placeholder:text-gray-mid/60 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-forest text-white py-3 rounded-xl font-medium hover:bg-forest/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />
              )}
              {loading
                ? 'Processing...'
                : isSignUp
                  ? 'Initialize New Profile'
                  : 'Access Profile'
              }
            </button>
          </form>

          {/* Switch mode */}
          <p className="text-center text-xs text-gray-mid mt-6">
            {isSignUp ? 'Already have a profile?' : 'New here?'}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-forest font-medium hover:underline"
            >
              {isSignUp ? 'Sign in instead' : 'Create a profile'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

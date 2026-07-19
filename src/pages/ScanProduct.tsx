import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { analyzeProduct, getFaceId } from '../api';
import { useAppState } from '../AppContext';

export default function ScanProduct() {
  const navigate = useNavigate();
  const { profile, addScan } = useAppState();
  const faceId = getFaceId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const scan = async (f: File) => {
    setLoading(true);
    try {
      const result = await analyzeProduct(f, profile ?? undefined, faceId || undefined);
      addScan(result);
      navigate('/result', { state: { scan: result } });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-white">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-deep hover:text-forest transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Dashboard
        </button>
        <h1 className="text-lg font-semibold text-deep">Scan a Product</h1>
        <div className="w-16" />
      </div>

      <div className="max-w-lg mx-auto p-8 text-center">
        {!profile ? (
          <div className="bg-white rounded-2xl p-8 border border-border">
            <div className="w-16 h-16 bg-accent/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-forest" />
            </div>
            <h2 className="text-xl font-bold text-deep mb-2">Scan Your Skin First</h2>
            <p className="text-gray-mid mb-6">We need your skin profile to analyze products against it.</p>
            <button onClick={() => navigate('/scan-skin')} className="bg-forest text-white px-6 py-2.5 rounded-xl font-medium hover:bg-forest/90 transition-colors">
              Scan Your Skin
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-border p-8">
              <div className="w-14 h-14 bg-accent/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Upload size={24} className="text-forest" />
              </div>
              <p className="text-deep font-medium mb-1">Upload label photo</p>
              <p className="text-sm text-gray-mid mb-5">{file ? file.name : 'From your gallery'}</p>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="border-2 border-forest text-forest px-6 py-2.5 rounded-xl font-medium hover:bg-forest/5 disabled:opacity-50 transition-colors"
              >
                {file ? 'Change Photo' : 'Choose File'}
              </button>
            </div>
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

            <button
              onClick={() => file && scan(file)}
              disabled={!file || loading}
              className="w-full bg-forest text-white py-3 rounded-xl font-medium hover:bg-forest/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {loading ? 'Analyzing...' : 'Analyze Product'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

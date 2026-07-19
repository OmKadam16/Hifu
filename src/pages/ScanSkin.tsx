import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload } from 'lucide-react';
import { assessSkin, getFaceId } from '../api';
import { useAppState } from '../AppContext';
import LiveCameraScanner from '../components/LiveCameraScanner';

export default function ScanSkin() {
  const navigate = useNavigate();
  const { setProfile, setScanPhoto } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const scan = async (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setScanPhoto(dataUrl);
      doScan(f, dataUrl);
    };
    reader.onerror = () => { alert('Failed to read image'); };
    reader.readAsDataURL(f);
  };

  const handleCapture = async (f: File) => {
    setCameraOpen(false);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setScanPhoto(dataUrl);
      doScan(f, dataUrl);
    };
    reader.readAsDataURL(f);
  };

  async function doScan(f: File, dataUrl: string) {
    setLoading(true);
    try {
      const existingId = getFaceId() || undefined;
      const { data } = await assessSkin(f, goal, existingId);
      setProfile(data);
      navigate('/profile');
    } catch (e: any) {
      setScanPhoto(null);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="min-h-screen bg-cream">
        <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-white">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-deep hover:text-forest transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </button>
          <h1 className="text-lg font-semibold text-deep">Scan Your Skin</h1>
          <div className="w-16" />
        </div>

        <div className="max-w-lg mx-auto p-8 text-center space-y-4">
          {/* Camera option */}
          <div className="bg-white rounded-2xl border border-border p-8">
            <div className="w-14 h-14 bg-accent/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Camera size={24} className="text-forest" />
            </div>
            <p className="text-deep font-medium mb-1">Take a photo</p>
            <p className="text-sm text-gray-mid mb-5">Good lighting, no makeup</p>
            <button
              onClick={() => setCameraOpen(true)}
              disabled={loading}
              className="bg-forest text-white px-6 py-2.5 rounded-xl font-medium hover:bg-forest/90 disabled:opacity-50 transition-colors"
            >
              Open Camera
            </button>
          </div>

          {/* Upload option */}
          <div className="bg-white rounded-2xl border border-border p-8">
            <div className="w-14 h-14 bg-accent/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Upload size={24} className="text-forest" />
            </div>
            <p className="text-deep font-medium mb-1">Upload a photo</p>
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

          <input
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Any skincare goal? (optional)"
            className="w-full px-4 py-3 rounded-xl border border-border bg-white text-deep placeholder:text-gray-mid focus:outline-none focus:ring-2 focus:ring-forest/30"
          />

          <button
            onClick={() => file && scan(file)}
            disabled={!file || loading}
            className="w-full bg-forest text-white py-3 rounded-xl font-medium hover:bg-forest/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {loading ? 'Analyzing...' : 'Analyze My Skin'}
          </button>
        </div>
      </div>

      {cameraOpen && (
        <LiveCameraScanner
          mode="face"
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

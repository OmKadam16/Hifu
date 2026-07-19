import { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';

interface Props {
  mode: 'face' | 'product';
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function LiveCameraScanner({ mode, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    mode === 'face' ? 'user' : 'environment'
  );
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    stopStream();
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      streamRef.current = mediaStream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not access camera.');
      }
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => stopStream();
  }, [facingMode, startCamera, stopStream]);

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || busy || error) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setBusy(false); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `${mode}_scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      }
      setBusy(false);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 text-white z-10">
        <button onClick={onClose} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors">
          <X size={20} />
          <span className="text-sm">Cancel</span>
        </button>
        <span className="text-sm font-medium text-white/60">
          {mode === 'face' ? 'Face Scan' : 'Product Scan'}
        </span>
        <div className="w-20" />
      </div>

      {/* Video container */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Oval guide for face mode */}
        {mode === 'face' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-[22rem] rounded-[50%] border-2 border-white/30" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center z-20">
            <Camera size={48} className="text-white/50 mb-4" />
            <p className="text-white text-lg font-medium mb-2">Camera Unavailable</p>
            <p className="text-white/60 text-sm mb-6">{error}</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors">
                Go Back
              </button>
              <button
                onClick={() => startCamera(facingMode)}
                className="px-6 py-2.5 rounded-xl bg-forest text-white font-medium hover:bg-forest/90 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center px-8 py-8 gap-8">
        <button
          onClick={switchCamera}
          className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          title="Switch camera"
        >
          <RefreshCw size={20} />
        </button>

        <button
          onClick={capture}
          disabled={!!error || busy}
          className="w-20 h-20 rounded-full bg-white p-1.5 disabled:opacity-50 transition-opacity"
        >
          <div className="w-full h-full rounded-full bg-white border-2 border-gray-300" />
        </button>

        <div className="w-12" />
      </div>
    </div>
  );
}

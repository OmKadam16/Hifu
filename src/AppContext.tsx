import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { SkinProfile, ProductAnalysis, ScanHistoryItem, HealthStatus } from './api';
import { getProfile, getHistory, healthCheck } from './api';

interface AppState {
  faceId: string;
  profile: SkinProfile | null;
  scans: ProductAnalysis[];
  history: ScanHistoryItem[];
  loading: boolean;
  health: HealthStatus | null;
  userName: string;
  userPlan: string;
  scanPhoto: string | null;
  setProfile: (p: SkinProfile) => void;
  setScanPhoto: (url: string | null) => void;
  addScan: (s: ProductAnalysis) => void;
  checkHealth: () => Promise<void>;
  init: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

interface AppProviderProps {
  children: ReactNode;
  faceId: string;
  userName: string;
}

export function AppProvider({ children, faceId, userName }: AppProviderProps) {
  const [profile, setProfileState] = useState<SkinProfile | null>(null);
  const [scans, setScans] = useState<ProductAnalysis[]>([]);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [scanPhoto, setScanPhotoState] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setHealth(await healthCheck());
  }, []);

  const init = useCallback(async () => {
    if (faceId) {
      try {
        const [p, h] = await Promise.all([getProfile(faceId), getHistory(faceId)]);
        setProfileState(p);
        setHistory(h);
      } catch { /* not persisted */ }
    }
    await checkHealth();
    setLoading(false);
  }, [faceId, checkHealth]);

  useEffect(() => { init(); }, [init]);

  const setProfile = useCallback((p: SkinProfile) => {
    setProfileState(p);
  }, []);

  const setScanPhoto = useCallback((url: string | null) => {
    setScanPhotoState(url);
  }, []);

  const addScan = useCallback((s: ProductAnalysis) => {
    setScans(prev => [s, ...prev]);
  }, []);

  return (
    <AppContext.Provider value={{
      faceId, profile, scans, history, loading, health, scanPhoto,
      userName, userPlan: 'Free Plan',
      setProfile, setScanPhoto, addScan, checkHealth, init,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be inside AppProvider');
  return ctx;
}

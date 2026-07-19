import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { SkinProfile, ProductAnalysis, ScanHistoryItem, HealthStatus } from './api';
import { getProfile, getHistory, healthCheck } from './api';

export interface LogEntry {
  id: string;
  type: 'skin' | 'product';
  label: string;
  detail: string;
  timestamp: string;
  verdict?: string;
  data?: SkinProfile | ProductAnalysis;
}

interface AppState {
  faceId: string;
  profile: SkinProfile | null;
  scans: ProductAnalysis[];
  history: ScanHistoryItem[];
  scanLog: LogEntry[];
  loading: boolean;
  health: HealthStatus | null;
  userName: string;
  userPlan: string;
  scanPhoto: string | null;
  setProfile: (p: SkinProfile) => void;
  setScanPhoto: (url: string | null) => void;
  addScan: (s: ProductAnalysis) => void;
  addLog: (entry: LogEntry) => void;
  checkHealth: () => Promise<void>;
  init: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const LOG_KEY = 'hifu_scan_log';
const PHOTO_KEY = 'hifu_scan_photo';

function loadLog(): LogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

function saveLog(log: LogEntry[]) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 50))); } catch { /* quota */ }
}

function loadPhoto(): string | null {
  try { return localStorage.getItem(PHOTO_KEY); } catch { return null; }
}

function savePhoto(url: string | null) {
  try {
    if (url) localStorage.setItem(PHOTO_KEY, url);
    else localStorage.removeItem(PHOTO_KEY);
  } catch { /* quota */ }
}

interface AppProviderProps {
  children: ReactNode;
  faceId: string;
  userName: string;
}

export function AppProvider({ children, faceId, userName }: AppProviderProps) {
  const [profile, setProfileState] = useState<SkinProfile | null>(null);
  const [scans, setScans] = useState<ProductAnalysis[]>([]);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [scanLog, setScanLog] = useState<LogEntry[]>(loadLog);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [scanPhoto, setScanPhotoState] = useState<string | null>(loadPhoto);

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
    savePhoto(url);
    setScanPhotoState(url);
  }, []);

  const addScan = useCallback((s: ProductAnalysis) => {
    setScans(prev => [s, ...prev]);
  }, []);

  const addLog = useCallback((entry: LogEntry) => {
    setScanLog(prev => {
      const updated = [entry, ...prev];
      saveLog(updated);
      return updated;
    });
  }, []);

  return (
    <AppContext.Provider value={{
      faceId, profile, scans, history, scanLog, loading, health, scanPhoto,
      userName, userPlan: 'Free Plan',
      setProfile, setScanPhoto, addScan, addLog, checkHealth, init,
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

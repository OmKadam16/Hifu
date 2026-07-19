import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './AppContext';
import { isAuthenticated } from './api';
import AuthScreen from './pages/AuthScreen';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Marketplace from './pages/Marketplace';
import Reports from './pages/Reports';
import ScanSkin from './pages/ScanSkin';
import ScanProduct from './pages/ScanProduct';
import Result from './pages/Result';

function MainApp({ faceId, userName }: { faceId: string; userName: string }) {
  return (
    <AppProvider faceId={faceId} userName={userName}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/scan-skin" element={<ScanSkin />} />
        <Route path="/scan-product" element={<ScanProduct />} />
        <Route path="/result" element={<Result />} />
      </Routes>
    </AppProvider>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<{ faceId: string; name: string } | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      const fid = localStorage.getItem('hifu_face_id') || '';
      const name = localStorage.getItem('hifu_user_name') || 'User';
      setAuthed({ faceId: fid, name });
    }
  }, []);

  if (!authed) {
    return (
      <AuthScreen
        onAuthSuccess={(faceId, name) => setAuthed({ faceId, name })}
      />
    );
  }

  return (
    <BrowserRouter>
      <MainApp faceId={authed.faceId} userName={authed.name} />
    </BrowserRouter>
  );
}

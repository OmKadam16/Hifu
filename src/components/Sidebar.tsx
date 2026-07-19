import { useNavigate } from 'react-router-dom';
import { ScanLine, User, Store, BarChart3, LogOut } from 'lucide-react';
import { clearAuth } from '../api';
import { useAppState } from '../AppContext';

const navItems = [
  { label: 'Scan', icon: ScanLine, route: '/' },
  { label: 'Profile', icon: User, route: '/profile' },
  { label: 'Marketplace', icon: Store, route: '/marketplace' },
  { label: 'Reports', icon: BarChart3, route: '/reports' },
];

export default function Sidebar({ active }: { active: string }) {
  const navigate = useNavigate();
  const { userName, userPlan } = useAppState();
  const initial = userName.charAt(0).toUpperCase();

  return (
    <aside className="w-[280px] min-w-[280px] bg-white border-r border-border flex flex-col p-6 h-screen sticky top-0">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-deep tracking-tight">Hifu AI</h1>
        <p className="text-sm text-gray-mid mt-0.5">Clinical Naturalism</p>
      </div>
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map(({ label, icon: Icon, route }) => (
          <button
            key={label}
            onClick={() => navigate(route)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors ${
              active === label
                ? 'bg-accent text-forest font-semibold'
                : 'text-deep hover:bg-cream'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3 pt-6 border-t border-border">
        <div className="w-10 h-10 rounded-full bg-forest text-white flex items-center justify-center text-sm font-semibold">{initial}</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-deep">{userName}</p>
          <p className="text-xs text-gray-mid">{userPlan}</p>
        </div>
        <button
          onClick={() => { clearAuth(); window.location.reload(); }}
          className="p-2 rounded-lg text-gray-mid hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

import { ReactNode } from 'react';
import { useLocation } from 'wouter';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuthStore } from '@/stores/useAuthStore';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const { signOut } = useAuthStore();

  const handleLogout = async () => {
    await signOut();
    setLocation('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar currentPath={location} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

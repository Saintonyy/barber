import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  MessageCircle,
  Users,
  Scissors,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  User,
} from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentPath: string;
  onLogout?: () => void;
}

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard', id: 'dashboard' },
  { icon: Calendar, label: 'Citas', href: '/appointments', id: 'appointments' },
  { icon: MessageCircle, label: 'Mensajes', href: '/conversations', id: 'conversations' },
  { icon: Users, label: 'Clientes', href: '/clients', id: 'clients' },
  { icon: Scissors, label: 'Servicios', href: '/services', id: 'services' },
  { icon: User, label: 'Barberos', href: '/barbers', id: 'barbers' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics', id: 'analytics' },
  { icon: Settings, label: 'Configuración', href: '/settings', id: 'settings' },
];

export default function Sidebar({ currentPath, onLogout }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => currentPath === href;

  const sidebarVariants = {
    hidden: { x: -300, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.05, duration: 0.15 },
    }),
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 hover:bg-secondary rounded-md transition-colors"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:relative z-40 w-64 h-screen bg-sidebar border-r border-sidebar-border',
          'flex flex-col overflow-y-auto',
          'lg:translate-x-0 transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-md flex items-center justify-center">
              <Scissors size={24} className="text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-lg text-foreground">BARBERAGENT</h1>
              <p className="text-xs text-muted-foreground">OS Conversacional</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
                <motion.div
                key={item.id}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                className="w-full"
              >
                <Link href={item.href}>
                  <a
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-150',
                      'hover:bg-sidebar-accent/10',
                      active
                        ? 'bg-sidebar-accent/20 border-l-2 border-sidebar-accent text-accent'
                        : 'text-sidebar-foreground'
                    )}
                  >
                    <Icon size={20} />
                    <span className="font-sans font-medium text-sm">{item.label}</span>
                  </a>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-destructive hover:bg-destructive/10 transition-colors duration-150"
          >
            <LogOut size={20} />
            <span className="font-sans font-medium text-sm">Salir</span>
          </button>
        </div>
      </aside>
    </>
  );
}

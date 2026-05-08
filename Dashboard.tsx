import { motion } from 'framer-motion';
import {
  Calendar,
  MessageCircle,
  Users,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { useLocation } from 'wouter';
import DashboardLayout from '@/components/DashboardLayout';
import KPICard from '@/components/KPICard';
import AppointmentCard from '@/components/AppointmentCard';
import { Button } from '@/components/ui/button';
import { useDashboardStats, useTodayAppointments, useBarbers, useConversations } from '@/hooks/useSupabaseData';
import { useAuthStore } from '@/stores/useAuthStore';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { profile } = useAuthStore();
  const { data: stats, loading: statsLoading } = useDashboardStats();
  const { data: appointments, loading: aptsLoading } = useTodayAppointments();
  const { data: barbers, loading: barbersLoading } = useBarbers();
  const { data: conversations, loading: convsLoading } = useConversations();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  // Get upcoming appointments (next 3)
  const upcomingAppointments = (appointments || [])
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .slice(0, 5);

  // Active conversations (last 3)
  const activeConversations = (conversations || [])
    .filter((c) => c.status === 'active')
    .slice(0, 3);

  // Unconfirmed appointments for alerts
  const unconfirmedAppointments = (appointments || [])
    .filter((a) => a.status === 'scheduled');

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTimeRange = (isoString: string, durationMinutes: number) => {
    const start = new Date(isoString);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    return `${formatTime(isoString)} - ${end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getRelativeTime = (isoString: string | null) => {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `hace ${hours}h`;
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 space-y-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-2"
        >
          <h1 className="font-mono font-bold text-3xl text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            {profile ? `Hola, ${profile.name}` : 'Estado operacional de tu barbería en tiempo real'}
          </p>
        </motion.div>

        {/* KPI Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <motion.div variants={itemVariants}>
            <KPICard
              icon={Calendar}
              label="Citas hoy"
              value={statsLoading ? '...' : (stats?.today_appointments ?? 0)}
              variant="accent"
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard
              icon={MessageCircle}
              label="Conversaciones activas"
              value={statsLoading ? '...' : (stats?.active_conversations ?? 0)}
              variant="default"
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard
              icon={DollarSign}
              label="Ingresos hoy"
              value={statsLoading ? '...' : `$${Number(stats?.today_revenue ?? 0).toLocaleString()}`}
              variant="success"
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard
              icon={Users}
              label="Clientes totales"
              value={statsLoading ? '...' : (stats?.total_clients ?? 0)}
              variant="default"
            />
          </motion.div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Appointments & Conversations */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-2 space-y-8"
          >
            {/* Próximas Citas */}
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-mono font-bold text-lg text-foreground">Próximas citas</h2>
                <button
                  onClick={() => setLocation('/appointments')}
                  className="text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3">
                {aptsLoading ? (
                  <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground">Cargando citas...</p>
                  </div>
                ) : upcomingAppointments.length === 0 ? (
                  <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground">No hay citas programadas para hoy</p>
                  </div>
                ) : (
                  upcomingAppointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      id={apt.id}
                      clientName={apt.client_name}
                      barberName={apt.barber_name}
                      service={apt.service_name}
                      time={formatTimeRange(apt.scheduled_at, apt.duration_minutes)}
                      status={apt.status as any}
                    />
                  ))
                )}
              </div>
            </motion.div>

            {/* Conversaciones Activas */}
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-mono font-bold text-lg text-foreground">Conversaciones activas</h2>
                <button
                  onClick={() => setLocation('/conversations')}
                  className="text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  Ver todas
                </button>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                {convsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
                ) : activeConversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay conversaciones activas</p>
                ) : (
                  activeConversations.map((conv, i) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      className="flex items-start justify-between pb-3 border-b border-border/50 last:border-0 last:pb-0 cursor-pointer hover:bg-secondary/30 -mx-4 px-4 py-2 rounded transition-colors"
                      onClick={() => setLocation('/conversations')}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{conv.client_name}</p>
                          {conv.unread_count > 0 && (
                            <span className="bg-accent text-accent-foreground text-xs px-1.5 py-0.5 rounded-full">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{conv.client_phone}</p>
                      </div>
                      <p className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                        {getRelativeTime(conv.last_message_at)}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Status & Alerts */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Estado de Barberos */}
            <motion.div variants={itemVariants} className="space-y-4">
              <h2 className="font-mono font-bold text-lg text-foreground">Estado de barberos</h2>
              <div className="space-y-2">
                {barbersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
                ) : !barbers || barbers.length === 0 ? (
                  <div className="bg-card border border-border rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">No hay barberos registrados</p>
                    <button
                      onClick={() => setLocation('/barbers')}
                      className="text-xs text-accent mt-2 hover:text-accent/80"
                    >
                      Agregar barberos
                    </button>
                  </div>
                ) : (
                  barbers.map((barber, i) => (
                    <motion.div
                      key={barber.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{barber.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{barber.status}</p>
                      </div>
                      <div
                        className={`w-3 h-3 rounded-full ${
                          barber.status === 'online' || barber.status === 'available'
                            ? 'bg-green-500'
                            : barber.status === 'busy'
                              ? 'bg-yellow-500'
                              : barber.status === 'break'
                                ? 'bg-orange-500'
                                : 'bg-gray-500'
                        }`}
                      />
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>

            {/* Alertas */}
            {unconfirmedAppointments.length > 0 && (
              <motion.div variants={itemVariants} className="space-y-4">
                <h2 className="font-mono font-bold text-lg text-foreground">Alertas</h2>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3">
                  {unconfirmedAppointments.slice(0, 3).map((apt) => (
                    <div key={apt.id} className="flex gap-3">
                      <AlertCircle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Cita sin confirmar</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.client_name} - {formatTime(apt.scheduled_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Quick Actions */}
            <motion.div variants={itemVariants} className="space-y-2">
              <Button
                onClick={() => setLocation('/appointments')}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-medium"
              >
                Nueva cita
              </Button>
              <Button
                onClick={() => setLocation('/analytics')}
                variant="outline"
                className="w-full border-border text-foreground hover:bg-secondary"
              >
                Ver reportes
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}

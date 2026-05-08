/**
 * useAppointmentsPage
 * Master orchestration hook for the Appointments page
 *
 * Responsibilities:
 * - Fetch appointments for selected date
 * - Fetch barbers
 * - Fetch slot availability (with lock status)
 * - Create / update / cancel appointments
 * - Subscribe to realtime changes (appointments + locks)
 * - Bridge all changes into EventBus → Zustand
 *
 * Architecture:
 *   Supabase (data + realtime) → this hook → Zustand stores → UI
 *   UI actions → this hook → Supabase mutations → optimistic update
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAppointmentsStore } from '@/stores/useRealtimeStores';
import { useAppointmentLocksStore, SlotStatus } from '@/stores/useAppointmentLocksStore';
import { eventBus, Events } from '@/lib/events/EventBus';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Domain Types
// ============================================================================

export interface AppointmentDetail {
  id: string;
  tenant_id: string;
  barber_id: string;
  barber_name: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  service_id: string;
  service_name: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  price: number;
  created_at: string;
}

export interface BarberOption {
  id: string;
  name: string;
  status: string;
  specialty: string | null;
  avatar_url: string | null;
  work_start: string | null;
  work_end: string | null;
}

export interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  category: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface CreateAppointmentInput {
  barberId: string;
  clientId: string;
  serviceId: string;
  scheduledAt: string; // ISO datetime
  durationMinutes: number;
  notes?: string;
  lockId?: string; // Release this lock after creation
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAppointmentsPage() {
  const { tenantId, user } = useAuthStore();
  const { setAppointments, addAppointment, updateAppointment, deleteAppointment } =
    useAppointmentsStore();
  const { setSlotStatuses } = useAppointmentLocksStore();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [appointments, setLocalAppointments] = useState<AppointmentDetail[]>([]);
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [slotStatuses, setLocalSlotStatuses] = useState<SlotStatus[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const dateStr = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD

  // ---- Fetch Barbers ----
  const fetchBarbers = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from('barbers')
      .select('id, name, status, specialty, avatar_url, work_start, work_end')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setBarbers(data as BarberOption[]);
      if (!selectedBarberId && data.length > 0) {
        setSelectedBarberId(data[0].id);
      }
    }
  }, [tenantId, selectedBarberId]);

  // ---- Fetch Services ----
  const fetchServices = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('services')
      .select('id, name, duration_minutes, price, category')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    if (data) setServices(data as ServiceOption[]);
  }, [tenantId]);

  // ---- Fetch Clients ----
  const fetchClients = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name')
      .limit(100);
    if (data) setClients(data as ClientOption[]);
  }, [tenantId]);

  // ---- Fetch Appointments for Selected Date ----
  const fetchAppointments = useCallback(async () => {
    if (!tenantId) return;
    setIsLoadingAppointments(true);
    setError(null);

    try {
      const startOfDay = `${dateStr}T00:00:00`;
      const endOfDay = `${dateStr}T23:59:59`;

      const { data, error } = await supabase
        .from('appointment_details')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', startOfDay)
        .lte('scheduled_at', endOfDay)
        .order('scheduled_at');

      if (error) throw error;

      const apts = (data || []) as AppointmentDetail[];
      setLocalAppointments(apts);

      // Sync to global Zustand store (for ConflictEngine compatibility)
      setAppointments(
        apts.map((a) => ({
          id: a.id,
          clientId: a.client_id,
          clientName: a.client_name,
          barberId: a.barber_id,
          barberName: a.barber_name,
          service: a.service_name,
          date: dateStr,
          time: new Date(a.scheduled_at).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          duration: a.duration_minutes,
          status: mapStatus(a.status),
          createdAt: new Date(a.created_at).getTime(),
          updatedAt: Date.now(),
          version: 1,
        }))
      );
    } catch (err: any) {
      setError(err?.message || 'Error cargando citas');
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [tenantId, dateStr]);

  // ---- Fetch Slot Availability ----
  const fetchSlots = useCallback(
    async (barberId: string) => {
      if (!tenantId || !barberId) return;
      setIsLoadingSlots(true);

      try {
        const { data, error } = await supabase.rpc('get_available_slots_v2', {
          p_tenant_id: tenantId,
          p_barber_id: barberId,
          p_date: dateStr,
          p_slot_duration: 30,
        });

        if (error) throw error;

        const slots: SlotStatus[] = (data || []).map((s: any) => ({
          time: s.slot_time,
          endTime: s.slot_end,
          status: s.status as 'available' | 'locked' | 'booked',
          lockedByName: s.locked_by_name,
          appointmentId: s.appointment_id,
          clientName: s.client_name,
          serviceName: s.service_name,
          lockExpiresAt: s.lock_expires_at,
        }));

        setLocalSlotStatuses(slots);
        setSlotStatuses(`${barberId}:${dateStr}`, slots);
      } catch (err: any) {
        console.error('[Slots] fetch error:', err?.message);
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [tenantId, dateStr]
  );

  // ---- Create Appointment ----
  const createAppointment = useCallback(
    async (input: CreateAppointmentInput): Promise<{ success: boolean; error?: string }> => {
      if (!tenantId || !user) return { success: false, error: 'Not authenticated' };

      setIsCreating(true);
      setError(null);

      // Optimistic: add a placeholder
      const optimisticId = `optimistic-${Date.now()}`;

      try {
        const { data, error } = await supabase
          .from('appointments')
          .insert({
            tenant_id: tenantId,
            barber_id: input.barberId,
            client_id: input.clientId,
            service_id: input.serviceId,
            scheduled_at: input.scheduledAt,
            duration_minutes: input.durationMinutes,
            notes: input.notes || null,
            status: 'scheduled',
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Release the lock after successful creation
        if (input.lockId) {
          await supabase.rpc('release_slot_lock', {
            p_lock_id: input.lockId,
            p_locked_by: user.id,
          });
        }

        eventBus.emit(Events.APPOINTMENT_CREATED, {
          data: { appointment: data },
          source: 'appointments_page',
          timestamp: Date.now(),
        });

        // Refresh data
        await fetchAppointments();
        if (selectedBarberId) await fetchSlots(selectedBarberId);

        return { success: true };
      } catch (err: any) {
        setError(err?.message || 'Error creando cita');
        return { success: false, error: err?.message };
      } finally {
        setIsCreating(false);
      }
    },
    [tenantId, user, selectedBarberId, fetchAppointments, fetchSlots]
  );

  // ---- Cancel Appointment ----
  const cancelAppointment = useCallback(
    async (appointmentId: string): Promise<boolean> => {
      if (!tenantId) return false;

      // Optimistic update
      updateAppointment(appointmentId, { status: 'cancelled' });

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId);

      if (error) {
        // Rollback
        updateAppointment(appointmentId, { status: 'confirmed' });
        return false;
      }

      eventBus.emit(Events.APPOINTMENT_CANCELLED, {
        data: { id: appointmentId },
        source: 'appointments_page',
        timestamp: Date.now(),
      });

      await fetchAppointments();
      if (selectedBarberId) await fetchSlots(selectedBarberId);
      return true;
    },
    [tenantId, selectedBarberId]
  );

  // ---- Confirm Appointment ----
  const confirmAppointment = useCallback(
    async (appointmentId: string): Promise<boolean> => {
      if (!tenantId) return false;

      updateAppointment(appointmentId, { status: 'confirmed' });

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId);

      if (error) {
        updateAppointment(appointmentId, { status: 'pending' });
        return false;
      }

      eventBus.emit(Events.APPOINTMENT_CONFIRMED, {
        data: { id: appointmentId },
        source: 'appointments_page',
        timestamp: Date.now(),
      });

      await fetchAppointments();
      return true;
    },
    [tenantId]
  );

  // ---- Realtime Subscription ----
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`appointments_page:${tenantId}:${dateStr}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          // Refetch on any change to this date
          const apt = (payload.new || payload.old) as any;
          if (apt?.scheduled_at?.startsWith(dateStr)) {
            fetchAppointments();
            if (selectedBarberId) fetchSlots(selectedBarberId);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointment_locks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Refresh slots when locks change
          if (selectedBarberId) fetchSlots(selectedBarberId);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tenantId, dateStr, selectedBarberId]);

  // ---- Initial Load ----
  useEffect(() => {
    if (tenantId) {
      fetchBarbers();
      fetchServices();
      fetchClients();
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchAppointments();
    }
  }, [tenantId, dateStr]);

  useEffect(() => {
    if (tenantId && selectedBarberId) {
      fetchSlots(selectedBarberId);
    }
  }, [tenantId, selectedBarberId, dateStr]);

  return {
    // State
    selectedDate,
    selectedBarberId,
    appointments,
    barbers,
    services,
    clients,
    slotStatuses,
    isLoadingAppointments,
    isLoadingSlots,
    isCreating,
    error,

    // Actions
    setSelectedDate,
    setSelectedBarberId,
    createAppointment,
    cancelAppointment,
    confirmAppointment,
    refetchAppointments: fetchAppointments,
    refetchSlots: () => selectedBarberId && fetchSlots(selectedBarberId),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapStatus(
  status: string
): 'pending' | 'confirmed' | 'completed' | 'cancelled' {
  switch (status) {
    case 'scheduled':
      return 'pending';
    case 'confirmed':
    case 'in_progress':
      return 'confirmed';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'no_show':
      return 'cancelled';
    default:
      return 'pending';
  }
}

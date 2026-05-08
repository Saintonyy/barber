/**
 * Supabase Data Hooks
 * Real data fetching replacing mock data across all pages
 * Each hook manages loading, error, and cache states
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/useAuthStore';

// ============================================================================
// Generic fetch hook
// ============================================================================

function useSupabaseQuery<T>(
  queryFn: () => Promise<{ data: any; error: any }>,
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await queryFn();
      if (error) throw error;
      setData(data as T);
    } catch (err: any) {
      setError(err?.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ============================================================================
// Dashboard Stats
// ============================================================================

export interface DashboardStats {
  today_appointments: number;
  active_conversations: number;
  today_revenue: number;
  total_clients: number;
}

export function useDashboardStats() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<DashboardStats>(
    async () => {
      if (!tenantId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();
      return { data, error };
    },
    [tenantId]
  );
}

// ============================================================================
// Appointments
// ============================================================================

export interface AppointmentDetail {
  id: string;
  tenant_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  barber_id: string;
  barber_name: string;
  service_id: string;
  service_name: string;
  service_duration: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  source: string;
  notes: string | null;
  price: number | null;
  created_at: string;
  updated_at: string;
}

export function useAppointments(date?: string) {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<AppointmentDetail[]>(
    async () => {
      if (!tenantId) return { data: null, error: null };

      let query = supabase
        .from('appointment_details')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('scheduled_at', { ascending: true });

      if (date) {
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        query = query.gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay);
      }

      const { data, error } = await query;
      return { data, error };
    },
    [tenantId, date]
  );
}

export function useTodayAppointments() {
  const today = new Date().toISOString().split('T')[0];
  return useAppointments(today);
}

export function useCreateAppointment() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.user?.id);

  return useCallback(
    async (appointment: {
      client_id: string;
      barber_id: string;
      service_id: string;
      scheduled_at: string;
      duration_minutes: number;
      notes?: string;
      price?: number;
      source?: string;
    }) => {
      if (!tenantId) throw new Error('No tenant context');

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          ...appointment,
          tenant_id: tenantId,
          created_by: userId || null,
          source: appointment.source || 'dashboard',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [tenantId, userId]
  );
}

export function useUpdateAppointment() {
  return useCallback(
    async (id: string, updates: { status?: string; scheduled_at?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    []
  );
}

// ============================================================================
// Barbers
// ============================================================================

export interface BarberRow {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  specialties: string[];
  rating: number;
  total_appointments: number;
  total_revenue: number;
  status: string;
  last_seen: string | null;
  work_start: string | null;
  work_end: string | null;
  is_active: boolean;
}

export function useBarbers() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<BarberRow[]>(
    async () => {
      if (!tenantId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      return { data, error };
    },
    [tenantId]
  );
}

export function useUpdateBarberStatus() {
  return useCallback(
    async (barberId: string, status: string) => {
      const { data, error } = await supabase
        .from('barbers')
        .update({ status, last_seen: new Date().toISOString() })
        .eq('id', barberId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    []
  );
}

// ============================================================================
// Clients
// ============================================================================

export interface ClientRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email: string | null;
  whatsapp_id: string | null;
  preferences: any;
  notes: string | null;
  total_visits: number;
  last_visit: string | null;
  is_active: boolean;
  created_at: string;
}

export function useClients(search?: string) {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<ClientRow[]>(
    async () => {
      if (!tenantId) return { data: null, error: null };

      let query = supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (search && search.length > 1) {
        query = query.ilike('name', `%${search}%`);
      }

      const { data, error } = await query;
      return { data, error };
    },
    [tenantId, search]
  );
}

export function useCreateClient() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useCallback(
    async (client: { name: string; phone: string; email?: string; notes?: string }) => {
      if (!tenantId) throw new Error('No tenant context');

      const { data, error } = await supabase
        .from('clients')
        .insert({ ...client, tenant_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [tenantId]
  );
}

// ============================================================================
// Services
// ============================================================================

export interface ServiceRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string | null;
  icon: string | null;
  is_active: boolean;
}

export function useServices() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<ServiceRow[]>(
    async () => {
      if (!tenantId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      return { data, error };
    },
    [tenantId]
  );
}

export function useCreateService() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useCallback(
    async (service: {
      name: string;
      duration_minutes: number;
      price: number;
      description?: string;
      category?: string;
    }) => {
      if (!tenantId) throw new Error('No tenant context');

      const { data, error } = await supabase
        .from('services')
        .insert({ ...service, tenant_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [tenantId]
  );
}

// ============================================================================
// Conversations
// ============================================================================

export interface ConversationDetail {
  id: string;
  tenant_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  channel: string;
  status: string;
  fsm_state: string;
  assigned_to: string | null;
  last_message_at: string | null;
  message_count: number;
  unread_count: number;
  created_at: string;
}

export function useConversations() {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<ConversationDetail[]>(
    async () => {
      if (!tenantId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('conversation_details')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false });
      return { data, error };
    },
    [tenantId]
  );
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  message_type: string;
  status: string;
  metadata: any;
  created_at: string;
}

export function useMessages(conversationId: string | null) {
  const tenantId = useAuthStore((s) => s.tenantId);

  return useSupabaseQuery<MessageRow[]>(
    async () => {
      if (!tenantId || !conversationId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      return { data, error };
    },
    [tenantId, conversationId]
  );
}

export function useSendMessageToConversation() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.user?.id);

  return useCallback(
    async (conversationId: string, content: string) => {
      if (!tenantId) throw new Error('No tenant context');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          sender_type: 'operator',
          sender_id: userId || null,
          content,
          message_type: 'text',
          status: 'sent',
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    },
    [tenantId, userId]
  );
}

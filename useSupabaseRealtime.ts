/**
 * Supabase Realtime Subscriptions
 * Bridges Supabase Realtime → EventBus → Zustand stores
 * Maintains the existing event-driven architecture
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { eventBus, Events } from '@/lib/events/EventBus';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribe to appointment changes via Supabase Realtime
 * Emits events through EventBus to maintain existing architecture
 */
export function useAppointmentsRealtime() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`appointments:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          eventBus.emit(Events.APPOINTMENT_CREATED, {
            data: payload.new,
            source: 'supabase_realtime',
            timestamp: Date.now(),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const oldStatus = payload.old?.status;
          const newStatus = payload.new?.status;

          if (newStatus === 'cancelled') {
            eventBus.emit(Events.APPOINTMENT_CANCELLED, {
              data: { id: payload.new.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          } else {
            eventBus.emit(Events.APPOINTMENT_UPDATED, {
              data: payload.new,
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          eventBus.emit(Events.APPOINTMENT_CANCELLED, {
            data: { id: payload.old.id },
            source: 'supabase_realtime',
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tenantId]);
}

/**
 * Subscribe to barber status changes
 */
export function useBarbersRealtime() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`barbers:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'barbers',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const barber = payload.new;
          const oldBarber = payload.old;

          // Determine which event to emit based on status change
          if (barber.status === 'online' && oldBarber.status !== 'online') {
            eventBus.emit(Events.BARBER_ONLINE, {
              data: { barberId: barber.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          } else if (barber.status === 'offline') {
            eventBus.emit(Events.BARBER_OFFLINE, {
              data: { barberId: barber.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          } else if (barber.status === 'busy') {
            eventBus.emit(Events.BARBER_BUSY, {
              data: { barberId: barber.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          } else if (barber.status === 'available') {
            eventBus.emit(Events.BARBER_AVAILABLE, {
              data: { barberId: barber.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tenantId]);
}

/**
 * Subscribe to conversation and message changes
 */
export function useConversationsRealtime() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`conversations:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          eventBus.emit(Events.CONVERSATION_STARTED, {
            data: payload.new,
            source: 'supabase_realtime',
            timestamp: Date.now(),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.new.status === 'escalated') {
            eventBus.emit(Events.CONVERSATION_ESCALATED, {
              data: { conversationId: payload.new.id },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          }

          // FSM state change
          if (payload.old?.fsm_state !== payload.new.fsm_state) {
            eventBus.emit(Events.FSM_TRANSITIONED, {
              data: {
                conversationId: payload.new.id,
                transition: {
                  from: payload.old?.fsm_state || 'idle',
                  to: payload.new.fsm_state,
                  timestamp: Date.now(),
                },
              },
              source: 'supabase_realtime',
              timestamp: Date.now(),
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const msg = payload.new;
          eventBus.emit(Events.CONVERSATION_MESSAGE, {
            data: {
              conversationId: msg.conversation_id,
              message: {
                id: msg.id,
                conversationId: msg.conversation_id,
                sender: msg.sender_type,
                content: msg.content,
                timestamp: new Date(msg.created_at).getTime(),
                status: msg.status,
              },
            },
            source: 'supabase_realtime',
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tenantId]);
}

/**
 * Subscribe to slot lock changes for conflict detection
 */
export function useSlotLocksRealtime() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`slot_locks:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'slot_locks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          // Emit generic slot lock event for conflict engine
          eventBus.emit('SLOT_LOCK_CHANGED' as any, {
            data: {
              type: payload.eventType,
              lock: payload.new || payload.old,
            },
            source: 'supabase_realtime',
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tenantId]);
}

/**
 * Master hook: Initialize all realtime subscriptions
 * Call this once at the app level after auth is confirmed
 */
export function useSupabaseRealtimeSync() {
  useAppointmentsRealtime();
  useBarbersRealtime();
  useConversationsRealtime();
  useSlotLocksRealtime();
}

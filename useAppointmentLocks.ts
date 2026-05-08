/**
 * useAppointmentLocks
 * Distributed slot locking over Supabase
 *
 * Responsibilities:
 * - Acquire / release / renew locks via Supabase RPC
 * - Subscribe to Realtime changes on appointment_locks table
 * - Bridge changes into EventBus → Zustand store
 * - Heartbeat to keep active locks alive
 *
 * Architecture:
 *   UI action → acquireLock() → Supabase RPC (atomic)
 *   Supabase Realtime → onLockChange → EventBus → Zustand
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAppointmentLocksStore, AppointmentLock } from '@/stores/useAppointmentLocksStore';
import { eventBus, Events } from '@/lib/events/EventBus';
import type { RealtimeChannel } from '@supabase/supabase-js';

const LOCK_TTL_SECONDS = 60;
const HEARTBEAT_INTERVAL_MS = 20_000; // renew every 20s

// ============================================================================
// Lock Realtime Subscription
// ============================================================================

export function useAppointmentLocksRealtime() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { addLock, removeLock, updateLock } = useAppointmentLocksStore();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`appointment_locks:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointment_locks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const lock = payload.new as AppointmentLock;
          addLock(lock);
          eventBus.emit(Events.CALENDAR_SLOT_LOCKED, {
            data: { lock },
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
          table: 'appointment_locks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          updateLock(payload.new.id, payload.new as Partial<AppointmentLock>);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'appointment_locks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const lockId = payload.old?.id;
          if (lockId) {
            removeLock(lockId);
            eventBus.emit(Events.CALENDAR_SLOT_RELEASED, {
              data: { lockId },
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

// ============================================================================
// Lock Operations
// ============================================================================

export interface AcquireLockParams {
  barberId: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  reason?: string;
}

export interface AcquireLockResult {
  success: boolean;
  lockId?: string;
  conflictType?: string;
  conflictDetail?: string;
}

export function useAppointmentLocks() {
  const { user, tenantId, profile } = useAuthStore();
  const { myActiveLock, setMyActiveLock, removeLock } = useAppointmentLocksStore();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Acquire ----
  const acquireLock = useCallback(
    async (params: AcquireLockParams): Promise<AcquireLockResult> => {
      if (!user || !tenantId) {
        return { success: false, conflictType: 'auth', conflictDetail: 'Not authenticated' };
      }

      // Release any existing lock first
      if (myActiveLock) {
        await releaseLock(myActiveLock.id);
      }

      const { data, error } = await supabase.rpc('acquire_slot_lock', {
        p_tenant_id: tenantId,
        p_barber_id: params.barberId,
        p_date: params.date,
        p_start_time: params.startTime,
        p_end_time: params.endTime,
        p_locked_by: user.id,
        p_locked_by_name: profile?.name || user.email || 'Usuario',
        p_lock_source: 'human',
        p_ttl_seconds: LOCK_TTL_SECONDS,
      });

      if (error) {
        console.error('[Locks] acquire_slot_lock error:', error);
        return { success: false, conflictType: 'error', conflictDetail: error.message };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.success) {
        eventBus.emit(Events.CALENDAR_CONFLICT_DETECTED, {
          data: {
            conflictType: result?.conflict_type,
            detail: result?.conflict_detail,
            slot: params,
          },
          source: 'lock_system',
          timestamp: Date.now(),
        });
        return {
          success: false,
          lockId: result?.lock_id,
          conflictType: result?.conflict_type,
          conflictDetail: result?.conflict_detail,
        };
      }

      // Track my active lock and start heartbeat
      const lockRecord: AppointmentLock = {
        id: result.lock_id,
        tenant_id: tenantId,
        barber_id: params.barberId,
        appointment_date: params.date,
        start_time: params.startTime,
        end_time: params.endTime,
        locked_by: user.id,
        locked_by_name: profile?.name || null,
        lock_source: 'human',
        lock_reason: params.reason || null,
        expires_at: new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };

      setMyActiveLock(lockRecord);
      startHeartbeat(result.lock_id);

      eventBus.emit(Events.LOCK_ACQUIRED, {
        data: { lock: lockRecord },
        source: 'lock_system',
        timestamp: Date.now(),
      });

      return { success: true, lockId: result.lock_id };
    },
    [user, tenantId, profile, myActiveLock]
  );

  // ---- Release ----
  const releaseLock = useCallback(
    async (lockId: string): Promise<boolean> => {
      if (!user) return false;

      stopHeartbeat();

      const { data, error } = await supabase.rpc('release_slot_lock', {
        p_lock_id: lockId,
        p_locked_by: user.id,
      });

      if (!error && data) {
        removeLock(lockId);
        setMyActiveLock(null);
        eventBus.emit(Events.LOCK_RELEASED, {
          data: { lockId },
          source: 'lock_system',
          timestamp: Date.now(),
        });
      }

      return !error;
    },
    [user]
  );

  // ---- Heartbeat ----
  const startHeartbeat = (lockId: string) => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(async () => {
      if (!user) return;
      const { data } = await supabase.rpc('renew_slot_lock', {
        p_lock_id: lockId,
        p_locked_by: user.id,
        p_ttl_seconds: LOCK_TTL_SECONDS,
      });
      if (!data) {
        // Lock expired or was stolen
        stopHeartbeat();
        setMyActiveLock(null);
        eventBus.emit(Events.LOCK_EXPIRED, {
          data: { lockId },
          source: 'lock_system',
          timestamp: Date.now(),
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  // Release lock on unmount
  useEffect(() => {
    return () => {
      stopHeartbeat();
      if (myActiveLock) {
        releaseLock(myActiveLock.id);
      }
    };
  }, []);

  return {
    acquireLock,
    releaseLock,
    myActiveLock,
    isLocking: false,
  };
}

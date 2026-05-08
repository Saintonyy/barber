/**
 * useConflictDetection
 * Detects appointment conflicts via Supabase RPC
 * Bridges results into EventBus for visual conflict indicators
 *
 * Architecture:
 *   Component calls detectConflicts() → Supabase RPC
 *   Results → EventBus.CALENDAR_CONFLICT_DETECTED → ConflictEngine
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { eventBus, Events } from '@/lib/events/EventBus';

export interface AppointmentConflict {
  conflict_type: string;
  appointment_id_1: string;
  appointment_id_2: string;
  overlap_start: string;
  overlap_end: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConflictValidationResult {
  hasConflict: boolean;
  conflictType?: string;
  conflictDetail?: string;
}

export function useConflictDetection() {
  const { tenantId } = useAuthStore();
  const [conflicts, setConflicts] = useState<AppointmentConflict[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Detect all conflicts for a barber on a specific date
   */
  const detectConflicts = useCallback(
    async (barberId: string, date: string): Promise<AppointmentConflict[]> => {
      if (!tenantId) return [];

      setIsChecking(true);
      try {
        const { data, error } = await supabase.rpc('detect_appointment_conflicts', {
          p_tenant_id: tenantId,
          p_barber_id: barberId,
          p_date: date,
        });

        if (error) throw error;

        const results = (data || []) as AppointmentConflict[];
        setConflicts(results);

        if (results.length > 0) {
          eventBus.emit(Events.CALENDAR_CONFLICT_DETECTED, {
            data: { conflicts: results, barberId, date },
            source: 'conflict_engine',
            timestamp: Date.now(),
          });
        }

        return results;
      } catch (err: any) {
        console.error('[ConflictDetection] Error:', err?.message);
        return [];
      } finally {
        setIsChecking(false);
      }
    },
    [tenantId]
  );

  /**
   * Validate a proposed appointment before creation
   * Checks: time overlap, barber availability, service duration
   */
  const validateProposedAppointment = useCallback(
    async (params: {
      barberId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
    }): Promise<ConflictValidationResult> => {
      if (!tenantId) return { hasConflict: true, conflictType: 'auth' };

      const [hours, minutes] = params.startTime.split(':').map(Number);
      const endMinutes = hours * 60 + minutes + params.durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

      // Check via acquire_slot_lock (dry run — we pass TTL=0 conceptually,
      // but we just check the slot status from get_available_slots_v2)
      try {
        const { data, error } = await supabase.rpc('get_available_slots_v2', {
          p_tenant_id: tenantId,
          p_barber_id: params.barberId,
          p_date: params.date,
          p_slot_duration: params.durationMinutes,
        });

        if (error) throw error;

        const slots = (data || []) as Array<{
          slot_time: string;
          status: string;
          locked_by_name: string | null;
        }>;

        // Find the slot matching our start time
        const targetSlot = slots.find((s) => s.slot_time === params.startTime);

        if (!targetSlot) {
          return { hasConflict: false };
        }

        if (targetSlot.status === 'booked') {
          return {
            hasConflict: true,
            conflictType: 'slot_booked',
            conflictDetail: 'Este horario ya tiene una cita confirmada',
          };
        }

        if (targetSlot.status === 'locked') {
          return {
            hasConflict: true,
            conflictType: 'slot_locked',
            conflictDetail: targetSlot.locked_by_name
              ? `${targetSlot.locked_by_name} está reservando este horario`
              : 'Este horario está siendo reservado por otro usuario',
          };
        }

        return { hasConflict: false };
      } catch (err: any) {
        console.error('[ConflictDetection] validate error:', err?.message);
        return { hasConflict: false }; // Fail open — let the server decide
      }
    },
    [tenantId]
  );

  return {
    conflicts,
    isChecking,
    detectConflicts,
    validateProposedAppointment,
  };
}

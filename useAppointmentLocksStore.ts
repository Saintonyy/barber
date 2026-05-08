/**
 * Appointment Locks Store
 * Tracks active slot locks across the calendar
 * Feeds the conflict engine and visual lock indicators
 *
 * Architecture: Supabase Realtime → EventBus → this store → UI
 */
import { create } from 'zustand';

export interface AppointmentLock {
  id: string;
  tenant_id: string;
  barber_id: string;
  appointment_date: string; // ISO date string
  start_time: string;       // HH:MM
  end_time: string;         // HH:MM
  locked_by: string;        // user UUID
  locked_by_name: string | null;
  lock_source: 'human' | 'ai' | 'client';
  lock_reason: string | null;
  expires_at: string;       // ISO timestamp
  created_at: string;
}

export interface SlotStatus {
  time: string;        // HH:MM
  endTime: string;     // HH:MM
  status: 'available' | 'locked' | 'booked';
  lockedByName?: string | null;
  appointmentId?: string | null;
  clientName?: string | null;
  serviceName?: string | null;
  lockExpiresAt?: string | null;
}

interface AppointmentLocksState {
  // Active locks from Supabase Realtime
  locks: AppointmentLock[];

  // Slot availability per barber/date (keyed as `${barberId}:${date}`)
  slotStatuses: Map<string, SlotStatus[]>;

  // My own active lock (for the current user's booking flow)
  myActiveLock: AppointmentLock | null;

  // Actions
  setLocks: (locks: AppointmentLock[]) => void;
  addLock: (lock: AppointmentLock) => void;
  removeLock: (lockId: string) => void;
  updateLock: (lockId: string, updates: Partial<AppointmentLock>) => void;
  setSlotStatuses: (key: string, slots: SlotStatus[]) => void;
  setMyActiveLock: (lock: AppointmentLock | null) => void;
  clearExpiredLocks: () => void;
  isSlotLocked: (barberId: string, date: string, time: string) => boolean;
  getLocksForBarberDate: (barberId: string, date: string) => AppointmentLock[];
}

export const useAppointmentLocksStore = create<AppointmentLocksState>((set, get) => ({
  locks: [],
  slotStatuses: new Map(),
  myActiveLock: null,

  setLocks: (locks) => set({ locks }),

  addLock: (lock) =>
    set((state) => ({
      locks: [...state.locks.filter((l) => l.id !== lock.id), lock],
    })),

  removeLock: (lockId) =>
    set((state) => ({
      locks: state.locks.filter((l) => l.id !== lockId),
      myActiveLock: state.myActiveLock?.id === lockId ? null : state.myActiveLock,
    })),

  updateLock: (lockId, updates) =>
    set((state) => ({
      locks: state.locks.map((l) => (l.id === lockId ? { ...l, ...updates } : l)),
    })),

  setSlotStatuses: (key, slots) =>
    set((state) => {
      const newMap = new Map(state.slotStatuses);
      newMap.set(key, slots);
      return { slotStatuses: newMap };
    }),

  setMyActiveLock: (lock) => set({ myActiveLock: lock }),

  clearExpiredLocks: () => {
    const now = new Date();
    set((state) => ({
      locks: state.locks.filter((l) => new Date(l.expires_at) > now),
    }));
  },

  isSlotLocked: (barberId, date, time) => {
    const now = new Date();
    return get().locks.some(
      (l) =>
        l.barber_id === barberId &&
        l.appointment_date === date &&
        l.start_time <= time &&
        l.end_time > time &&
        new Date(l.expires_at) > now
    );
  },

  getLocksForBarberDate: (barberId, date) => {
    const now = new Date();
    return get().locks.filter(
      (l) =>
        l.barber_id === barberId &&
        l.appointment_date === date &&
        new Date(l.expires_at) > now
    );
  },
}));

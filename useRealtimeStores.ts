/**
 * Real-Time Zustand Stores
 * Design: Minimalist Brutalism - Direct state management with optimistic updates
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  barberId: string;
  barberName: string;
  service: string;
  date: string;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'client' | 'agent' | 'ai';
  content: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  metadata?: {
    toolCall?: { name: string; status: string };
    confidence?: number;
    latency?: number;
  };
}

export interface Conversation {
  id: string;
  clientId: string;
  clientName: string;
  lastMessage: string;
  lastMessageTime: number;
  status: 'active' | 'idle' | 'escalated' | 'resolved';
  fsmState: string;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FSMState {
  conversationId: string;
  currentState: string;
  previousState?: string;
  transitions: Array<{
    from: string;
    to: string;
    trigger: string;
    timestamp: number;
  }>;
}

export interface ToolExecution {
  id: string;
  conversationId: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  latency?: number;
  startedAt: number;
  completedAt?: number;
}

export interface Barber {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'available' | 'busy' | 'break';
  currentAppointmentId?: string;
  availableSlots: string[];
  rating: number;
  totalAppointments: number;
  lastSeen: number;
}

export interface UserPresence {
  userId: string;
  barberId?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: number;
  currentConversation?: string;
  currentAppointment?: string;
}

// ============================================================================
// Appointments Store
// ============================================================================

interface AppointmentsState {
  appointments: Appointment[];
  selectedAppointment: Appointment | null;
  loading: boolean;
  error: string | null;
  optimisticUpdates: Map<string, Appointment>;

  // Actions
  setAppointments: (appointments: Appointment[]) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  setSelectedAppointment: (appointment: Appointment | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Optimistic updates
  optimisticUpdate: (id: string, updates: Partial<Appointment>) => void;
  rollbackOptimistic: (id: string) => void;
  confirmOptimistic: (id: string) => void;
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: [],
  selectedAppointment: null,
  loading: false,
  error: null,
  optimisticUpdates: new Map(),

  setAppointments: (appointments: Appointment[]) => set({ appointments }),

  addAppointment: (appointment: Appointment) =>
    set((state) => ({
      appointments: [...state.appointments, appointment],
    })),

  updateAppointment: (id: string, updates: Partial<Appointment>) =>
    set((state) => ({
      appointments: state.appointments.map((apt) =>
        apt.id === id ? { ...apt, ...updates } : apt
      ),
    })),

  deleteAppointment: (id: string) =>
    set((state) => ({
      appointments: state.appointments.filter((apt) => apt.id !== id),
    })),

  setSelectedAppointment: (appointment: Appointment | null) =>
    set({ selectedAppointment: appointment }),

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),

  optimisticUpdate: (id: string, updates: Partial<Appointment>) =>
    set((state) => {
      const current = state.appointments.find((apt) => apt.id === id);
      if (current) {
        state.optimisticUpdates.set(id, current);
        return {
          appointments: state.appointments.map((apt) =>
            apt.id === id ? { ...apt, ...updates } : apt
          ),
        };
      }
      return state;
    }),

  rollbackOptimistic: (id: string) =>
    set((state) => {
      const original = state.optimisticUpdates.get(id);
      if (original) {
        state.optimisticUpdates.delete(id);
        return {
          appointments: state.appointments.map((apt) =>
            apt.id === id ? original : apt
          ),
        };
      }
      return state;
    }),

  confirmOptimistic: (id: string) =>
    set((state) => {
      state.optimisticUpdates.delete(id);
      return state;
    }),
}));

// ============================================================================
// Conversations Store
// ============================================================================

interface ConversationsState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Map<string, Message[]>;
  typingUsers: Map<string, Set<string>>;
  fsm: Map<string, FSMState>;
  toolExecutions: Map<string, ToolExecution[]>;
  loading: boolean;
  error: string | null;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  setActiveConversation: (id: string | null) => void;

  // Messages
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  getMessages: (conversationId: string) => Message[];

  // Typing indicators
  setTyping: (conversationId: string, userId: string) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  getTypingUsers: (conversationId: string) => string[];

  // FSM
  updateFSM: (conversationId: string, state: FSMState) => void;
  getFSM: (conversationId: string) => FSMState | undefined;

  // Tool execution
  addToolExecution: (conversationId: string, execution: ToolExecution) => void;
  updateToolExecution: (
    conversationId: string,
    executionId: string,
    updates: Partial<ToolExecution>
  ) => void;
  getToolExecutions: (conversationId: string) => ToolExecution[];

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: new Map(),
  typingUsers: new Map(),
  fsm: new Map(),
  toolExecutions: new Map(),
  loading: false,
  error: null,

  setConversations: (conversations: Conversation[]) => set({ conversations }),

  addConversation: (conversation: Conversation) =>
    set((state) => ({
      conversations: [...state.conversations, conversation],
    })),

  updateConversation: (id: string, updates: Partial<Conversation>) =>
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === id ? { ...conv, ...updates } : conv
      ),
    })),

  setActiveConversation: (id: string | null) => set({ activeConversationId: id }),

  addMessage: (conversationId: string, message: Message) =>
    set((state) => {
      const messages = state.messages.get(conversationId) || [];
      state.messages.set(conversationId, [...messages, message]);
      return { messages: new Map(state.messages) };
    }),

  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) =>
    set((state) => {
      const messages = state.messages.get(conversationId) || [];
      state.messages.set(
        conversationId,
        messages.map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        )
      );
      return { messages: new Map(state.messages) };
    }),

  getMessages: (conversationId: string) => {
    return get().messages.get(conversationId) || [];
  },

  setTyping: (conversationId: string, userId: string) =>
    set((state) => {
      const users = state.typingUsers.get(conversationId) || new Set();
      users.add(userId);
      state.typingUsers.set(conversationId, new Set(users));
      return { typingUsers: new Map(state.typingUsers) };
    }),

  clearTyping: (conversationId: string, userId: string) =>
    set((state) => {
      const users = state.typingUsers.get(conversationId) || new Set();
      users.delete(userId);
      state.typingUsers.set(conversationId, new Set(users));
      return { typingUsers: new Map(state.typingUsers) };
    }),

  getTypingUsers: (conversationId: string) => {
    return Array.from(get().typingUsers.get(conversationId) || new Set());
  },

  updateFSM: (conversationId: string, fsmState: FSMState) =>
    set((state) => {
      state.fsm.set(conversationId, fsmState);
      return { fsm: new Map(state.fsm) };
    }),

  getFSM: (conversationId: string) => {
    return get().fsm.get(conversationId);
  },

  addToolExecution: (conversationId: string, execution: ToolExecution) =>
    set((state) => {
      const executions = state.toolExecutions.get(conversationId) || [];
      state.toolExecutions.set(conversationId, [...executions, execution]);
      return { toolExecutions: new Map(state.toolExecutions) };
    }),

  updateToolExecution: (
    conversationId: string,
    executionId: string,
    updates: Partial<ToolExecution>
  ) =>
    set((state) => {
      const executions = state.toolExecutions.get(conversationId) || [];
      state.toolExecutions.set(
        conversationId,
        executions.map((exec) =>
          exec.id === executionId ? { ...exec, ...updates } : exec
        )
      );
      return { toolExecutions: new Map(state.toolExecutions) };
    }),

  getToolExecutions: (conversationId: string) => {
    return get().toolExecutions.get(conversationId) || [];
  },

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),
}));

// ============================================================================
// Realtime Store
// ============================================================================

interface RealtimeState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastSyncTime: number;
  pendingEvents: Array<{ id: string; type: string; data: any }>;
  syncErrors: Map<string, string>;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  addPendingEvent: (id: string, type: string, data: any) => void;
  removePendingEvent: (eventId: string) => void;
  setSyncError: (key: string, error: string) => void;
  clearSyncError: (key: string) => void;
  setLastSyncTime: (time: number) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  isConnected: false,
  connectionStatus: 'disconnected',
  lastSyncTime: 0,
  pendingEvents: [],
  syncErrors: new Map(),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error') =>
    set({ connectionStatus: status }),

  addPendingEvent: (id: string, type: string, data: any) =>
    set((state) => ({
      pendingEvents: [...state.pendingEvents, { id, type, data }],
    })),

  removePendingEvent: (eventId: string) =>
    set((state) => ({
      pendingEvents: state.pendingEvents.filter((e) => e.id !== eventId),
    })),

  setSyncError: (key: string, error: string) =>
    set((state) => {
      state.syncErrors.set(key, error);
      return { syncErrors: new Map(state.syncErrors) };
    }),

  clearSyncError: (key: string) =>
    set((state) => {
      state.syncErrors.delete(key);
      return { syncErrors: new Map(state.syncErrors) };
    }),

  setLastSyncTime: (time: number) => set({ lastSyncTime: time }),
}));

// ============================================================================
// Barbers Store
// ============================================================================

interface BarbersState {
  barbers: Barber[];
  loading: boolean;
  error: string | null;

  setBarbers: (barbers: Barber[]) => void;
  updateBarber: (id: string, updates: Partial<Barber>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBarbersStore = create<BarbersState>((set) => ({
  barbers: [],
  loading: false,
  error: null,

  setBarbers: (barbers: Barber[]) => set({ barbers }),

  updateBarber: (id: string, updates: Partial<Barber>) =>
    set((state) => ({
      barbers: state.barbers.map((barber) =>
        barber.id === id ? { ...barber, ...updates } : barber
      ),
    })),

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),
}));

// ============================================================================
// Presence Store
// ============================================================================

interface PresenceState {
  users: Map<string, UserPresence>;

  setPresence: (userId: string, presence: UserPresence) => void;
  removePresence: (userId: string) => void;
  getPresence: (userId: string) => UserPresence | undefined;
  getAllPresence: () => UserPresence[];
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  users: new Map(),

  setPresence: (userId: string, presence: UserPresence) =>
    set((state) => {
      state.users.set(userId, presence);
      return { users: new Map(state.users) };
    }),

  removePresence: (userId: string) =>
    set((state) => {
      state.users.delete(userId);
      return { users: new Map(state.users) };
    }),

  getPresence: (userId: string) => {
    return get().users.get(userId);
  },

  getAllPresence: () => {
    return Array.from(get().users.values());
  },
}));

# BARBERAGENT Real-Time Architecture

## Overview

Transform BARBERAGENT from a static dashboard into a **live operational system** with event-driven architecture, real-time synchronization, and optimistic updates. The system feels like a command center where every action is immediately reflected across all connected clients.

---

## 1. Event-Driven Architecture

### Core Events

```typescript
// Appointment Events
appointment.created
appointment.updated
appointment.cancelled
appointment.completed
appointment.rescheduled
appointment.confirmed
appointment.reminder_sent

// Conversation Events
conversation.started
conversation.message_sent
conversation.message_received
conversation.typing_started
conversation.typing_stopped
conversation.escalated
conversation.resolved
conversation.ai_responding
conversation.human_takeover

// Tool Events
tool.executing
tool.executed
tool.failed
tool.retrying
tool.completed

// FSM Events
fsm.transitioned
fsm.state_changed
fsm.error_occurred

// Barber Events
barber.online
barber.offline
barber.available
barber.busy
barber.break_started
barber.break_ended

// System Events
ai.responding
ai.response_received
ai.error
notification.created
presence.user_online
presence.user_offline
conflict.detected
conflict.resolved
```

### Event Payload Structure

```typescript
interface RealtimeEvent<T = any> {
  id: string;
  type: string;
  timestamp: number;
  userId?: string;
  barberId?: string;
  appointmentId?: string;
  conversationId?: string;
  data: T;
  metadata: {
    source: 'websocket' | 'supabase' | 'local';
    version: number;
    clientId: string;
  };
}
```

---

## 2. WebSocket Architecture

### Connection Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Client                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │         React Component / Hook                   │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                  │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │      Zustand Real-Time Store                     │   │
│  │  (appointments, conversations, presence)        │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                  │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │    WebSocket Manager (Socket.io)                │   │
│  │  - Connection pooling                           │   │
│  │  - Automatic reconnection                       │   │
│  │  - Message queuing                              │   │
│  │  - Heartbeat monitoring                         │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                  │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │    Supabase Realtime (Postgres Listen/Notify)  │   │
│  │  - Channel subscriptions                        │   │
│  │  - Presence tracking                            │   │
│  │  - Broadcast messages                           │   │
│  └────────────────────┬─────────────────────────────┘   │
└────────────────────────┼──────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    NestJS          Supabase          Redis
    WebSocket       Realtime          PubSub
    Server         (Postgres)         (Events)
```

### WebSocket Manager Implementation

```typescript
// lib/websocket/WebSocketManager.ts
class WebSocketManager {
  private socket: Socket;
  private messageQueue: RealtimeEvent[] = [];
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(private url: string) {
    this.initialize();
  }

  private initialize() {
    this.socket = io(this.url, {
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      transports: ['websocket', 'polling'],
      heartbeatInterval: 25000,
      heartbeatTimeout: 60000,
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });

    // Subscribe to all event types
    this.socket.on('event', (event: RealtimeEvent) => {
      this.handleEvent(event);
    });
  }

  public emit(event: string, data?: any) {
    if (this.isConnected) {
      this.socket.emit(event, data);
    } else {
      this.messageQueue.push({ type: event, data });
    }
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const event = this.messageQueue.shift();
      if (event) {
        this.socket.emit(event.type, event.data);
      }
    }
  }

  private handleEvent(event: RealtimeEvent) {
    // Dispatch to Zustand stores
    eventBus.emit(event.type, event);
  }

  public subscribe(eventType: string, callback: (event: RealtimeEvent) => void) {
    this.socket.on(eventType, callback);
  }

  public unsubscribe(eventType: string) {
    this.socket.off(eventType);
  }
}

export const wsManager = new WebSocketManager(
  process.env.REACT_APP_WS_URL || 'ws://localhost:3001'
);
```

---

## 3. Supabase Realtime Strategy

### Channel Architecture

```typescript
// lib/realtime/SupabaseRealtimeManager.ts
interface RealtimeChannel {
  appointments: Channel;
  conversations: Channel;
  presence: Channel;
  notifications: Channel;
  barbers: Channel;
}

class SupabaseRealtimeManager {
  private channels: RealtimeChannel;
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
    this.initializeChannels();
  }

  private initializeChannels() {
    // Appointments channel - listen for INSERT, UPDATE, DELETE
    this.channels.appointments = this.client
      .channel('appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => this.handleAppointmentChange(payload)
      )
      .subscribe();

    // Conversations channel
    this.channels.conversations = this.client
      .channel('conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => this.handleConversationChange(payload)
      )
      .subscribe();

    // Presence channel - track online users
    this.channels.presence = this.client
      .channel('presence')
      .on('presence', { event: 'sync' }, () => this.handlePresenceSync())
      .on('presence', { event: 'join' }, (payload) => this.handlePresenceJoin(payload))
      .on('presence', { event: 'leave' }, (payload) => this.handlePresenceLeave(payload))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channels.presence.track({
            user_id: this.client.auth.user()?.id,
            online_at: new Date().toISOString(),
          });
        }
      });
  }

  private handleAppointmentChange(payload: RealtimePostgresChangesPayload<any>) {
    const event: RealtimeEvent = {
      id: nanoid(),
      type: `appointment.${payload.eventType.toLowerCase()}`,
      timestamp: Date.now(),
      data: payload.new || payload.old,
      metadata: {
        source: 'supabase',
        version: 1,
        clientId: this.getClientId(),
      },
    };
    eventBus.emit(event.type, event);
  }

  private handleConversationChange(payload: RealtimePostgresChangesPayload<any>) {
    const event: RealtimeEvent = {
      id: nanoid(),
      type: `conversation.${payload.eventType.toLowerCase()}`,
      timestamp: Date.now(),
      data: payload.new || payload.old,
      metadata: {
        source: 'supabase',
        version: 1,
        clientId: this.getClientId(),
      },
    };
    eventBus.emit(event.type, event);
  }

  private handlePresenceSync() {
    const state = this.channels.presence.state;
    eventBus.emit('presence.synced', state);
  }

  private handlePresenceJoin(payload: any) {
    eventBus.emit('presence.user_online', payload);
  }

  private handlePresenceLeave(payload: any) {
    eventBus.emit('presence.user_offline', payload);
  }

  private getClientId(): string {
    return localStorage.getItem('clientId') || nanoid();
  }
}
```

---

## 4. Zustand Real-Time Stores

### Store Architecture

```typescript
// stores/useAppointmentsStore.ts
interface AppointmentState {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  selectedAppointment: Appointment | null;
  optimisticUpdates: Map<string, Appointment>;
  
  // Actions
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  setSelectedAppointment: (appointment: Appointment | null) => void;
  
  // Optimistic
  optimisticUpdate: (id: string, updates: Partial<Appointment>) => void;
  rollbackOptimistic: (id: string) => void;
  confirmOptimistic: (id: string) => void;
  
  // Sync
  syncFromServer: (appointments: Appointment[]) => void;
  handleConflict: (id: string, serverVersion: Appointment) => void;
}

export const useAppointmentsStore = create<AppointmentState>((set, get) => ({
  appointments: [],
  loading: false,
  error: null,
  selectedAppointment: null,
  optimisticUpdates: new Map(),

  addAppointment: (appointment) =>
    set((state) => ({
      appointments: [...state.appointments, appointment],
    })),

  updateAppointment: (id, updates) =>
    set((state) => ({
      appointments: state.appointments.map((apt) =>
        apt.id === id ? { ...apt, ...updates } : apt
      ),
    })),

  deleteAppointment: (id) =>
    set((state) => ({
      appointments: state.appointments.filter((apt) => apt.id !== id),
    })),

  setSelectedAppointment: (appointment) =>
    set({ selectedAppointment: appointment }),

  optimisticUpdate: (id, updates) =>
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
    }),

  rollbackOptimistic: (id) =>
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
    }),

  confirmOptimistic: (id) =>
    set((state) => {
      state.optimisticUpdates.delete(id);
      return state;
    }),

  syncFromServer: (appointments) =>
    set({ appointments, loading: false }),

  handleConflict: (id, serverVersion) =>
    set((state) => {
      // Implement conflict resolution strategy
      // Option 1: Server wins
      // Option 2: Client wins
      // Option 3: Merge strategy
      return {
        appointments: state.appointments.map((apt) =>
          apt.id === id ? serverVersion : apt
        ),
      };
    }),
}));

// stores/useConversationsStore.ts
interface ConversationState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Map<string, Message[]>;
  typingUsers: Map<string, string[]>;
  fsm: Map<string, FSMState>;
  toolExecutions: Map<string, ToolExecution[]>;
  
  // Actions
  addConversation: (conversation: Conversation) => void;
  setActiveConversation: (id: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  
  // Typing indicators
  setTyping: (conversationId: string, userId: string) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  
  // FSM
  updateFSM: (conversationId: string, state: FSMState) => void;
  
  // Tool execution
  addToolExecution: (conversationId: string, execution: ToolExecution) => void;
  updateToolExecution: (conversationId: string, executionId: string, updates: Partial<ToolExecution>) => void;
  
  // Escalation
  escalateConversation: (conversationId: string, reason: string) => void;
}

export const useConversationsStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: new Map(),
  typingUsers: new Map(),
  fsm: new Map(),
  toolExecutions: new Map(),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [...state.conversations, conversation],
    })),

  setActiveConversation: (id) => {
    const conversation = get().conversations.find((c) => c.id === id);
    set({ activeConversation: conversation || null });
  },

  addMessage: (conversationId, message) =>
    set((state) => {
      const messages = state.messages.get(conversationId) || [];
      state.messages.set(conversationId, [...messages, message]);
      return { messages: new Map(state.messages) };
    }),

  updateMessage: (conversationId, messageId, updates) =>
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

  setTyping: (conversationId, userId) =>
    set((state) => {
      const users = state.typingUsers.get(conversationId) || [];
      if (!users.includes(userId)) {
        state.typingUsers.set(conversationId, [...users, userId]);
      }
      return { typingUsers: new Map(state.typingUsers) };
    }),

  clearTyping: (conversationId, userId) =>
    set((state) => {
      const users = state.typingUsers.get(conversationId) || [];
      state.typingUsers.set(
        conversationId,
        users.filter((u) => u !== userId)
      );
      return { typingUsers: new Map(state.typingUsers) };
    }),

  updateFSM: (conversationId, state) =>
    set((store) => {
      store.fsm.set(conversationId, state);
      return { fsm: new Map(store.fsm) };
    }),

  addToolExecution: (conversationId, execution) =>
    set((state) => {
      const executions = state.toolExecutions.get(conversationId) || [];
      state.toolExecutions.set(conversationId, [...executions, execution]);
      return { toolExecutions: new Map(state.toolExecutions) };
    }),

  updateToolExecution: (conversationId, executionId, updates) =>
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

  escalateConversation: (conversationId, reason) =>
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? { ...conv, escalated: true, escalationReason: reason }
          : conv
      ),
    })),
}));

// stores/useRealtimeStore.ts
interface RealtimeState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastSyncTime: number;
  pendingEvents: RealtimeEvent[];
  syncErrors: Map<string, string>;
  
  // Actions
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  addPendingEvent: (event: RealtimeEvent) => void;
  removePendingEvent: (eventId: string) => void;
  setSyncError: (key: string, error: string) => void;
  clearSyncError: (key: string) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  isConnected: false,
  connectionStatus: 'disconnected',
  lastSyncTime: 0,
  pendingEvents: [],
  syncErrors: new Map(),

  setConnected: (connected) => set({ isConnected: connected }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addPendingEvent: (event) =>
    set((state) => ({
      pendingEvents: [...state.pendingEvents, event],
    })),

  removePendingEvent: (eventId) =>
    set((state) => ({
      pendingEvents: state.pendingEvents.filter((e) => e.id !== eventId),
    })),

  setSyncError: (key, error) =>
    set((state) => {
      state.syncErrors.set(key, error);
      return { syncErrors: new Map(state.syncErrors) };
    }),

  clearSyncError: (key) =>
    set((state) => {
      state.syncErrors.delete(key);
      return { syncErrors: new Map(state.syncErrors) };
    }),
}));
```

---

## 5. Optimistic Updates Pattern

### Implementation

```typescript
// hooks/useOptimisticUpdate.ts
export function useOptimisticUpdate<T>(
  onMutate: (data: T) => Promise<T>,
  onSuccess?: (data: T) => void,
  onError?: (error: Error, rollback: T) => void
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (data: T) => {
      setIsPending(true);
      setError(null);

      // Store original for rollback
      const original = { ...data };

      try {
        // Optimistic update
        const result = await onMutate(data);

        // Confirm optimistic update
        onSuccess?.(result);
        setIsPending(false);
        return result;
      } catch (err) {
        // Rollback on error
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error, original);
        setIsPending(false);
        throw error;
      }
    },
    [onMutate, onSuccess, onError]
  );

  return { mutate, isPending, error };
}

// Usage in components
function UpdateAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const { updateAppointment, optimisticUpdate, rollbackOptimistic } =
    useAppointmentsStore();
  const { mutate, isPending, error } = useOptimisticUpdate(
    async (updates) => {
      // Optimistic update UI immediately
      optimisticUpdate(appointmentId, updates);

      // Send to server
      const response = await api.updateAppointment(appointmentId, updates);

      // Confirm optimistic update
      return response;
    },
    (result) => {
      confirmOptimistic(appointmentId);
    },
    (error, original) => {
      // Rollback on error
      rollbackOptimistic(appointmentId);
      toast.error(`Error: ${error.message}`);
    }
  );

  return (
    <button
      onClick={() => mutate({ status: 'confirmed' })}
      disabled={isPending}
    >
      {isPending ? 'Updating...' : 'Confirm'}
    </button>
  );
}
```

---

## 6. FSM Live Synchronization

### FSM State Machine

```typescript
// types/fsm.ts
type ConversationFSMState =
  | 'idle'
  | 'waiting_for_input'
  | 'processing'
  | 'ai_responding'
  | 'tool_executing'
  | 'human_takeover'
  | 'escalated'
  | 'resolved';

interface FSMTransition {
  from: ConversationFSMState;
  to: ConversationFSMState;
  trigger: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// lib/fsm/ConversationFSM.ts
class ConversationFSM {
  private currentState: ConversationFSMState = 'idle';
  private transitions: FSMTransition[] = [];
  private listeners: Map<string, Function[]> = new Map();

  constructor(private conversationId: string) {}

  public transition(
    to: ConversationFSMState,
    trigger: string,
    metadata?: Record<string, any>
  ) {
    const from = this.currentState;

    // Validate transition
    if (!this.isValidTransition(from, to)) {
      throw new Error(`Invalid transition from ${from} to ${to}`);
    }

    const transitionRecord: FSMTransition = {
      from,
      to,
      trigger,
      timestamp: Date.now(),
      metadata,
    };

    this.currentState = to;
    this.transitions.push(transitionRecord);

    // Emit event
    this.emit('transition', transitionRecord);

    // Broadcast to all clients
    eventBus.emit('fsm.transitioned', {
      conversationId: this.conversationId,
      transition: transitionRecord,
    });

    // Update store
    useConversationsStore.setState((state) => {
      state.fsm.set(this.conversationId, {
        currentState: to,
        transitions: this.transitions,
      });
      return state;
    });
  }

  private isValidTransition(from: ConversationFSMState, to: ConversationFSMState): boolean {
    const validTransitions: Record<ConversationFSMState, ConversationFSMState[]> = {
      idle: ['waiting_for_input'],
      waiting_for_input: ['processing', 'idle'],
      processing: ['ai_responding', 'tool_executing', 'human_takeover'],
      ai_responding: ['waiting_for_input', 'tool_executing', 'escalated'],
      tool_executing: ['ai_responding', 'waiting_for_input', 'escalated'],
      human_takeover: ['resolved', 'escalated'],
      escalated: ['human_takeover', 'resolved'],
      resolved: ['idle'],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  public on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  public getState(): ConversationFSMState {
    return this.currentState;
  }

  public getTransitions(): FSMTransition[] {
    return this.transitions;
  }
}
```

---

## 7. Conflict Resolution

### Strategy

```typescript
// lib/sync/ConflictResolver.ts
type ConflictResolutionStrategy = 'server-wins' | 'client-wins' | 'merge' | 'manual';

interface ConflictResolution<T> {
  strategy: ConflictResolutionStrategy;
  clientVersion: T;
  serverVersion: T;
  resolvedVersion: T;
  timestamp: number;
}

class ConflictResolver {
  static resolve<T extends { version: number; updatedAt: number }>(
    clientVersion: T,
    serverVersion: T,
    strategy: ConflictResolutionStrategy = 'server-wins'
  ): T {
    switch (strategy) {
      case 'server-wins':
        return serverVersion;

      case 'client-wins':
        return clientVersion;

      case 'merge':
        return this.mergeVersions(clientVersion, serverVersion);

      case 'manual':
        // Trigger manual resolution UI
        return this.triggerManualResolution(clientVersion, serverVersion);

      default:
        return serverVersion;
    }
  }

  private static mergeVersions<T extends Record<string, any>>(
    client: T,
    server: T
  ): T {
    // Merge strategy: take server values for system fields, client for user fields
    return {
      ...server,
      ...Object.fromEntries(
        Object.entries(client).filter(([key]) => !['version', 'updatedAt', 'id'].includes(key))
      ),
    };
  }

  private static triggerManualResolution<T>(client: T, server: T): T {
    // Show conflict resolution UI
    eventBus.emit('conflict.detected', { client, server });
    return server; // Default to server while user decides
  }
}
```

---

## 8. Error Handling & Recovery

### Retry Strategy

```typescript
// lib/retry/RetryManager.ts
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

class RetryManager {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  };

  static async retry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < finalConfig.maxAttempts - 1) {
          const delay = this.calculateDelay(attempt, finalConfig);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Retry failed');
  }

  private static calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.round(delay);
  }
}

// Usage
async function fetchAppointmentsWithRetry() {
  return RetryManager.retry(
    () => api.getAppointments(),
    { maxAttempts: 3, initialDelay: 500 }
  );
}
```

### Reconnection Logic

```typescript
// lib/websocket/ReconnectionManager.ts
class ReconnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isReconnecting = false;

  async reconnect(wsManager: WebSocketManager): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        const delay = this.calculateBackoffDelay();
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Attempt to reconnect
        await wsManager.connect();

        // If successful, sync state
        await this.syncState();

        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        return;
      } catch (error) {
        this.reconnectAttempts++;
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      }
    }

    // Max attempts reached
    eventBus.emit('reconnection.failed');
    this.isReconnecting = false;
  }

  private calculateBackoffDelay(): number {
    return Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );
  }

  private async syncState(): Promise<void> {
    // Sync all stores with server
    const appointments = await api.getAppointments();
    const conversations = await api.getConversations();

    useAppointmentsStore.setState({ appointments });
    useConversationsStore.setState({ conversations });
  }
}
```

---

## 9. Presence System

### User Presence Tracking

```typescript
// lib/presence/PresenceManager.ts
interface UserPresence {
  userId: string;
  barberId?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: number;
  currentConversation?: string;
  currentAppointment?: string;
}

class PresenceManager {
  private presenceMap: Map<string, UserPresence> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private supabase: SupabaseClient) {
    this.startHeartbeat();
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.updatePresence();
    }, 30000); // Every 30 seconds
  }

  private async updatePresence() {
    const userId = this.supabase.auth.user()?.id;
    if (!userId) return;

    const presence: UserPresence = {
      userId,
      status: 'online',
      lastSeen: Date.now(),
      currentConversation: useConversationsStore.getState().activeConversation?.id,
      currentAppointment: useAppointmentsStore.getState().selectedAppointment?.id,
    };

    await this.supabase
      .channel('presence')
      .track(presence)
      .catch((error) => console.error('Presence update failed:', error));
  }

  public getPresence(userId: string): UserPresence | undefined {
    return this.presenceMap.get(userId);
  }

  public getAllPresence(): UserPresence[] {
    return Array.from(this.presenceMap.values());
  }

  public setPresence(userId: string, presence: UserPresence) {
    this.presenceMap.set(userId, presence);
    eventBus.emit('presence.updated', { userId, presence });
  }

  public removePresence(userId: string) {
    this.presenceMap.delete(userId);
    eventBus.emit('presence.removed', { userId });
  }

  public destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
```

---

## 10. Event Bus

### Central Event Dispatcher

```typescript
// lib/events/EventBus.ts
class EventBus {
  private listeners: Map<string, Function[]> = new Map();

  public on(eventType: string, listener: Function): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    this.listeners.get(eventType)!.push(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  public once(eventType: string, listener: Function): () => void {
    const unsubscribe = this.on(eventType, (...args: any[]) => {
      listener(...args);
      unsubscribe();
    });
    return unsubscribe;
  }

  public emit(eventType: string, data?: any) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }

  public off(eventType: string, listener?: Function) {
    if (!listener) {
      this.listeners.delete(eventType);
    } else {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }

  public clear() {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
```

---

## 11. Real-Time UI Patterns

### Conversation Panel with Live Updates

```typescript
// components/ConversationPanel.tsx
export function ConversationPanel({ conversationId }: { conversationId: string }) {
  const messages = useConversationsStore((s) => s.messages.get(conversationId) || []);
  const typingUsers = useConversationsStore((s) => s.typingUsers.get(conversationId) || []);
  const fsm = useConversationsStore((s) => s.fsm.get(conversationId));
  const toolExecutions = useConversationsStore((s) =>
    s.toolExecutions.get(conversationId) || []
  );

  useEffect(() => {
    // Subscribe to real-time events
    const unsubscribeMessage = eventBus.on('conversation.message_received', (event) => {
      if (event.data.conversationId === conversationId) {
        useConversationsStore.getState().addMessage(conversationId, event.data);
      }
    });

    const unsubscribeTyping = eventBus.on('conversation.typing_started', (event) => {
      if (event.data.conversationId === conversationId) {
        useConversationsStore.getState().setTyping(conversationId, event.data.userId);
      }
    });

    const unsubscribeFSM = eventBus.on('fsm.transitioned', (event) => {
      if (event.data.conversationId === conversationId) {
        useConversationsStore.getState().updateFSM(conversationId, event.data.state);
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeTyping();
      unsubscribeFSM();
    };
  }, [conversationId]);

  return (
    <div className="space-y-4">
      {/* FSM State Indicator */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Estado:</span>
          <span className="font-mono font-bold text-accent">{fsm?.currentState}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.sender === 'client' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.sender === 'client'
                  ? 'bg-secondary text-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              <p className="text-sm">{msg.content}</p>
              {msg.status === 'pending' && (
                <p className="text-xs opacity-70 mt-1">Enviando...</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Typing Indicators */}
      {typingUsers.length > 0 && (
        <div className="text-xs text-muted-foreground italic">
          {typingUsers.join(', ')} está escribiendo...
        </div>
      )}

      {/* Tool Execution Timeline */}
      {toolExecutions.length > 0 && (
        <div className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2">
          {toolExecutions.map((exec) => (
            <div key={exec.id} className="text-xs">
              <div className="flex items-center gap-2">
                {exec.status === 'executing' && (
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                )}
                {exec.status === 'completed' && (
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                )}
                {exec.status === 'failed' && (
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                )}
                <span className="font-mono text-foreground">{exec.name}</span>
                <span className="text-muted-foreground">{exec.status}</span>
              </div>
              {exec.latency && (
                <p className="text-muted-foreground ml-4">{exec.latency}ms</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 12. Performance Optimization

### Memoization & Batching

```typescript
// hooks/useBatchedUpdates.ts
export function useBatchedUpdates<T>(
  updates: T[],
  onBatch: (batch: T[]) => Promise<void>,
  batchSize: number = 10,
  batchDelay: number = 1000
) {
  const [isPending, setIsPending] = useState(false);
  const batchQueue = useRef<T[]>([]);
  const batchTimer = useRef<NodeJS.Timeout | null>(null);

  const addUpdate = useCallback((update: T) => {
    batchQueue.current.push(update);

    if (batchQueue.current.length >= batchSize) {
      flushBatch();
    } else if (!batchTimer.current) {
      batchTimer.current = setTimeout(flushBatch, batchDelay);
    }
  }, [batchSize, batchDelay]);

  const flushBatch = useCallback(async () => {
    if (batchQueue.current.length === 0) return;

    setIsPending(true);
    const batch = batchQueue.current.splice(0, batchSize);

    try {
      await onBatch(batch);
    } catch (error) {
      console.error('Batch update failed:', error);
      // Re-queue failed updates
      batchQueue.current.unshift(...batch);
    } finally {
      setIsPending(false);
    }

    if (batchTimer.current) {
      clearTimeout(batchTimer.current);
      batchTimer.current = null;
    }
  }, [batchSize, onBatch]);

  useEffect(() => {
    return () => {
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
      }
    };
  }, []);

  return { addUpdate, flushBatch, isPending };
}
```

---

## Summary

This architecture transforms BARBERAGENT into a **live operational system** with:

- **Event-driven communication** via WebSocket and Supabase Realtime
- **Optimistic updates** for instant UI feedback
- **FSM synchronization** for conversation state tracking
- **Conflict resolution** for multi-client scenarios
- **Presence tracking** for team awareness
- **Robust error handling** with retry logic and reconnection
- **Performance optimization** through batching and memoization

The system feels like a command center where every action is immediately reflected, creating a sense of **liveness** and **operational control**.

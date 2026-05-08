# BARBERAGENT Real-Time Integration Guide

## Quick Start

### 1. Initialize Real-Time Connection

In your root layout or App component:

```typescript
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function App() {
  // Initialize all real-time syncs
  useRealtimeSync();

  return (
    // Your app content
  );
}
```

### 2. Use Real-Time Stores

Access real-time state in any component:

```typescript
import { useAppointmentsStore, useConversationsStore } from '@/stores/useRealtimeStores';

export function MyComponent() {
  const appointments = useAppointmentsStore((s) => s.appointments);
  const conversations = useConversationsStore((s) => s.conversations);

  return (
    // Your component
  );
}
```

### 3. Send Real-Time Updates

```typescript
import { useSendMessage, useSendAppointmentUpdate } from '@/hooks/useRealtimeSync';

export function ConversationInput() {
  const sendMessage = useSendMessage();

  const handleSend = async () => {
    await sendMessage(conversationId, 'Hello!');
  };

  return (
    // Your component
  );
}
```

---

## Architecture Overview

### Event Flow

```
Backend Event → WebSocket → EventBus → Zustand Store → React Component
     ↓              ↓            ↓           ↓              ↓
  NestJS       Socket.io    eventBus    useStore()      UI Updates
  Supabase                  emits()      selectors
  Redis                     listeners
```

### Real-Time Stores

| Store | Purpose | Key State |
|-------|---------|-----------|
| `useAppointmentsStore` | Appointment management | appointments, selectedAppointment, optimisticUpdates |
| `useConversationsStore` | Conversation & messaging | conversations, messages, typingUsers, fsm, toolExecutions |
| `useRealtimeStore` | Connection status | isConnected, connectionStatus, pendingEvents, syncErrors |
| `useBarbersStore` | Barber availability | barbers, status, availableSlots |
| `usePresenceStore` | User presence | users, online/offline status |

---

## Event Types

### Appointment Events

```typescript
Events.APPOINTMENT_CREATED      // New appointment
Events.APPOINTMENT_UPDATED      // Appointment modified
Events.APPOINTMENT_CANCELLED    // Appointment cancelled
Events.APPOINTMENT_CONFIRMED    // Appointment confirmed
Events.APPOINTMENT_COMPLETED    // Appointment completed
```

### Conversation Events

```typescript
Events.CONVERSATION_STARTED     // New conversation
Events.CONVERSATION_MESSAGE     // New message
Events.CONVERSATION_TYPING      // User typing
Events.CONVERSATION_ESCALATED   // Escalated to human
Events.CONVERSATION_RESOLVED    // Conversation resolved
```

### AI & Tool Events

```typescript
Events.AI_RESPONDING            // AI processing
Events.AI_RESPONSE_RECEIVED     // AI response ready
Events.TOOL_EXECUTING           // Tool running
Events.TOOL_EXECUTED            // Tool completed
Events.TOOL_FAILED              // Tool error
```

### FSM Events

```typescript
Events.FSM_TRANSITIONED         // State machine transition
Events.FSM_ERROR                // FSM error
```

### Barber Events

```typescript
Events.BARBER_ONLINE            // Barber came online
Events.BARBER_OFFLINE           // Barber went offline
Events.BARBER_AVAILABLE         // Barber available for appointments
Events.BARBER_BUSY              // Barber busy
```

### Presence Events

```typescript
Events.PRESENCE_UPDATED         // User presence changed
Events.PRESENCE_USER_ONLINE     // User came online
Events.PRESENCE_USER_OFFLINE    // User went offline
```

---

## Patterns & Best Practices

### Optimistic Updates

```typescript
import { useSendAppointmentUpdate } from '@/hooks/useRealtimeSync';

export function UpdateAppointmentButton() {
  const sendUpdate = useSendAppointmentUpdate();

  const handleConfirm = async () => {
    try {
      // Optimistic update happens immediately
      await sendUpdate(appointmentId, { status: 'confirmed' });
      toast.success('Appointment confirmed');
    } catch (error) {
      // Automatically rolled back on error
      toast.error('Failed to confirm');
    }
  };

  return <button onClick={handleConfirm}>Confirm</button>;
}
```

### Real-Time Typing Indicators

```typescript
import { useSendTypingIndicator } from '@/hooks/useRealtimeSync';

export function MessageInput({ conversationId }) {
  const sendTyping = useSendTypingIndicator(conversationId);

  const handleChange = (e) => {
    sendTyping(true); // User is typing
    // Auto-clear after 1 second of inactivity
  };

  return <input onChange={handleChange} />;
}
```

### Message Status Tracking

```typescript
const messages = useConversationsStore((s) => s.getMessages(conversationId));

messages.map((msg) => (
  <div key={msg.id}>
    {msg.content}
    {msg.status === 'pending' && <Spinner />}
    {msg.status === 'sent' && <CheckIcon />}
    {msg.status === 'read' && <DoubleCheckIcon />}
  </div>
));
```

### FSM State Visualization

```typescript
const fsm = useConversationsStore((s) => s.getFSM(conversationId));

<div>
  Current State: <strong>{fsm?.currentState}</strong>
  {fsm?.currentState === 'ai_responding' && <Spinner />}
  {fsm?.currentState === 'tool_executing' && <ToolIcon />}
  {fsm?.currentState === 'human_takeover' && <AlertIcon />}
</div>
```

### Tool Execution Timeline

```typescript
const toolExecutions = useConversationsStore((s) =>
  s.getToolExecutions(conversationId)
);

<div>
  {toolExecutions.map((exec) => (
    <div key={exec.id}>
      <span>{exec.name}</span>
      <span>{exec.status}</span>
      {exec.latency && <span>{exec.latency}ms</span>}
    </div>
  ))}
</div>
```

---

## Connection Management

### Check Connection Status

```typescript
import { useRealtimeStore } from '@/stores/useRealtimeStores';

export function ConnectionStatus() {
  const { isConnected, connectionStatus } = useRealtimeStore();

  return (
    <div>
      {isConnected ? (
        <span className="text-green-500">Connected</span>
      ) : (
        <span className="text-red-500">Disconnected</span>
      )}
      <span>{connectionStatus}</span>
    </div>
  );
}
```

### Handle Reconnection

```typescript
import { useEffect } from 'react';
import { eventBus, Events } from '@/lib/events/EventBus';

export function ReconnectionHandler() {
  useEffect(() => {
    const unsubscribe = eventBus.on(Events.DISCONNECTED, () => {
      console.log('Disconnected, attempting to reconnect...');
      // WebSocketManager handles auto-reconnection
    });

    return unsubscribe;
  }, []);

  return null;
}
```

---

## Error Handling

### Sync Errors

```typescript
import { useRealtimeStore } from '@/stores/useRealtimeStores';

export function SyncErrorDisplay() {
  const { syncErrors } = useRealtimeStore();

  return (
    <div>
      {Array.from(syncErrors.entries()).map(([key, error]) => (
        <div key={key} className="error">
          {error}
        </div>
      ))}
    </div>
  );
}
```

### Pending Events

```typescript
import { useRealtimeStore } from '@/stores/useRealtimeStores';

export function PendingEventsIndicator() {
  const { pendingEvents } = useRealtimeStore();

  if (pendingEvents.length === 0) return null;

  return (
    <div className="warning">
      {pendingEvents.length} events pending sync
    </div>
  );
}
```

---

## Performance Optimization

### Memoize Selectors

```typescript
import { useMemo } from 'react';
import { useAppointmentsStore } from '@/stores/useRealtimeStores';

export function AppointmentList() {
  // Memoize selector to prevent unnecessary re-renders
  const appointments = useMemo(
    () => useAppointmentsStore((s) => s.appointments),
    []
  );

  return (
    // Render appointments
  );
}
```

### Batch Updates

```typescript
import { useRealtimeStore } from '@/stores/useRealtimeStores';

export function BatchUpdateExample() {
  const { addPendingEvent } = useRealtimeStore();

  const handleBatchUpdate = async (updates: any[]) => {
    // Queue multiple events
    updates.forEach((update) => {
      addPendingEvent(update.id, update.type, update.data);
    });

    // Send all at once
    await sendBatch(updates);
  };

  return null;
}
```

---

## Testing Real-Time Features

### Mock Events

```typescript
import { eventBus, Events } from '@/lib/events/EventBus';

// Emit test event
eventBus.emit(Events.APPOINTMENT_CREATED, {
  id: 'apt_123',
  clientName: 'John',
  status: 'confirmed',
});

// Check store was updated
const appointments = useAppointmentsStore.getState().appointments;
expect(appointments).toHaveLength(1);
```

### Spy on WebSocket

```typescript
import { getWSManager } from '@/lib/websocket/WebSocketManager';

const wsManager = getWSManager();
const emitSpy = jest.spyOn(wsManager, 'emit');

// Trigger action
await sendMessage(conversationId, 'Hello');

// Verify WebSocket emit was called
expect(emitSpy).toHaveBeenCalledWith('conversation.message.send', {
  conversationId,
  content: 'Hello',
});
```

---

## Debugging

### Enable Event Logging

```typescript
import { eventBus } from '@/lib/events/EventBus';

// Log all events
const allEvents = eventBus.getHistory();
console.log('Event history:', allEvents);

// Log specific event type
const appointmentEvents = eventBus.getHistory('appointment.created');
console.log('Appointment events:', appointmentEvents);
```

### Check Store State

```typescript
import { useAppointmentsStore } from '@/stores/useRealtimeStores';

// Get current state
const state = useAppointmentsStore.getState();
console.log('Appointments:', state.appointments);
console.log('Optimistic updates:', state.optimisticUpdates);
```

### Monitor WebSocket

```typescript
import { getWSManager } from '@/lib/websocket/WebSocketManager';

const wsManager = getWSManager();
console.log('Connected:', wsManager.isOnline());
console.log('Pending messages:', wsManager.getPendingMessageCount());
console.log('Client ID:', wsManager.getClientId());
```

---

## Common Issues & Solutions

### Messages Not Appearing

1. **Check connection**: `wsManager.isOnline()`
2. **Check store**: `useConversationsStore.getState().messages`
3. **Check events**: `eventBus.getHistory('conversation.message')`
4. **Check WebSocket**: Browser DevTools → Network → WS

### Optimistic Updates Not Rolling Back

1. **Verify error handling**: Check catch block in useSendMessage
2. **Check store state**: `useAppointmentsStore.getState().optimisticUpdates`
3. **Verify rollback**: Ensure `rollbackOptimistic` is called on error

### Typing Indicators Not Clearing

1. **Check timeout**: Verify `typingTimeoutRef` is set correctly
2. **Check event**: Verify `CONVERSATION_TYPING` event is emitted
3. **Check store**: `useConversationsStore.getState().typingUsers`

### FSM State Not Updating

1. **Check event**: Verify `FSM_TRANSITIONED` event is emitted
2. **Check store**: `useConversationsStore.getState().fsm`
3. **Check transitions**: Verify FSM state machine logic

---

## Next Steps

1. **Implement Real-Time Calendar** — Drag-drop appointments with conflict detection
2. **Add Presence Indicators** — Show online barbers and operators
3. **Implement Notifications** — Toast/bell notifications for events
4. **Add Analytics** — Track real-time metrics and latency
5. **Optimize Performance** — Implement virtual scrolling for large lists

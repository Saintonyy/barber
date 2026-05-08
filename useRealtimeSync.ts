/**
 * Real-Time Synchronization Hooks
 * Design: Minimalist Brutalism - Direct, no-nonsense real-time integration
 */

import { useEffect, useCallback, useRef } from 'react';
import { eventBus, Events } from '@/lib/events/EventBus';
import { getWSManager } from '@/lib/websocket/WebSocketManager';
import {
  useAppointmentsStore,
  useConversationsStore,
  useRealtimeStore,
  useBarbersStore,
  usePresenceStore,
  Appointment,
  Message,
  Conversation,
} from '@/stores/useRealtimeStores';

/**
 * Initialize real-time connection and sync
 */
export function useRealtimeConnection() {
  const { setConnected, setConnectionStatus } = useRealtimeStore();
  const wsManager = useRef(getWSManager());
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initializeConnection = async () => {
      try {
        setConnectionStatus('connecting');
        await wsManager.current.connect();
        setConnected(true);
        setConnectionStatus('connected');
      } catch (error) {
        console.error('Failed to connect:', error);
        setConnectionStatus('error');
      }
    };

    initializeConnection();

    // Cleanup
    return () => {
      wsManager.current.disconnect();
    };
  }, [setConnected, setConnectionStatus]);

  return wsManager.current;
}

/**
 * Sync appointments in real-time
 */
export function useAppointmentsSync() {
  const {
    addAppointment,
    updateAppointment,
    deleteAppointment,
    setAppointments,
  } = useAppointmentsStore();

  useEffect(() => {
    const unsubscribeCreated = eventBus.on(Events.APPOINTMENT_CREATED, (event) => {
      addAppointment(event.data);
    });

    const unsubscribeUpdated = eventBus.on(Events.APPOINTMENT_UPDATED, (event) => {
      updateAppointment(event.data.id, event.data);
    });

    const unsubscribeCancelled = eventBus.on(Events.APPOINTMENT_CANCELLED, (event) => {
      deleteAppointment(event.data.id);
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeCancelled();
    };
  }, [addAppointment, updateAppointment, deleteAppointment]);
}

/**
 * Sync conversations and messages in real-time
 */
export function useConversationsSync() {
  const {
    addConversation,
    updateConversation,
    addMessage,
    updateMessage,
    setTyping,
    clearTyping,
    updateFSM,
    addToolExecution,
    updateToolExecution,
  } = useConversationsStore();

  useEffect(() => {
    const unsubscribeStarted = eventBus.on(Events.CONVERSATION_STARTED, (event) => {
      addConversation(event.data);
    });

    const unsubscribeMessage = eventBus.on(Events.CONVERSATION_MESSAGE, (event) => {
      const { conversationId, message } = event.data;
      addMessage(conversationId, message);
      // Update conversation last message
      updateConversation(conversationId, {
        lastMessage: message.content,
        lastMessageTime: message.timestamp,
      });
    });

    const unsubscribeTyping = eventBus.on(Events.CONVERSATION_TYPING, (event) => {
      const { conversationId, userId, isTyping } = event.data;
      if (isTyping) {
        setTyping(conversationId, userId);
        // Auto-clear typing after 3 seconds
        setTimeout(() => clearTyping(conversationId, userId), 3000);
      } else {
        clearTyping(conversationId, userId);
      }
    });

    const unsubscribeFSM = eventBus.on(Events.FSM_TRANSITIONED, (event) => {
      const { conversationId, transition } = event.data;
      updateFSM(conversationId, {
        conversationId,
        currentState: transition.to,
        previousState: transition.from,
        transitions: [transition],
      });
    });

    const unsubscribeToolExecuting = eventBus.on(Events.TOOL_EXECUTING, (event) => {
      const { conversationId, execution } = event.data;
      addToolExecution(conversationId, execution);
    });

    const unsubscribeToolExecuted = eventBus.on(Events.TOOL_EXECUTED, (event) => {
      const { conversationId, executionId, output, latency } = event.data;
      updateToolExecution(conversationId, executionId, {
        status: 'completed',
        output,
        latency,
        completedAt: Date.now(),
      });
    });

    const unsubscribeToolFailed = eventBus.on(Events.TOOL_FAILED, (event) => {
      const { conversationId, executionId, error } = event.data;
      updateToolExecution(conversationId, executionId, {
        status: 'failed',
        error,
        completedAt: Date.now(),
      });
    });

    const unsubscribeEscalated = eventBus.on(Events.CONVERSATION_ESCALATED, (event) => {
      const { conversationId } = event.data;
      updateConversation(conversationId, { status: 'escalated' });
    });

    return () => {
      unsubscribeStarted();
      unsubscribeMessage();
      unsubscribeTyping();
      unsubscribeFSM();
      unsubscribeToolExecuting();
      unsubscribeToolExecuted();
      unsubscribeToolFailed();
      unsubscribeEscalated();
    };
  }, [
    addConversation,
    updateConversation,
    addMessage,
    updateMessage,
    setTyping,
    clearTyping,
    updateFSM,
    addToolExecution,
    updateToolExecution,
  ]);
}

/**
 * Sync barber status in real-time
 */
export function useBarbersSync() {
  const { updateBarber } = useBarbersStore();

  useEffect(() => {
    const unsubscribeOnline = eventBus.on(Events.BARBER_ONLINE, (event) => {
      updateBarber(event.data.barberId, { status: 'online', lastSeen: Date.now() });
    });

    const unsubscribeOffline = eventBus.on(Events.BARBER_OFFLINE, (event) => {
      updateBarber(event.data.barberId, { status: 'offline', lastSeen: Date.now() });
    });

    const unsubscribeAvailable = eventBus.on(Events.BARBER_AVAILABLE, (event) => {
      updateBarber(event.data.barberId, { status: 'available' });
    });

    const unsubscribeBusy = eventBus.on(Events.BARBER_BUSY, (event) => {
      updateBarber(event.data.barberId, {
        status: 'busy',
        currentAppointmentId: event.data.appointmentId,
      });
    });

    return () => {
      unsubscribeOnline();
      unsubscribeOffline();
      unsubscribeAvailable();
      unsubscribeBusy();
    };
  }, [updateBarber]);
}

/**
 * Sync user presence in real-time
 */
export function usePresenceSync() {
  const { setPresence, removePresence } = usePresenceStore();

  useEffect(() => {
    const unsubscribeOnline = eventBus.on(Events.PRESENCE_USER_ONLINE, (event) => {
      setPresence(event.data.userId, event.data);
    });

    const unsubscribeOffline = eventBus.on(Events.PRESENCE_USER_OFFLINE, (event) => {
      removePresence(event.data.userId);
    });

    const unsubscribeUpdated = eventBus.on(Events.PRESENCE_UPDATED, (event) => {
      setPresence(event.data.userId, event.data);
    });

    return () => {
      unsubscribeOnline();
      unsubscribeOffline();
      unsubscribeUpdated();
    };
  }, [setPresence, removePresence]);
}

/**
 * Send appointment update with optimistic update
 */
export function useSendAppointmentUpdate() {
  const { optimisticUpdate, rollbackOptimistic, confirmOptimistic } =
    useAppointmentsStore();
  const wsManager = getWSManager();

  return useCallback(
    async (appointmentId: string, updates: Partial<Appointment>) => {
      // Optimistic update
      optimisticUpdate(appointmentId, updates);

      try {
        // Send to server
        wsManager.emit('appointment.update', {
          appointmentId,
          updates,
        });

        // Wait for confirmation (with timeout)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Confirm optimistic update
        confirmOptimistic(appointmentId);
      } catch (error) {
        // Rollback on error
        rollbackOptimistic(appointmentId);
        throw error;
      }
    },
    [optimisticUpdate, rollbackOptimistic, confirmOptimistic]
  );
}

/**
 * Send conversation message
 */
export function useSendMessage() {
  const { addMessage, updateMessage } = useConversationsStore();
  const wsManager = getWSManager();

  return useCallback(
    async (conversationId: string, content: string) => {
      const messageId = `msg_${Date.now()}`;
      const message: Message = {
        id: messageId,
        conversationId,
        sender: 'client',
        content,
        timestamp: Date.now(),
        status: 'pending',
      };

      // Optimistic update
      addMessage(conversationId, message);

      try {
        // Send to server
        wsManager.emit('conversation.message.send', {
          conversationId,
          content,
        });

        // Update status
        updateMessage(conversationId, messageId, { status: 'sent' });
      } catch (error) {
        updateMessage(conversationId, messageId, { status: 'pending' });
        throw error;
      }
    },
    [addMessage, updateMessage]
  );
}

/**
 * Send typing indicator
 */
export function useSendTypingIndicator(conversationId: string) {
  const wsManager = getWSManager();

  return useCallback(
    (isTyping: boolean) => {
      wsManager.emit('conversation.typing', {
        conversationId,
        isTyping,
      });
    },
    [conversationId]
  );
}

/**
 * Escalate conversation
 */
export function useEscalateConversation() {
  const { updateConversation } = useConversationsStore();
  const wsManager = getWSManager();

  return useCallback(
    (conversationId: string, reason: string) => {
      updateConversation(conversationId, { status: 'escalated' });
      wsManager.emit('conversation.escalate', {
        conversationId,
        reason,
      });
    },
    [updateConversation]
  );
}

/**
 * Initialize all real-time syncs
 */
export function useRealtimeSync() {
  useRealtimeConnection();
  useAppointmentsSync();
  useConversationsSync();
  useBarbersSync();
  usePresenceSync();
}

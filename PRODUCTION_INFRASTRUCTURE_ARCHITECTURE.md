# BARBERAGENT: Production-Grade Distributed Operational Infrastructure

## Executive Summary

BARBERAGENT evoluciona de un sistema de coordinación en tiempo real a una **infraestructura operativa distribuida de nivel production** con observabilidad completa, resiliencia automática, debugging avanzado, replayability determinística, y coordinación distribuida.

Este documento define la arquitectura, patrones, y sistemas necesarios para operar BARBERAGENT como un **centro operativo vivo** que puede sobrevivir fallos, reconstruir eventos, diagnosticar conflictos, mantener sincronización, recuperarse automáticamente, y escalar operacionalmente.

---

## Parte 1: Observability Layer

### 1.1 Operational Observability System

```typescript
// lib/observability/ObservabilityLayer.ts

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  labels?: string[];
}

export interface HealthScore {
  overall: number; // 0-100
  websocket: number;
  eventProcessing: number;
  stateSync: number;
  lockCoordination: number;
  queueHealth: number;
  errorRate: number;
  latency: number;
}

export class ObservabilityLayer {
  private metrics: Map<string, Metric[]> = new Map();
  private healthHistory: HealthScore[] = [];
  private readonly MAX_HISTORY = 1000;
  private metricsBuffer: Metric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(private readonly flushIntervalMs: number = 5000) {
    this.startFlushInterval();
  }

  /**
   * Record a metric
   */
  recordMetric(
    name: string,
    type: MetricType,
    value: number,
    tags: Record<string, string> = {}
  ): void {
    const metric: Metric = {
      name,
      type,
      value,
      timestamp: Date.now(),
      tags,
    };

    this.metricsBuffer.push(metric);

    // Flush if buffer is large
    if (this.metricsBuffer.length > 100) {
      this.flush();
    }
  }

  /**
   * Record WebSocket latency
   */
  recordWebSocketLatency(latency: number, success: boolean): void {
    this.recordMetric('websocket.latency', MetricType.HISTOGRAM, latency, {
      status: success ? 'success' : 'failure',
    });

    if (!success) {
      this.recordMetric('websocket.errors', MetricType.COUNTER, 1);
    }
  }

  /**
   * Record dropped events
   */
  recordDroppedEvent(reason: string): void {
    this.recordMetric('events.dropped', MetricType.COUNTER, 1, { reason });
  }

  /**
   * Record stale store detection
   */
  recordStaleStore(storeName: string, staleness: number): void {
    this.recordMetric('store.staleness', MetricType.GAUGE, staleness, {
      store: storeName,
    });
  }

  /**
   * Record lock contention
   */
  recordLockContention(lockId: string, waitTime: number, acquired: boolean): void {
    this.recordMetric('lock.contention', MetricType.HISTOGRAM, waitTime, {
      lock: lockId,
      acquired: acquired ? 'yes' : 'no',
    });
  }

  /**
   * Record queue pressure
   */
  recordQueuePressure(barberId: string, pressure: number): void {
    this.recordMetric('queue.pressure', MetricType.GAUGE, pressure, {
      barber: barberId,
    });
  }

  /**
   * Record optimistic rollback
   */
  recordOptimisticRollback(reason: string): void {
    this.recordMetric('optimistic.rollback', MetricType.COUNTER, 1, { reason });
  }

  /**
   * Record sync failure
   */
  recordSyncFailure(component: string, error: string): void {
    this.recordMetric('sync.failure', MetricType.COUNTER, 1, {
      component,
      error,
    });
  }

  /**
   * Record reconnection attempt
   */
  recordReconnectionAttempt(attempt: number, success: boolean): void {
    this.recordMetric('reconnect.attempt', MetricType.COUNTER, 1, {
      attempt: attempt.toString(),
      success: success ? 'yes' : 'no',
    });
  }

  /**
   * Record event throughput
   */
  recordEventThroughput(eventType: string, count: number): void {
    this.recordMetric('event.throughput', MetricType.COUNTER, count, {
      type: eventType,
    });
  }

  /**
   * Calculate real-time health score
   */
  calculateHealthScore(): HealthScore {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Get recent metrics
    const recentMetrics = this.metricsBuffer.filter((m) => m.timestamp > oneMinuteAgo);

    // WebSocket health
    const wsErrors = recentMetrics.filter(
      (m) => m.name === 'websocket.errors'
    ).length;
    const wsTotal = recentMetrics.filter(
      (m) => m.name === 'websocket.latency'
    ).length;
    const wsHealth = wsTotal > 0 ? Math.max(0, 100 - (wsErrors / wsTotal) * 100) : 100;

    // Event processing health
    const droppedEvents = recentMetrics.filter(
      (m) => m.name === 'events.dropped'
    ).length;
    const processedEvents = recentMetrics.filter(
      (m) => m.name === 'event.throughput'
    ).length;
    const eventHealth =
      processedEvents > 0
        ? Math.max(0, 100 - (droppedEvents / (processedEvents + droppedEvents)) * 100)
        : 100;

    // State sync health
    const syncFailures = recentMetrics.filter(
      (m) => m.name === 'sync.failure'
    ).length;
    const syncHealth = Math.max(0, 100 - syncFailures * 5);

    // Lock coordination health
    const lockContentions = recentMetrics.filter(
      (m) => m.name === 'lock.contention'
    ).length;
    const lockHealth = Math.max(0, 100 - lockContentions * 2);

    // Queue health
    const avgQueuePressure =
      recentMetrics
        .filter((m) => m.name === 'queue.pressure')
        .reduce((sum, m) => sum + m.value, 0) / Math.max(1, recentMetrics.length);
    const queueHealth = Math.max(0, 100 - avgQueuePressure);

    // Error rate
    const errors = recentMetrics.filter(
      (m) => m.tags.status === 'failure'
    ).length;
    const total = recentMetrics.length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    // Latency
    const latencies = recentMetrics
      .filter((m) => m.name.includes('latency'))
      .map((m) => m.value);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b) / latencies.length : 0;
    const latencyHealth = Math.max(0, 100 - (avgLatency / 100) * 10);

    // Overall health
    const overall = Math.round(
      (wsHealth + eventHealth + syncHealth + lockHealth + queueHealth + latencyHealth) / 6
    );

    const health: HealthScore = {
      overall: Math.min(100, Math.max(0, overall)),
      websocket: Math.round(wsHealth),
      eventProcessing: Math.round(eventHealth),
      stateSync: Math.round(syncHealth),
      lockCoordination: Math.round(lockHealth),
      queueHealth: Math.round(queueHealth),
      errorRate: Math.round(errorRate),
      latency: Math.round(avgLatency),
    };

    this.healthHistory.push(health);
    if (this.healthHistory.length > this.MAX_HISTORY) {
      this.healthHistory.shift();
    }

    return health;
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, any> {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const recentMetrics = this.metricsBuffer.filter((m) => m.timestamp > oneMinuteAgo);

    return {
      timestamp: now,
      totalMetrics: recentMetrics.length,
      websocketLatency: {
        avg: this.getAverageLatency(recentMetrics, 'websocket.latency'),
        p95: this.getPercentileLatency(recentMetrics, 'websocket.latency', 0.95),
        p99: this.getPercentileLatency(recentMetrics, 'websocket.latency', 0.99),
      },
      droppedEvents: recentMetrics.filter((m) => m.name === 'events.dropped').length,
      eventThroughput: recentMetrics.filter((m) => m.name === 'event.throughput').length,
      syncFailures: recentMetrics.filter((m) => m.name === 'sync.failure').length,
      lockContentions: recentMetrics.filter((m) => m.name === 'lock.contention').length,
      optimisticRollbacks: recentMetrics.filter(
        (m) => m.name === 'optimistic.rollback'
      ).length,
    };
  }

  /**
   * Flush metrics to backend
   */
  private flush(): void {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    // Send to backend
    eventBus.emit(Events.METRICS_FLUSHED, { metrics: metricsToFlush });
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  private getAverageLatency(metrics: Metric[], name: string): number {
    const latencies = metrics.filter((m) => m.name === name).map((m) => m.value);
    return latencies.length > 0 ? latencies.reduce((a, b) => a + b) / latencies.length : 0;
  }

  private getPercentileLatency(metrics: Metric[], name: string, percentile: number): number {
    const latencies = metrics
      .filter((m) => m.name === name)
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (latencies.length === 0) return 0;

    const index = Math.ceil(latencies.length * percentile) - 1;
    return latencies[Math.max(0, index)];
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// Singleton
let observabilityLayer: ObservabilityLayer | null = null;

export function getObservabilityLayer(): ObservabilityLayer {
  if (!observabilityLayer) {
    observabilityLayer = new ObservabilityLayer();
  }
  return observabilityLayer;
}
```

---

## Parte 2: Event Timeline Inspector

### 2.1 Event Timeline System

```typescript
// lib/debugging/EventTimeline.ts

export interface EventTimelineEntry {
  id: string;
  timestamp: number;
  type: string;
  source: 'incoming' | 'outgoing' | 'internal' | 'websocket' | 'fsm' | 'tool' | 'lock' | 'conflict' | 'retry' | 'queue';
  latency: number;
  correlationId: string;
  userId?: string;
  conversationId?: string;
  barberId?: string;
  appointmentId?: string;
  retryCount: number;
  payload: any;
  metadata: {
    status: 'pending' | 'success' | 'error' | 'rolled_back';
    error?: string;
    context?: Record<string, any>;
  };
}

export class EventTimeline {
  private entries: EventTimelineEntry[] = [];
  private readonly MAX_ENTRIES = 10000;
  private correlationMap: Map<string, EventTimelineEntry[]> = new Map();

  /**
   * Record event
   */
  recordEvent(
    type: string,
    source: EventTimelineEntry['source'],
    payload: any,
    correlationId: string,
    metadata?: {
      userId?: string;
      conversationId?: string;
      barberId?: string;
      appointmentId?: string;
      retryCount?: number;
      status?: EventTimelineEntry['metadata']['status'];
      error?: string;
      context?: Record<string, any>;
    }
  ): EventTimelineEntry {
    const entry: EventTimelineEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      type,
      source,
      latency: 0,
      correlationId,
      userId: metadata?.userId,
      conversationId: metadata?.conversationId,
      barberId: metadata?.barberId,
      appointmentId: metadata?.appointmentId,
      retryCount: metadata?.retryCount || 0,
      payload,
      metadata: {
        status: metadata?.status || 'pending',
        error: metadata?.error,
        context: metadata?.context,
      },
    };

    this.entries.push(entry);

    // Maintain correlation map
    if (!this.correlationMap.has(correlationId)) {
      this.correlationMap.set(correlationId, []);
    }
    this.correlationMap.get(correlationId)!.push(entry);

    // Trim if too large
    if (this.entries.length > this.MAX_ENTRIES) {
      const removed = this.entries.shift()!;
      const corr = this.correlationMap.get(removed.correlationId);
      if (corr) {
        const index = corr.indexOf(removed);
        if (index > -1) corr.splice(index, 1);
      }
    }

    return entry;
  }

  /**
   * Update event latency
   */
  updateLatency(entryId: string, latency: number): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.latency = latency;
    }
  }

  /**
   * Update event status
   */
  updateStatus(
    entryId: string,
    status: EventTimelineEntry['metadata']['status'],
    error?: string
  ): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.metadata.status = status;
      if (error) entry.metadata.error = error;
    }
  }

  /**
   * Get correlation chain
   */
  getCorrelationChain(correlationId: string): EventTimelineEntry[] {
    return this.correlationMap.get(correlationId) || [];
  }

  /**
   * Get timeline for conversation
   */
  getConversationTimeline(conversationId: string): EventTimelineEntry[] {
    return this.entries.filter((e) => e.conversationId === conversationId);
  }

  /**
   * Get timeline for appointment
   */
  getAppointmentTimeline(appointmentId: string): EventTimelineEntry[] {
    return this.entries.filter((e) => e.appointmentId === appointmentId);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): EventTimelineEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Get events by source
   */
  getEventsBySource(source: EventTimelineEntry['source']): EventTimelineEntry[] {
    return this.entries.filter((e) => e.source === source);
  }

  /**
   * Get failed events
   */
  getFailedEvents(): EventTimelineEntry[] {
    return this.entries.filter((e) => e.metadata.status === 'error');
  }

  /**
   * Get rolled back events
   */
  getRolledBackEvents(): EventTimelineEntry[] {
    return this.entries.filter((e) => e.metadata.status === 'rolled_back');
  }

  /**
   * Get retried events
   */
  getRetriedEvents(): EventTimelineEntry[] {
    return this.entries.filter((e) => e.retryCount > 0);
  }

  /**
   * Analyze event flow
   */
  analyzeEventFlow(correlationId: string): {
    chain: EventTimelineEntry[];
    duration: number;
    eventCount: number;
    errors: number;
    rollbacks: number;
    retries: number;
    avgLatency: number;
  } {
    const chain = this.getCorrelationChain(correlationId);

    if (chain.length === 0) {
      return {
        chain: [],
        duration: 0,
        eventCount: 0,
        errors: 0,
        rollbacks: 0,
        retries: 0,
        avgLatency: 0,
      };
    }

    const start = chain[0].timestamp;
    const end = chain[chain.length - 1].timestamp;
    const duration = end - start;

    const errors = chain.filter((e) => e.metadata.status === 'error').length;
    const rollbacks = chain.filter((e) => e.metadata.status === 'rolled_back').length;
    const retries = chain.reduce((sum, e) => sum + e.retryCount, 0);
    const avgLatency =
      chain.reduce((sum, e) => sum + e.latency, 0) / Math.max(1, chain.length);

    return {
      chain,
      duration,
      eventCount: chain.length,
      errors,
      rollbacks,
      retries,
      avgLatency,
    };
  }

  /**
   * Export timeline as JSON
   */
  exportTimeline(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Clear timeline
   */
  clear(): void {
    this.entries = [];
    this.correlationMap.clear();
  }
}

// Singleton
let eventTimeline: EventTimeline | null = null;

export function getEventTimeline(): EventTimeline {
  if (!eventTimeline) {
    eventTimeline = new EventTimeline();
  }
  return eventTimeline;
}
```

---

## Parte 3: Replay Engine

### 3.1 Deterministic Replay System

```typescript
// lib/debugging/ReplayEngine.ts

export interface ReplaySnapshot {
  id: string;
  timestamp: number;
  correlationId: string;
  state: {
    appointments: Appointment[];
    conversations: any[];
    barbers: Barber[];
    locks: any[];
    presence: any[];
  };
  events: EventTimelineEntry[];
}

export class ReplayEngine {
  private snapshots: Map<string, ReplaySnapshot> = new Map();
  private replayState: any = null;
  private isReplaying: boolean = false;

  /**
   * Create snapshot
   */
  createSnapshot(
    correlationId: string,
    state: ReplaySnapshot['state'],
    events: EventTimelineEntry[]
  ): ReplaySnapshot {
    const snapshot: ReplaySnapshot = {
      id: nanoid(),
      timestamp: Date.now(),
      correlationId,
      state,
      events,
    };

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Replay from snapshot
   */
  async replayFromSnapshot(snapshotId: string): Promise<{
    success: boolean;
    finalState: any;
    divergences: Array<{ event: EventTimelineEntry; expected: any; actual: any }>;
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return { success: false, finalState: null, divergences: [] };
    }

    this.isReplaying = true;
    this.replayState = JSON.parse(JSON.stringify(snapshot.state));

    const divergences: Array<{ event: EventTimelineEntry; expected: any; actual: any }> = [];

    try {
      for (const event of snapshot.events) {
        const beforeState = JSON.parse(JSON.stringify(this.replayState));

        // Apply event
        await this.applyEvent(event);

        const afterState = JSON.parse(JSON.stringify(this.replayState));

        // Verify determinism
        if (JSON.stringify(beforeState) === JSON.stringify(afterState)) {
          divergences.push({
            event,
            expected: beforeState,
            actual: afterState,
          });
        }
      }

      return {
        success: true,
        finalState: this.replayState,
        divergences,
      };
    } finally {
      this.isReplaying = false;
    }
  }

  /**
   * Partial replay
   */
  async partialReplay(
    snapshotId: string,
    eventFilter: (event: EventTimelineEntry) => boolean
  ): Promise<any> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return null;

    this.replayState = JSON.parse(JSON.stringify(snapshot.state));
    this.isReplaying = true;

    try {
      for (const event of snapshot.events) {
        if (eventFilter(event)) {
          await this.applyEvent(event);
        }
      }

      return this.replayState;
    } finally {
      this.isReplaying = false;
    }
  }

  /**
   * Event scrubbing (forward/backward)
   */
  scrubToEvent(snapshotId: string, eventId: string): any {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return null;

    const eventIndex = snapshot.events.findIndex((e) => e.id === eventId);
    if (eventIndex === -1) return null;

    this.replayState = JSON.parse(JSON.stringify(snapshot.state));
    this.isReplaying = true;

    try {
      for (let i = 0; i <= eventIndex; i++) {
        this.applyEventSync(snapshot.events[i]);
      }

      return this.replayState;
    } finally {
      this.isReplaying = false;
    }
  }

  /**
   * State diff visualization
   */
  diffStates(state1: any, state2: any): Array<{ path: string; before: any; after: any }> {
    const diffs: Array<{ path: string; before: any; after: any }> = [];

    const compare = (obj1: any, obj2: any, path: string = '') => {
      for (const key in obj1) {
        const newPath = path ? `${path}.${key}` : key;

        if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
          compare(obj1[key], obj2[key], newPath);
        } else if (obj1[key] !== obj2[key]) {
          diffs.push({
            path: newPath,
            before: obj1[key],
            after: obj2[key],
          });
        }
      }
    };

    compare(state1, state2);
    return diffs;
  }

  /**
   * Debug race condition
   */
  async debugRaceCondition(
    snapshotId: string,
    event1: EventTimelineEntry,
    event2: EventTimelineEntry
  ): Promise<{
    order1Result: any;
    order2Result: any;
    divergences: any[];
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return { order1Result: null, order2Result: null, divergences: [] };

    // Order 1: event1 then event2
    this.replayState = JSON.parse(JSON.stringify(snapshot.state));
    await this.applyEvent(event1);
    await this.applyEvent(event2);
    const order1Result = JSON.parse(JSON.stringify(this.replayState));

    // Order 2: event2 then event1
    this.replayState = JSON.parse(JSON.stringify(snapshot.state));
    await this.applyEvent(event2);
    await this.applyEvent(event1);
    const order2Result = JSON.parse(JSON.stringify(this.replayState));

    const divergences = this.diffStates(order1Result, order2Result);

    return {
      order1Result,
      order2Result,
      divergences,
    };
  }

  private async applyEvent(event: EventTimelineEntry): Promise<void> {
    // Simulate event application based on type
    switch (event.type) {
      case 'appointment.created':
        if (this.replayState.appointments) {
          this.replayState.appointments.push(event.payload);
        }
        break;
      case 'appointment.updated':
        if (this.replayState.appointments) {
          const apt = this.replayState.appointments.find(
            (a: any) => a.id === event.appointmentId
          );
          if (apt) Object.assign(apt, event.payload);
        }
        break;
      // ... handle other event types
    }

    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private applyEventSync(event: EventTimelineEntry): void {
    // Synchronous version for scrubbing
    switch (event.type) {
      case 'appointment.created':
        if (this.replayState.appointments) {
          this.replayState.appointments.push(event.payload);
        }
        break;
      case 'appointment.updated':
        if (this.replayState.appointments) {
          const apt = this.replayState.appointments.find(
            (a: any) => a.id === event.appointmentId
          );
          if (apt) Object.assign(apt, event.payload);
        }
        break;
    }
  }
}

// Singleton
let replayEngine: ReplayEngine | null = null;

export function getReplayEngine(): ReplayEngine {
  if (!replayEngine) {
    replayEngine = new ReplayEngine();
  }
  return replayEngine;
}
```

---

## Parte 4: Distributed Lock Coordination

### 4.1 Production-Grade Redis Locking

```typescript
// lib/distributed/DistributedLockManager.ts

export interface DistributedLock {
  lockId: string;
  resourceId: string;
  owner: string;
  acquiredAt: number;
  expiresAt: number;
  heartbeatInterval: number;
  retryCount: number;
  metadata: Record<string, any>;
}

export class DistributedLockManager {
  private locks: Map<string, DistributedLock> = new Map();
  private heartbeats: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;

  /**
   * Acquire lock with exponential backoff
   */
  async acquireLock(
    resourceId: string,
    owner: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<DistributedLock | null> {
    let retryCount = 0;

    while (retryCount < this.MAX_RETRIES) {
      const lockId = `lock:${resourceId}:${Date.now()}:${Math.random()}`;
      const expiresAt = Date.now() + ttl;

      // Try to acquire in Redis
      const acquired = await this.tryAcquireInRedis(resourceId, lockId, expiresAt);

      if (acquired) {
        const lock: DistributedLock = {
          lockId,
          resourceId,
          owner,
          acquiredAt: Date.now(),
          expiresAt,
          heartbeatInterval: this.HEARTBEAT_INTERVAL,
          retryCount,
          metadata: {},
        };

        this.locks.set(lockId, lock);
        this.startHeartbeat(lockId);

        eventBus.emit(Events.LOCK_ACQUIRED, { lock });
        return lock;
      }

      // Exponential backoff
      const backoffDelay = Math.pow(2, retryCount) * 100;
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      retryCount++;
    }

    eventBus.emit(Events.LOCK_FAILED, { resourceId, owner, retries: retryCount });
    return null;
  }

  /**
   * Release lock
   */
  async releaseLock(lockId: string): Promise<boolean> {
    const lock = this.locks.get(lockId);
    if (!lock) return false;

    // Stop heartbeat
    this.stopHeartbeat(lockId);

    // Release in Redis
    const released = await this.releaseInRedis(lock.resourceId, lockId);

    if (released) {
      this.locks.delete(lockId);
      eventBus.emit(Events.LOCK_RELEASED, { lockId });
    }

    return released;
  }

  /**
   * Renew lock heartbeat
   */
  private async renewHeartbeat(lockId: string): Promise<boolean> {
    const lock = this.locks.get(lockId);
    if (!lock) return false;

    const newExpiresAt = Date.now() + lock.heartbeatInterval * 2;

    // Renew in Redis
    const renewed = await this.renewInRedis(lock.resourceId, lockId, newExpiresAt);

    if (renewed) {
      lock.expiresAt = newExpiresAt;
      eventBus.emit(Events.LOCK_RENEWED, { lockId });
    }

    return renewed;
  }

  /**
   * Detect deadlock
   */
  detectDeadlock(): Array<{ lockId: string; owner: string; age: number }> {
    const deadlocks: Array<{ lockId: string; owner: string; age: number }> = [];
    const now = Date.now();

    for (const [lockId, lock] of this.locks) {
      const age = now - lock.acquiredAt;
      const maxAge = 5 * 60 * 1000; // 5 minutes

      if (age > maxAge) {
        deadlocks.push({ lockId, owner: lock.owner, age });
      }
    }

    return deadlocks;
  }

  /**
   * Force release lock (for deadlock recovery)
   */
  async forceReleaseLock(lockId: string): Promise<boolean> {
    const lock = this.locks.get(lockId);
    if (!lock) return false;

    this.stopHeartbeat(lockId);
    const released = await this.releaseInRedis(lock.resourceId, lockId);

    if (released) {
      this.locks.delete(lockId);
      eventBus.emit(Events.LOCK_FORCE_RELEASED, { lockId, owner: lock.owner });
    }

    return released;
  }

  /**
   * Get lock status
   */
  getLockStatus(resourceId: string): {
    locked: boolean;
    owner?: string;
    expiresIn?: number;
    age?: number;
  } {
    const locks = Array.from(this.locks.values()).filter(
      (l) => l.resourceId === resourceId
    );

    if (locks.length === 0) {
      return { locked: false };
    }

    const lock = locks[0];
    const now = Date.now();

    return {
      locked: true,
      owner: lock.owner,
      expiresIn: Math.max(0, lock.expiresAt - now),
      age: now - lock.acquiredAt,
    };
  }

  private startHeartbeat(lockId: string): void {
    const lock = this.locks.get(lockId);
    if (!lock) return;

    const interval = setInterval(async () => {
      const renewed = await this.renewHeartbeat(lockId);

      if (!renewed) {
        this.stopHeartbeat(lockId);
        this.locks.delete(lockId);
        eventBus.emit(Events.LOCK_EXPIRED, { lockId });
      }
    }, lock.heartbeatInterval);

    this.heartbeats.set(lockId, interval);
  }

  private stopHeartbeat(lockId: string): void {
    const interval = this.heartbeats.get(lockId);
    if (interval) {
      clearInterval(interval);
      this.heartbeats.delete(lockId);
    }
  }

  // Redis integration methods (to be implemented with actual Redis client)
  private async tryAcquireInRedis(
    resourceId: string,
    lockId: string,
    expiresAt: number
  ): Promise<boolean> {
    // Implement with Redis SET NX EX
    return true;
  }

  private async releaseInRedis(resourceId: string, lockId: string): Promise<boolean> {
    // Implement with Redis DEL
    return true;
  }

  private async renewInRedis(
    resourceId: string,
    lockId: string,
    expiresAt: number
  ): Promise<boolean> {
    // Implement with Redis EXPIRE
    return true;
  }
}

// Singleton
let distributedLockManager: DistributedLockManager | null = null;

export function getDistributedLockManager(): DistributedLockManager {
  if (!distributedLockManager) {
    distributedLockManager = new DistributedLockManager();
  }
  return distributedLockManager;
}
```

---

## Parte 5: Realtime Resilience Layer

### 5.1 Reconnection & Sync Recovery

```typescript
// lib/resilience/RealtimeResilienceLayer.ts

export enum ResilienceStrategy {
  IMMEDIATE_RETRY = 'immediate_retry',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  CIRCUIT_BREAKER = 'circuit_breaker',
  FALLBACK = 'fallback',
}

export class RealtimeResilienceLayer {
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly INITIAL_BACKOFF = 1000;
  private readonly MAX_BACKOFF = 30000;
  private offlineQueue: Array<{ event: string; data: any; timestamp: number }> = [];
  private circuitBreakerState: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount: number = 0;
  private readonly FAILURE_THRESHOLD = 5;
  private lastFailureTime: number = 0;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000;

  /**
   * Handle reconnection with exponential backoff
   */
  async handleReconnection(wsManager: WebSocketManager): Promise<boolean> {
    if (this.circuitBreakerState === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.CIRCUIT_BREAKER_TIMEOUT) {
        return false;
      }
      this.circuitBreakerState = 'half_open';
    }

    while (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      const backoffDelay = Math.min(
        this.INITIAL_BACKOFF * Math.pow(2, this.reconnectAttempts),
        this.MAX_BACKOFF
      );

      await new Promise((resolve) => setTimeout(resolve, backoffDelay));

      try {
        const connected = await wsManager.connect();

        if (connected) {
          this.reconnectAttempts = 0;
          this.failureCount = 0;
          this.circuitBreakerState = 'closed';

          // Flush offline queue
          await this.flushOfflineQueue(wsManager);

          eventBus.emit(Events.RECONNECTED, { attempts: this.reconnectAttempts });
          return true;
        }
      } catch (error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.FAILURE_THRESHOLD) {
          this.circuitBreakerState = 'open';
        }

        eventBus.emit(Events.RECONNECTION_FAILED, {
          attempt: this.reconnectAttempts,
          error: (error as Error).message,
        });
      }

      this.reconnectAttempts++;
    }

    return false;
  }

  /**
   * Queue event for offline sync
   */
  queueOfflineEvent(event: string, data: any): void {
    this.offlineQueue.push({
      event,
      data,
      timestamp: Date.now(),
    });

    // Trim queue if too large
    if (this.offlineQueue.length > 1000) {
      this.offlineQueue.shift();
    }
  }

  /**
   * Flush offline queue
   */
  private async flushOfflineQueue(wsManager: WebSocketManager): Promise<void> {
    const queueToFlush = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const item of queueToFlush) {
      try {
        wsManager.emit(item.event, item.data);
      } catch (error) {
        // Re-queue if flush fails
        this.queueOfflineEvent(item.event, item.data);
      }
    }
  }

  /**
   * Detect stale state
   */
  detectStaleState(store: any, expectedVersion: number): boolean {
    // Compare store version with expected
    return store.version < expectedVersion;
  }

  /**
   * Recover from stale state
   */
  async recoverFromStaleState(
    store: any,
    expectedVersion: number,
    wsManager: WebSocketManager
  ): Promise<boolean> {
    try {
      // Request full state sync
      wsManager.emit('state.sync.request', {
        store: store.name,
        expectedVersion,
      });

      return true;
    } catch (error) {
      eventBus.emit(Events.STALE_STATE_RECOVERY_FAILED, {
        store: store.name,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Implement eventual consistency strategy
   */
  async ensureEventualConsistency(
    localState: any,
    remoteState: any
  ): Promise<{ merged: any; conflicts: any[] }> {
    const conflicts: any[] = [];

    // Compare timestamps
    const merged = { ...localState };

    for (const key in remoteState) {
      if (localState[key]?.timestamp && remoteState[key]?.timestamp) {
        if (remoteState[key].timestamp > localState[key].timestamp) {
          merged[key] = remoteState[key];
        } else if (remoteState[key].timestamp === localState[key].timestamp) {
          // Same timestamp - conflict
          conflicts.push({
            key,
            local: localState[key],
            remote: remoteState[key],
          });
        }
      }
    }

    return { merged, conflicts };
  }

  /**
   * Get resilience metrics
   */
  getResilienceMetrics(): {
    reconnectAttempts: number;
    offlineQueueSize: number;
    circuitBreakerState: string;
    failureCount: number;
  } {
    return {
      reconnectAttempts: this.reconnectAttempts,
      offlineQueueSize: this.offlineQueue.length,
      circuitBreakerState: this.circuitBreakerState,
      failureCount: this.failureCount,
    };
  }
}

// Singleton
let resilienceLayer: RealtimeResilienceLayer | null = null;

export function getResilienceLayer(): RealtimeResilienceLayer {
  if (!resilienceLayer) {
    resilienceLayer = new RealtimeResilienceLayer();
  }
  return resilienceLayer;
}
```

---

## Parte 6: System Diagnostics Panel

### 6.1 Operational Dashboard Data

```typescript
// lib/diagnostics/SystemDiagnostics.ts

export interface SystemDiagnosticsData {
  timestamp: number;
  health: HealthScore;
  metrics: Record<string, any>;
  activeLocks: DistributedLock[];
  eventQueues: {
    incoming: number;
    outgoing: number;
    failed: number;
  };
  websocketSessions: {
    connected: number;
    disconnected: number;
    reconnecting: number;
  };
  operators: Array<{
    id: string;
    name: string;
    status: 'online' | 'offline' | 'idle';
    activeConversations: number;
    lastSeen: number;
  }>;
  activeConversations: Array<{
    id: string;
    clientName: string;
    fsmState: string;
    duration: number;
    operator?: string;
  }>;
  barberStatus: Array<{
    id: string;
    name: string;
    status: string;
    currentAppointment?: string;
    nextAppointment?: string;
    queueLength: number;
    pressure: number;
  }>;
  temporalAnomalies: Array<{
    type: string;
    severity: string;
    description: string;
    affectedResource: string;
  }>;
  failedWorkflows: Array<{
    id: string;
    type: string;
    error: string;
    timestamp: number;
    retryCount: number;
  }>;
}

export class SystemDiagnostics {
  /**
   * Gather all diagnostic data
   */
  gatherDiagnostics(): SystemDiagnosticsData {
    const observability = getObservabilityLayer();
    const timeline = getEventTimeline();
    const lockManager = getDistributedLockManager();
    const resilience = getResilienceLayer();

    return {
      timestamp: Date.now(),
      health: observability.calculateHealthScore(),
      metrics: observability.getMetricsSummary(),
      activeLocks: Array.from(lockManager['locks'].values()),
      eventQueues: {
        incoming: timeline.getEventsBySource('incoming').length,
        outgoing: timeline.getEventsBySource('outgoing').length,
        failed: timeline.getFailedEvents().length,
      },
      websocketSessions: {
        connected: 0, // Get from WebSocketManager
        disconnected: 0,
        reconnecting: 0,
      },
      operators: this.getOperatorStatus(),
      activeConversations: this.getActiveConversations(),
      barberStatus: this.getBarberStatus(),
      temporalAnomalies: this.detectTemporalAnomalies(),
      failedWorkflows: this.getFailedWorkflows(),
    };
  }

  private getOperatorStatus(): SystemDiagnosticsData['operators'] {
    // Implement based on presence system
    return [];
  }

  private getActiveConversations(): SystemDiagnosticsData['activeConversations'] {
    // Implement based on conversations store
    return [];
  }

  private getBarberStatus(): SystemDiagnosticsData['barberStatus'] {
    // Implement based on barber presence and queue system
    return [];
  }

  private detectTemporalAnomalies(): SystemDiagnosticsData['temporalAnomalies'] {
    // Implement temporal intelligence anomaly detection
    return [];
  }

  private getFailedWorkflows(): SystemDiagnosticsData['failedWorkflows'] {
    // Implement based on event timeline
    return [];
  }
}

// Singleton
let systemDiagnostics: SystemDiagnostics | null = null;

export function getSystemDiagnostics(): SystemDiagnostics {
  if (!systemDiagnostics) {
    systemDiagnostics = new SystemDiagnostics();
  }
  return systemDiagnostics;
}
```

---

## Resumen de Arquitectura Production-Grade

### Pilares Fundamentales

1. **Observability** — Métricas en tiempo real, health scoring, alertas
2. **Event Timeline** — Tracking completo de eventos con correlación
3. **Replay** — Debugging determinístico de race conditions
4. **Distributed Locking** — Redis-backed con heartbeat y deadlock detection
5. **Resilience** — Reconnection, offline queue, circuit breaker
6. **Diagnostics** — Panel operacional centralizado

### Características Clave

- **1000+ eventos/min** — Batching y buffering
- **Deterministic Replay** — Debugging de race conditions
- **Distributed Coordination** — Redis locks con heartbeat
- **Automatic Recovery** — Reconnection, state sync, offline queue
- **Complete Audit Trail** — Event timeline con correlación
- **Operational Intelligence** — Health scoring, anomaly detection

---

## Próximos Pasos

1. Implementar UI components para Event Timeline Inspector
2. Construir System Diagnostics Panel
3. Integrar con backend (NestJS, Supabase, Redis)
4. Performance optimization para 1000+ eventos/min
5. Testing y validation en production


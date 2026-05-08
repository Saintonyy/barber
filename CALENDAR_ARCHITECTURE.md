# BARBERAGENT Real-Time Operational Calendar Architecture

## Vision

Transform from a static calendar view into a **live dispatch coordination system** that communicates:
- Operational density and pressure
- Real-time availability and conflicts
- Barber presence and status
- Temporal optimization opportunities
- Live slot reservations and buffers

**Inspiration:** Uber Dispatch + Linear + Google Calendar + Airline Operations Center

---

## Core Systems

### 1. Slot Locking System (Redis-Backed)

**Purpose:** Prevent race conditions when multiple operators/AI/clients attempt to book simultaneously.

#### Slot States

```typescript
enum SlotState {
  AVAILABLE = 'available',
  LOCKED = 'locked',           // Reserved, not yet confirmed
  CONFIRMED = 'confirmed',     // Appointment locked in
  RELEASED = 'released',       // Lock expired or cancelled
  BLOCKED = 'blocked',         // Barber unavailable
  BUFFER = 'buffer',           // Transition buffer between appointments
}

interface SlotLock {
  slotId: string;              // barberId_date_time
  state: SlotState;
  lockedBy: string;            // userId or 'ai' or 'client'
  lockedAt: number;
  expiresAt: number;           // TTL: 30-60 seconds
  appointmentId?: string;
  metadata: {
    source: 'human' | 'ai' | 'client';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    reason?: string;
  };
}
```

#### Lock Lifecycle

```
AVAILABLE
    ↓ (user attempts booking)
LOCKED (TTL: 45s)
    ├─ (confirmation received)
    │  ↓
    └─ CONFIRMED
    │
    └─ (TTL expired)
       ↓
       RELEASED → AVAILABLE
```

#### Redis Operations

```typescript
// Lock a slot
SET slot:{barberId}:{date}:{time} {lockData} EX 45 NX

// Check if locked
GET slot:{barberId}:{date}:{time}

// Confirm lock
GETSET slot:{barberId}:{date}:{time} {confirmedData}

// Release lock
DEL slot:{barberId}:{date}:{time}

// Get all locks for barber
KEYS slot:{barberId}:{date}:*
```

#### Race Condition Handling

```typescript
// Scenario: Two operators try to book same slot simultaneously

// Operator A
SET slot:barber_1:2026-05-08:14:00 {lockA} EX 45 NX
// Returns: OK

// Operator B (same slot)
SET slot:barber_1:2026-05-08:14:00 {lockB} EX 45 NX
// Returns: nil (slot already locked)
// UI shows: "Slot locked by Operator A for 45 seconds"
```

#### Rollback Strategy

```typescript
// If booking fails after lock acquired:
1. Keep lock active (don't release immediately)
2. Show "Retrying..." state
3. After 3 failed attempts, release lock
4. Emit SlotLockFailed event
5. Suggest alternative slots
```

---

### 2. Conflict Engine

**Purpose:** Detect and visualize appointment conflicts in real-time.

#### Conflict Types

```typescript
enum ConflictType {
  OVERLAP = 'overlap',                    // Same barber, overlapping times
  DOUBLE_BOOKING = 'double_booking',      // Same barber, same time
  BUFFER_VIOLATION = 'buffer_violation',  // Insufficient transition time
  OVERLOAD = 'overload',                  // Too many appointments in short time
  CAPACITY = 'capacity',                  // Exceeds barber capacity
}

interface Conflict {
  id: string;
  type: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  appointments: string[];                 // Conflicting appointment IDs
  barberId: string;
  timeRange: { start: number; end: number };
  suggestedResolution?: {
    action: 'move' | 'reassign' | 'split';
    targetSlot?: string;
    targetBarber?: string;
  };
}
```

#### Detection Algorithm

```typescript
function detectConflicts(appointments: Appointment[], barber: Barber): Conflict[] {
  const conflicts: Conflict[] = [];
  
  // Sort by start time
  const sorted = appointments.sort((a, b) => a.startTime - b.startTime);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // Check overlap
    if (current.endTime > next.startTime) {
      conflicts.push({
        type: ConflictType.OVERLAP,
        severity: 'critical',
        appointments: [current.id, next.id],
      });
    }
    
    // Check buffer (e.g., 10 min minimum between appointments)
    const buffer = 10 * 60 * 1000; // 10 minutes
    if (next.startTime - current.endTime < buffer) {
      conflicts.push({
        type: ConflictType.BUFFER_VIOLATION,
        severity: 'medium',
        appointments: [current.id, next.id],
      });
    }
  }
  
  // Check overload (e.g., > 6 appointments in 8 hours)
  const windowSize = 8 * 60 * 60 * 1000; // 8 hours
  for (let i = 0; i < sorted.length; i++) {
    const window = sorted.filter(
      (apt) => apt.startTime >= sorted[i].startTime &&
               apt.startTime < sorted[i].startTime + windowSize
    );
    if (window.length > 6) {
      conflicts.push({
        type: ConflictType.OVERLOAD,
        severity: 'high',
        appointments: window.map((apt) => apt.id),
      });
    }
  }
  
  return conflicts;
}
```

#### Visual Conflict Indicators

```typescript
// In calendar UI:
- Overlapping appointments: Glowing red border + warning icon
- Buffer violations: Yellow dashed border
- Overload: Density heatmap (red gradient)
- Capacity exceeded: Exclamation badge
```

---

### 3. Barber Presence Layer

**Purpose:** Show real-time barber status and availability.

#### Barber Status Model

```typescript
interface BarberPresence {
  barberId: string;
  status: 'online' | 'busy' | 'delayed' | 'inactive' | 'overloaded';
  lastSeen: number;
  currentAppointmentId?: string;
  nextAppointmentId?: string;
  appointmentCount: number;           // Today
  averageDelay: number;               // Minutes
  isOverloaded: boolean;
  availableSlots: number;
  estimatedFreeTime: number;          // Minutes until next free slot
  metadata: {
    delayReason?: string;
    notes?: string;
    lastUpdate: number;
  };
}

enum BarberStatus {
  ONLINE = 'online',                  // Available for appointments
  BUSY = 'busy',                       // Currently with client
  DELAYED = 'delayed',                // Running late (> 5 min)
  INACTIVE = 'inactive',              // Not online
  OVERLOADED = 'overloaded',          // Too many appointments
}
```

#### Status Calculation

```typescript
function calculateBarberStatus(barber: Barber, appointments: Appointment[]): BarberStatus {
  const now = Date.now();
  const today = appointments.filter(
    (apt) => new Date(apt.date).toDateString() === new Date(now).toDateString()
  );
  
  // Check if currently in appointment
  const current = today.find(
    (apt) => apt.startTime <= now && apt.endTime > now
  );
  
  if (current) {
    const delay = now - current.endTime;
    if (delay > 5 * 60 * 1000) {
      return BarberStatus.DELAYED;
    }
    return BarberStatus.BUSY;
  }
  
  // Check overload
  if (today.length > 8) {
    return BarberStatus.OVERLOADED;
  }
  
  // Check if online
  const lastSeen = barber.lastSeen || 0;
  if (now - lastSeen > 5 * 60 * 1000) {
    return BarberStatus.INACTIVE;
  }
  
  return BarberStatus.ONLINE;
}
```

#### Presence Events

```typescript
Events.BARBER_STATUS_CHANGED    // Status transition
Events.BARBER_DELAY_DETECTED    // Running late
Events.BARBER_OVERLOAD_WARNING  // Too many appointments
Events.BARBER_AVAILABLE         // Slot freed up
Events.BARBER_OFFLINE           // Went offline
```

---

### 4. Temporal Intelligence System

**Purpose:** Detect scheduling patterns and suggest optimizations.

#### Temporal Analysis

```typescript
interface TemporalAnalysis {
  date: string;
  barber: Barber;
  
  // Metrics
  totalAppointments: number;
  totalDuration: number;              // Minutes
  utilization: number;                // Percentage
  deadTime: number;                   // Minutes of gaps
  averageGap: number;                 // Minutes between appointments
  peakHours: string[];                // "14:00-16:00"
  slowHours: string[];                // "10:00-12:00"
  
  // Insights
  insights: Insight[];
  recommendations: Recommendation[];
}

interface Insight {
  type: 'gap' | 'cluster' | 'pattern' | 'anomaly';
  description: string;
  timeRange: { start: string; end: string };
  impact: 'low' | 'medium' | 'high';
}

interface Recommendation {
  type: 'consolidate' | 'redistribute' | 'buffer' | 'optimize';
  description: string;
  affectedAppointments: string[];
  potentialGain: number;              // Minutes saved
  confidence: number;                 // 0-1
}
```

#### Analysis Algorithm

```typescript
function analyzeTemporalPatterns(
  appointments: Appointment[],
  barber: Barber
): TemporalAnalysis {
  const insights: Insight[] = [];
  const recommendations: Recommendation[] = [];
  
  // Find dead time gaps
  const gaps = findGaps(appointments);
  gaps.forEach((gap) => {
    if (gap.duration > 30) {
      insights.push({
        type: 'gap',
        description: `${gap.duration} min gap at ${gap.time}`,
        timeRange: gap,
        impact: 'medium',
      });
      
      // Recommend consolidation
      recommendations.push({
        type: 'consolidate',
        description: `Move an appointment into this ${gap.duration} min slot`,
        affectedAppointments: findNearbyAppointments(gap),
        potentialGain: gap.duration,
        confidence: 0.7,
      });
    }
  });
  
  // Detect clustering (too many appointments close together)
  const clusters = findClusters(appointments);
  clusters.forEach((cluster) => {
    if (cluster.appointments.length > 4) {
      insights.push({
        type: 'cluster',
        description: `${cluster.appointments.length} appointments in ${cluster.duration} min`,
        timeRange: cluster,
        impact: 'high',
      });
    }
  });
  
  return {
    date: new Date().toISOString().split('T')[0],
    barber,
    totalAppointments: appointments.length,
    totalDuration: calculateTotalDuration(appointments),
    utilization: calculateUtilization(appointments),
    deadTime: calculateDeadTime(appointments),
    averageGap: calculateAverageGap(gaps),
    peakHours: identifyPeakHours(appointments),
    slowHours: identifySlowHours(appointments),
    insights,
    recommendations,
  };
}
```

#### Optimization Suggestions

```typescript
// Example suggestions:
1. "Move 2:00 PM haircut to 1:45 PM → saves 15 min buffer"
2. "Consolidate 3 short services → frees 45 min slot"
3. "Reassign 4:30 PM to barber_2 → balances load"
4. "No-show probability 35% at 5:00 PM → suggest buffer"
```

---

### 5. Optimistic Scheduling

**Purpose:** Provide instant UI feedback while server confirms.

#### Optimistic Update Flow

```typescript
// User drags appointment to new slot

1. UI State Update (Immediate)
   - Move appointment visually
   - Show "Moving..." indicator
   - Lock target slot
   - Disable other interactions

2. Server Request (Async)
   - Send appointment.update event
   - Include lock token
   - Send conflict check request

3. Confirmation (Server Response)
   - If success: Remove "Moving..." indicator
   - If conflict: Rollback + show conflict UI
   - If lock expired: Retry with new lock

4. Rollback (On Error)
   - Restore original position
   - Release slot lock
   - Show error notification
   - Suggest alternative slots
```

---

### 6. Queue Visualization

**Purpose:** Show appointment flow and queue status.

#### Queue Model

```typescript
interface QueueVisualization {
  barberId: string;
  date: string;
  
  queue: QueueItem[];
  waitTime: number;              // Minutes
  estimatedCompletion: number;   // Timestamp
  density: 'low' | 'medium' | 'high' | 'critical';
}

interface QueueItem {
  appointmentId: string;
  clientName: string;
  service: string;
  duration: number;
  estimatedStart: number;
  estimatedEnd: number;
  status: 'waiting' | 'current' | 'completed';
  delayMinutes: number;
}
```

#### Visual Representation

```
Barber: El Negro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[14:00] ▓▓▓▓▓ Carlos - Corte Clásico (45 min) ⏱️ -2 min
[14:45] ▒▒▒▒▒ Juan - Fade (30 min) ⏱️ +5 min
[15:15] ░░░░░ Pedro - Barba (20 min) ⏱️ +25 min
[15:35] ░░░░░ Miguel - Diseño (15 min) ⏱️ +40 min

Espera: 40 min | Densidad: ALTA | Finalización: 15:50
```

---

### 7. Appointment Buffering

**Purpose:** Automatically add transition buffers between appointments.

#### Buffer Strategy

```typescript
enum BufferType {
  TRANSITION = 'transition',    // 10 min between appointments
  LUNCH = 'lunch',              // 60 min lunch break
  BREAK = 'break',              // 15 min rest
  CLEANUP = 'cleanup',          // 5 min cleaning
}

interface Buffer {
  id: string;
  barberId: string;
  type: BufferType;
  startTime: number;
  endTime: number;
  duration: number;
  isFlexible: boolean;
}

// Automatic buffer insertion
function insertBuffers(appointments: Appointment[]): (Appointment | Buffer)[] {
  const result: (Appointment | Buffer)[] = [];
  const sorted = appointments.sort((a, b) => a.startTime - b.startTime);
  
  sorted.forEach((apt, index) => {
    result.push(apt);
    
    if (index < sorted.length - 1) {
      const next = sorted[index + 1];
      const gap = next.startTime - apt.endTime;
      
      if (gap > 0 && gap < 10 * 60 * 1000) {
        // Too small gap, add buffer
        result.push({
          id: `buffer_${apt.id}_${next.id}`,
          type: BufferType.TRANSITION,
          startTime: apt.endTime,
          endTime: next.startTime,
          duration: gap / 60000,
          isFlexible: true,
        });
      }
    }
  });
  
  return result;
}
```

---

### 8. Rollback Systems

**Purpose:** Recover from failed operations gracefully.

#### Rollback Scenarios

```typescript
enum RollbackReason {
  LOCK_EXPIRED = 'lock_expired',
  CONFLICT_DETECTED = 'conflict_detected',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  BARBER_OFFLINE = 'barber_offline',
  SLOT_RELEASED = 'slot_released',
}

interface RollbackOperation {
  id: string;
  appointmentId: string;
  originalState: Appointment;
  newState: Appointment;
  reason: RollbackReason;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

// Rollback flow
async function rollbackAppointmentUpdate(
  operation: RollbackOperation
): Promise<void> {
  // 1. Restore UI state
  updateAppointmentStore(operation.appointmentId, operation.originalState);
  
  // 2. Release slot lock
  await releaseSlotLock(operation.newState);
  
  // 3. Emit rollback event
  eventBus.emit(Events.APPOINTMENT_ROLLBACK, {
    appointmentId: operation.appointmentId,
    reason: operation.reason,
  });
  
  // 4. Show user notification
  showNotification({
    type: 'warning',
    title: 'Cambio no confirmado',
    description: getRollbackMessage(operation.reason),
    action: {
      label: 'Reintentar',
      onClick: () => retryOperation(operation),
    },
  });
  
  // 5. Suggest alternatives
  const alternatives = await suggestAlternativeSlots(
    operation.appointmentId
  );
  showAlternativeSlots(alternatives);
}
```

---

## WebSocket Events

### Calendar-Specific Events

```typescript
Events.CALENDAR_SLOT_LOCKED = 'calendar.slot.locked'
Events.CALENDAR_SLOT_RELEASED = 'calendar.slot.released'
Events.CALENDAR_CONFLICT_DETECTED = 'calendar.conflict.detected'
Events.CALENDAR_CONFLICT_RESOLVED = 'calendar.conflict.resolved'
Events.CALENDAR_APPOINTMENT_MOVED = 'calendar.appointment.moved'
Events.CALENDAR_APPOINTMENT_MOVED_FAILED = 'calendar.appointment.moved.failed'
Events.CALENDAR_OVERLOAD_WARNING = 'calendar.overload.warning'
Events.CALENDAR_BUFFER_INSERTED = 'calendar.buffer.inserted'
Events.CALENDAR_QUEUE_UPDATED = 'calendar.queue.updated'
Events.CALENDAR_TEMPORAL_INSIGHT = 'calendar.temporal.insight'
```

---

## Performance Considerations

### Optimization Strategies

1. **Virtual Scrolling** — Only render visible time slots
2. **Memoization** — Cache conflict calculations
3. **Debouncing** — Throttle drag events (50ms)
4. **Lazy Loading** — Load appointments on-demand
5. **Web Workers** — Offload conflict detection to worker thread
6. **IndexedDB** — Cache appointments locally

### Scaling

- **Single barber, 30 days:** ~150 appointments → instant
- **10 barbers, 90 days:** ~4500 appointments → virtual scroll required
- **100 barbers, 365 days:** ~45000 appointments → Web Worker + IndexedDB

---

## Next Steps

1. Implement slot locking with Redis
2. Build conflict detection engine
3. Create real-time Calendar UI component
4. Add barber presence layer
5. Implement temporal intelligence
6. Add queue visualization
7. Build appointment buffering
8. Implement rollback systems

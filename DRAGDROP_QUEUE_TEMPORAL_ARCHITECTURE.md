# Drag-Drop, Queue Visualization & Temporal Intelligence Architecture

## Overview

Transform BARBERAGENT calendar into a **live operational coordination system** with:
1. **Drag-Drop Scheduling** — Optimistic, real-time, conflict-aware
2. **Queue Visualization** — Shows operational pressure and flow
3. **Temporal Intelligence** — Predictive insights and optimization

---

## 1. Drag-Drop Architecture (dnd-kit)

### Design Principles

- **Optimistic Updates** — UI responds immediately
- **Slot Locking** — Prevent race conditions
- **Conflict Detection** — Show warnings before drop
- **Rollback Ready** — Graceful error recovery
- **Real-Time Sync** — Server confirms/rejects

### Drag States

```typescript
enum DragState {
  IDLE = 'idle',                    // No drag active
  DRAGGING = 'dragging',            // User dragging
  PREVIEW = 'preview',              // Ghost showing target
  LOCK_ACQUIRING = 'lock_acquiring', // Requesting slot lock
  LOCK_ACQUIRED = 'lock_acquired',   // Lock confirmed
  UPDATING = 'updating',            // Server updating
  SUCCESS = 'success',              // Update confirmed
  ERROR = 'error',                  // Update failed
  ROLLING_BACK = 'rolling_back',    // Reverting changes
}

interface DragContext {
  appointmentId: string;
  sourceBarberId: string;
  sourceTime: string;
  targetBarberId: string;
  targetTime: string;
  state: DragState;
  conflict?: Conflict;
  lockToken?: string;
  error?: string;
}
```

### Drag Flow

```
1. IDLE
   ↓ (user starts drag)
2. DRAGGING
   ├─ Show ghost appointment
   ├─ Calculate target slot
   ├─ Check conflicts (preview)
   │
3. PREVIEW
   ├─ Show target position
   ├─ Show conflict warnings if any
   │
4. LOCK_ACQUIRING (on drop)
   ├─ Request slot lock from server
   ├─ Show "Acquiring lock..." indicator
   │
5. LOCK_ACQUIRED
   ├─ Lock confirmed
   ├─ Show "Updating..." indicator
   │
6. UPDATING
   ├─ Send appointment.update to server
   ├─ Optimistic UI update
   │
7. SUCCESS
   ├─ Server confirms
   ├─ Remove "Updating..." indicator
   │
   ├─ (if error)
   └─ ERROR
      ├─ Show error message
      ├─ Suggest alternatives
      │
      └─ ROLLING_BACK
         ├─ Restore original position
         ├─ Release lock
         └─ Return to IDLE
```

### Collision Detection

```typescript
interface CollisionDetection {
  // Check if target slot is available
  isSlotAvailable(
    barberId: string,
    date: string,
    time: string,
    duration: number
  ): boolean;

  // Get conflicts for proposed move
  detectConflicts(
    appointment: Appointment,
    targetBarberId: string,
    targetTime: string
  ): Conflict[];

  // Suggest alternative slots if conflict
  suggestAlternatives(
    appointment: Appointment,
    targetBarberId: string,
    targetTime: string
  ): Array<{ barberId: string; time: string; score: number }>;
}
```

### Visual Feedback

```typescript
interface DragVisuals {
  // Ghost appointment while dragging
  ghost: {
    opacity: 0.5,
    scale: 0.95,
    border: 'dashed',
    color: 'accent',
  };

  // Target slot highlight
  targetSlot: {
    background: 'accent/10',
    border: 'accent',
    glow: true,
  };

  // Conflict warning
  conflict: {
    background: 'red/20',
    border: 'red',
    icon: 'AlertTriangle',
    pulse: true,
  };

  // Lock acquiring
  lockAcquiring: {
    spinner: true,
    text: 'Adquiriendo slot...',
  };

  // Success feedback
  success: {
    checkmark: true,
    duration: 500,
  };

  // Error state
  error: {
    background: 'red/20',
    border: 'red',
    shake: true,
  };
}
```

---

## 2. Queue Visualization System

### Queue Model

```typescript
interface QueueState {
  barberId: string;
  date: string;
  queue: QueueItem[];
  metrics: QueueMetrics;
  pressure: OperationalPressure;
}

interface QueueItem {
  appointmentId: string;
  clientName: string;
  service: string;
  duration: number;
  estimatedStart: number;
  estimatedEnd: number;
  actualStart?: number;
  actualEnd?: number;
  status: 'waiting' | 'current' | 'completed' | 'delayed';
  delayMinutes: number;
  position: number; // 1-indexed
}

interface QueueMetrics {
  totalWaitTime: number;        // Minutes
  averageWaitTime: number;      // Minutes
  maxWaitTime: number;          // Minutes
  estimatedCompletion: number;  // Timestamp
  density: 'low' | 'medium' | 'high' | 'critical';
  utilizationRate: number;      // 0-1
}

enum OperationalPressure {
  RELAXED = 'relaxed',          // < 30% utilization
  NORMAL = 'normal',            // 30-60% utilization
  BUSY = 'busy',                // 60-80% utilization
  HIGH_PRESSURE = 'high_pressure', // 80-95% utilization
  CRITICAL = 'critical',        // > 95% utilization
}
```

### Visual Pressure Indicators

```typescript
// Queue visualization shows:

1. Density Heatmap
   - Low: Blue gradient
   - Medium: Yellow gradient
   - High: Orange gradient
   - Critical: Red gradient

2. Wait Time Indicators
   - Green: < 5 min wait
   - Yellow: 5-15 min wait
   - Orange: 15-30 min wait
   - Red: > 30 min wait

3. Barber Status Badges
   - Online: Green dot
   - Busy: Blue dot
   - Delayed: Orange dot
   - Overloaded: Red dot

4. Queue Flow Animation
   - Smooth transitions between items
   - Pulsing current appointment
   - Fading completed appointments

5. Pressure Gauge
   - Circular gauge showing utilization
   - Color changes with pressure level
   - Real-time updates
```

### Queue Visualization Component

```typescript
interface QueueVisualizationProps {
  barberId: string;
  date: string;
  compact?: boolean; // For sidebar view
  showPressure?: boolean;
  onAppointmentClick?: (appointmentId: string) => void;
}

// Shows:
// - Current appointment (highlighted, pulsing)
// - Waiting appointments (list with wait times)
// - Completed appointments (faded)
// - Pressure gauge
// - Estimated completion time
// - Delay warnings
```

---

## 3. Temporal Intelligence Engine

### Temporal Analysis

```typescript
interface TemporalIntelligence {
  // Predictive metrics
  noShowProbability: number;        // 0-1
  delayPrediction: number;          // Minutes
  estimatedCompletion: number;      // Timestamp
  
  // Optimization opportunities
  recommendations: Recommendation[];
  alerts: TemporalAlert[];
  
  // Barber state
  fatigueLevel: number;             // 0-1
  stressIndicators: string[];
}

interface Recommendation {
  type: 'consolidate' | 'redistribute' | 'buffer' | 'optimize' | 'break';
  title: string;
  description: string;
  affectedAppointments: string[];
  potentialGain: number;            // Minutes saved
  confidence: number;               // 0-1
  action?: () => Promise<void>;
}

interface TemporalAlert {
  type: 'no_show_risk' | 'delay_warning' | 'overload' | 'fatigue' | 'dead_zone';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timeRange: { start: number; end: number };
  suggestedAction?: string;
}
```

### Prediction Algorithms

```typescript
// 1. No-Show Probability
function predictNoShowProbability(
  appointment: Appointment,
  history: Appointment[]
): number {
  // Factors:
  // - Client history (past no-shows)
  // - Time of day (evening higher risk)
  // - Day of week (Friday higher risk)
  // - Appointment type (new clients higher risk)
  // - Weather (if available)
  // - Time until appointment
  
  return probability; // 0-1
}

// 2. Delay Prediction
function predictDelay(
  barber: Barber,
  appointments: Appointment[],
  now: number
): number {
  // Factors:
  // - Current queue length
  // - Average service duration
  // - Barber's historical delays
  // - Complexity of current appointment
  // - Barber fatigue level
  
  return delayMinutes;
}

// 3. Fatigue Detection
function calculateFatigueLevel(
  barber: Barber,
  appointments: Appointment[],
  now: number
): number {
  // Factors:
  // - Hours worked today
  // - Number of appointments
  // - Break time taken
  // - Appointment complexity
  // - Historical fatigue patterns
  
  return fatigueLevel; // 0-1
}

// 4. Dead Zone Detection
function detectDeadZones(
  appointments: Appointment[]
): Array<{ start: number; end: number; duration: number }> {
  // Find gaps > 30 minutes
  // Identify optimization opportunities
  
  return deadZones;
}

// 5. High Demand Window Detection
function detectHighDemandWindows(
  appointments: Appointment[],
  historicalData?: Appointment[]
): Array<{ start: number; end: number; demandLevel: number }> {
  // Identify peak hours
  // Predict future demand
  
  return windows;
}
```

### Recommendation Engine

```typescript
function generateRecommendations(
  barber: Barber,
  appointments: Appointment[],
  intelligence: TemporalIntelligence
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // 1. Consolidation opportunities
  if (deadZones.length > 0) {
    recommendations.push({
      type: 'consolidate',
      title: 'Consolidar citas',
      description: `Mueve ${deadZones[0].duration} min de citas al hueco disponible`,
      confidence: 0.8,
    });
  }

  // 2. Break recommendations
  if (fatigueLevel > 0.7) {
    recommendations.push({
      type: 'break',
      title: 'Descanso recomendado',
      description: 'El barbero necesita un descanso de 15 minutos',
      confidence: 0.9,
    });
  }

  // 3. Load balancing
  if (barber.appointmentCount > threshold) {
    recommendations.push({
      type: 'redistribute',
      title: 'Redistribuir carga',
      description: 'Reasignar citas a otros barberos',
      confidence: 0.7,
    });
  }

  // 4. Buffer optimization
  if (bufferViolations > 0) {
    recommendations.push({
      type: 'buffer',
      title: 'Optimizar buffers',
      description: 'Añadir buffers entre citas',
      confidence: 0.85,
    });
  }

  return recommendations;
}
```

---

## 4. Event System

### New Events

```typescript
Events = {
  // Drag events
  APPOINTMENT_DRAG_STARTED = 'appointment.drag.started',
  APPOINTMENT_DRAG_PREVIEW = 'appointment.drag.preview',
  APPOINTMENT_DRAG_ENDED = 'appointment.drag.ended',
  
  // Slot locking events
  SLOT_LOCK_REQUESTED = 'slot.lock.requested',
  SLOT_LOCK_ACQUIRED = 'slot.lock.acquired',
  SLOT_LOCK_FAILED = 'slot.lock.failed',
  SLOT_LOCK_RELEASED = 'slot.lock.released',
  
  // Appointment update events
  APPOINTMENT_OPTIMISTIC_UPDATED = 'appointment.optimistic.updated',
  APPOINTMENT_CONFIRMED = 'appointment.confirmed',
  APPOINTMENT_ROLLBACK = 'appointment.rollback',
  
  // Queue events
  QUEUE_PRESSURE_CHANGED = 'queue.pressure.changed',
  QUEUE_UPDATED = 'queue.updated',
  BARBER_OVERLOADED = 'barber.overloaded',
  
  // Temporal intelligence events
  TEMPORAL_ALERT_GENERATED = 'temporal.alert.generated',
  RECOMMENDATION_GENERATED = 'recommendation.generated',
  NO_SHOW_RISK_DETECTED = 'no_show_risk.detected',
  DELAY_WARNING = 'delay.warning',
}
```

### Event Payloads

```typescript
// Drag events
interface AppointmentDragStartedEvent {
  appointmentId: string;
  sourceBarberId: string;
  sourceTime: string;
  timestamp: number;
}

interface AppointmentDragPreviewEvent {
  appointmentId: string;
  targetBarberId: string;
  targetTime: string;
  conflicts: Conflict[];
  timestamp: number;
}

// Slot locking events
interface SlotLockRequestedEvent {
  slotId: string;
  barberId: string;
  date: string;
  time: string;
  appointmentId: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

interface SlotLockAcquiredEvent {
  slotId: string;
  lockToken: string;
  expiresIn: number; // Milliseconds
}

// Queue events
interface QueuePressureChangedEvent {
  barberId: string;
  pressure: OperationalPressure;
  metrics: QueueMetrics;
  timestamp: number;
}

// Temporal intelligence events
interface TemporalAlertGeneratedEvent {
  alert: TemporalAlert;
  barberId: string;
  timestamp: number;
}

interface RecommendationGeneratedEvent {
  recommendation: Recommendation;
  barberId: string;
  timestamp: number;
}
```

---

## 5. UI/UX Components

### Main Components

1. **DragDropCalendar**
   - Drag-enabled calendar grid
   - Real-time conflict preview
   - Lock acquisition feedback
   - Rollback handling

2. **QueueVisualization**
   - Queue list with wait times
   - Pressure gauge
   - Estimated completion
   - Delay warnings

3. **TemporalInsightCard**
   - Recommendations
   - Alerts
   - Predictions
   - Suggested actions

4. **OperationalDashboard**
   - All barbers' queues
   - System pressure overview
   - Active alerts
   - Recommendations

### Visual Hierarchy

```
┌─────────────────────────────────────────────┐
│ Calendar Header (Date, View Mode)           │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ Barber   │ Calendar Grid                    │
│ List     │ (Drag-drop enabled)              │
│          │                                  │
│ + Queue  │ - Ghost appointments             │
│ Pressure │ - Conflict warnings              │
│ Gauge    │ - Lock indicators                │
│          │ - Real-time updates              │
├──────────┴──────────────────────────────────┤
│ Queue Visualization                         │
│ (Wait times, pressure, recommendations)     │
├─────────────────────────────────────────────┤
│ Temporal Insights                           │
│ (Alerts, recommendations, predictions)      │
└─────────────────────────────────────────────┘
```

---

## 6. Performance Optimization

### Strategies

1. **Virtual Scrolling** — Only render visible items
2. **Memoization** — Cache predictions
3. **Debouncing** — Throttle drag events (50ms)
4. **Web Workers** — Offload prediction calculations
5. **IndexedDB** — Cache temporal data

### Scaling

- **Single barber, 30 days:** Instant
- **10 barbers, 90 days:** Virtual scroll required
- **100 barbers, 365 days:** Web Worker + IndexedDB

---

## 7. Implementation Roadmap

### Phase 1: Drag-Drop Foundation
- [ ] dnd-kit integration
- [ ] Drag state management
- [ ] Optimistic updates
- [ ] Slot locking integration

### Phase 2: Queue Visualization
- [ ] Queue model and calculations
- [ ] Pressure gauge component
- [ ] Queue list component
- [ ] Real-time updates

### Phase 3: Temporal Intelligence
- [ ] Prediction algorithms
- [ ] Recommendation engine
- [ ] Alert generation
- [ ] Insight cards

### Phase 4: Integration & Polish
- [ ] Full calendar integration
- [ ] Performance optimization
- [ ] Error handling
- [ ] User feedback refinement

---

## Key Principles

1. **Operational Transparency** — Show all state changes
2. **Predictive Intelligence** — Anticipate problems
3. **Graceful Degradation** — Fail safely
4. **Real-Time Feedback** — Instant visual response
5. **Human-Centered** — Respect barber wellbeing
6. **Conflict Awareness** — Prevent double-booking
7. **Optimistic Confidence** — Trust the UI

# BARBERAGENT Database Schema — Supabase PostgreSQL

## Overview

Complete production-grade schema for BARBERAGENT with multi-tenant support, event sourcing, real-time synchronization, and Row Level Security (RLS).

---

## SQL Schema

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TENANTS & ORGANIZATIONS
-- ============================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================
-- USERS & AUTHENTICATION
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'operator', 'barber', 'client')),
  phone VARCHAR(20),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  whatsapp_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  preferences JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_whatsapp_id ON clients(whatsapp_id);
CREATE INDEX idx_clients_email ON clients(email);

-- ============================================================
-- BARBERS
-- ============================================================

CREATE TABLE barbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  avatar_url TEXT,
  specialties TEXT[] DEFAULT '{}',
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_appointments INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'delayed', 'overloaded')),
  last_seen TIMESTAMP,
  break_start TIME,
  break_end TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_barbers_tenant_id ON barbers(tenant_id);
CREATE INDEX idx_barbers_user_id ON barbers(user_id);
CREATE INDEX idx_barbers_status ON barbers(status);

-- ============================================================
-- SERVICES
-- ============================================================

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_services_tenant_id ON services(tenant_id);

-- ============================================================
-- APPOINTMENTS
-- ============================================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL CHECK (source IN ('dashboard', 'whatsapp', 'ai')),
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INT NOT NULL,
  notes TEXT,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_barber_id ON appointments(barber_id);
CREATE INDEX idx_appointments_service_id ON appointments(service_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_barber_scheduled ON appointments(barber_id, scheduled_at);

-- ============================================================
-- APPOINTMENT EVENTS (Event Sourcing)
-- ============================================================

CREATE TABLE appointment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('created', 'updated', 'confirmed', 'cancelled', 'completed', 'no_show')),
  event_data JSONB NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_appointment_events_tenant_id ON appointment_events(tenant_id);
CREATE INDEX idx_appointment_events_appointment_id ON appointment_events(appointment_id);
CREATE INDEX idx_appointment_events_type ON appointment_events(event_type);
CREATE INDEX idx_appointment_events_created_at ON appointment_events(created_at);

-- ============================================================
-- CONVERSATIONS (WhatsApp & AI)
-- ============================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  whatsapp_conversation_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'escalated')),
  last_message_at TIMESTAMP,
  fsm_state VARCHAR(100) DEFAULT 'idle',
  fsm_context JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_client_id ON conversations(client_id);
CREATE INDEX idx_conversations_whatsapp_id ON conversations(whatsapp_conversation_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('client', 'ai', 'operator')),
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'location')),
  whatsapp_message_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================
-- REALTIME EVENTS (Event Bus)
-- ============================================================

CREATE TABLE realtime_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('websocket', 'whatsapp', 'ai', 'system')),
  correlation_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'processed' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_realtime_events_tenant_id ON realtime_events(tenant_id);
CREATE INDEX idx_realtime_events_type ON realtime_events(event_type);
CREATE INDEX idx_realtime_events_correlation_id ON realtime_events(correlation_id);
CREATE INDEX idx_realtime_events_created_at ON realtime_events(created_at);
CREATE INDEX idx_realtime_events_status ON realtime_events(status);

-- ============================================================
-- SLOT LOCKS (Distributed Locking)
-- ============================================================

CREATE TABLE slot_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  slot_time TIMESTAMP NOT NULL,
  lock_owner VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_slot_locks_tenant_id ON slot_locks(tenant_id);
CREATE INDEX idx_slot_locks_barber_id ON slot_locks(barber_id);
CREATE INDEX idx_slot_locks_expires_at ON slot_locks(expires_at);
CREATE INDEX idx_slot_locks_barber_slot ON slot_locks(barber_id, slot_time);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policies for users (can only see their own tenant's users)
CREATE POLICY "Users can view their tenant's users"
  ON users FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- Policies for appointments (can view appointments for their tenant)
CREATE POLICY "Users can view their tenant's appointments"
  ON appointments FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create appointments in their tenant"
  ON appointments FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- Policies for conversations
CREATE POLICY "Users can view their tenant's conversations"
  ON conversations FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- Policies for messages
CREATE POLICY "Users can view their tenant's messages"
  ON messages FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-create appointment event on appointment creation
CREATE OR REPLACE FUNCTION create_appointment_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO appointment_events (
    tenant_id,
    appointment_id,
    event_type,
    event_data,
    created_by
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    'created',
    jsonb_build_object(
      'client_id', NEW.client_id,
      'barber_id', NEW.barber_id,
      'service_id', NEW.service_id,
      'scheduled_at', NEW.scheduled_at,
      'source', NEW.source
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointment_created_event
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION create_appointment_event();

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Get available slots for a barber on a specific date
CREATE OR REPLACE FUNCTION get_available_slots(
  p_barber_id UUID,
  p_date DATE,
  p_duration_minutes INT DEFAULT 45
)
RETURNS TABLE (
  slot_time TIMESTAMP,
  is_available BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH time_slots AS (
    SELECT generate_series(
      (p_date || ' 10:00:00')::TIMESTAMP,
      (p_date || ' 18:00:00')::TIMESTAMP,
      INTERVAL '30 minutes'
    ) AS slot_time
  ),
  booked_slots AS (
    SELECT
      scheduled_at,
      scheduled_at + (duration_minutes || ' minutes')::INTERVAL AS end_time
    FROM appointments
    WHERE barber_id = p_barber_id
      AND DATE(scheduled_at) = p_date
      AND status != 'cancelled'
  ),
  locked_slots AS (
    SELECT slot_time
    FROM slot_locks
    WHERE barber_id = p_barber_id
      AND DATE(slot_time) = p_date
      AND expires_at > NOW()
  )
  SELECT
    ts.slot_time,
    NOT EXISTS (
      SELECT 1 FROM booked_slots bs
      WHERE ts.slot_time < bs.end_time
        AND (ts.slot_time + (p_duration_minutes || ' minutes')::INTERVAL) > bs.scheduled_at
    ) AND NOT EXISTS (
      SELECT 1 FROM locked_slots ls
      WHERE ls.slot_time = ts.slot_time
    ) AS is_available
  FROM time_slots ts
  ORDER BY ts.slot_time;
END;
$$ LANGUAGE plpgsql;

-- Get barber workload for a date
CREATE OR REPLACE FUNCTION get_barber_workload(
  p_barber_id UUID,
  p_date DATE
)
RETURNS TABLE (
  total_appointments INT,
  total_minutes INT,
  utilization_percent DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_appointments,
    COALESCE(SUM(duration_minutes), 0)::INT AS total_minutes,
    ROUND(
      COALESCE(SUM(duration_minutes), 0)::DECIMAL / (8 * 60) * 100,
      2
    ) AS utilization_percent
  FROM appointments
  WHERE barber_id = p_barber_id
    AND DATE(scheduled_at) = p_date
    AND status IN ('scheduled', 'confirmed', 'completed');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS
-- ============================================================

-- Appointment details with client and barber info
CREATE VIEW appointment_details AS
SELECT
  a.id,
  a.tenant_id,
  a.client_id,
  c.name AS client_name,
  c.phone AS client_phone,
  a.barber_id,
  b.name AS barber_name,
  a.service_id,
  s.name AS service_name,
  s.duration_minutes,
  a.scheduled_at,
  a.status,
  a.source,
  a.notes,
  a.price,
  a.created_at,
  a.updated_at
FROM appointments a
JOIN clients c ON a.client_id = c.id
JOIN barbers b ON a.barber_id = b.id
JOIN services s ON a.service_id = s.id;

-- Conversation details with message count
CREATE VIEW conversation_details AS
SELECT
  c.id,
  c.tenant_id,
  c.client_id,
  cl.name AS client_name,
  cl.phone AS client_phone,
  c.status,
  COUNT(m.id) AS message_count,
  MAX(m.created_at) AS last_message_at,
  c.fsm_state,
  c.created_at
FROM conversations c
JOIN clients cl ON c.client_id = cl.id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, c.tenant_id, c.client_id, cl.name, cl.phone, c.status, c.fsm_state, c.created_at;
```

---

## Schema Summary

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `tenants` | Multi-tenant support | id, name, slug |
| `users` | Authentication & roles | id, tenant_id, email, role |
| `clients` | Customer information | id, phone, whatsapp_id, name |
| `barbers` | Barber profiles | id, user_id, status, rating |
| `services` | Service catalog | id, name, duration_minutes, price |
| `appointments` | Appointment records | id, client_id, barber_id, service_id, scheduled_at, status |
| `appointment_events` | Event sourcing | id, appointment_id, event_type, event_data |
| `conversations` | WhatsApp conversations | id, client_id, whatsapp_conversation_id, fsm_state |
| `messages` | Message history | id, conversation_id, sender_type, content |
| `realtime_events` | Event bus | id, event_type, correlation_id, payload |
| `slot_locks` | Distributed locking | id, barber_id, slot_time, expires_at |
| `audit_log` | Audit trail | id, user_id, action, entity_type |

---

## Key Features

**Multi-Tenancy:** All tables include `tenant_id` for complete data isolation.

**Event Sourcing:** `appointment_events` table tracks all changes for replay and debugging.

**Real-Time Events:** `realtime_events` table persists all WebSocket events for correlation and replay.

**Distributed Locking:** `slot_locks` table manages concurrent appointment creation with TTL expiration.

**Row Level Security:** RLS policies ensure users can only access their tenant's data.

**Audit Trail:** `audit_log` tracks all changes for compliance and debugging.

**Helper Functions:** SQL functions for slot availability, barber workload, and conflict detection.

**Indexes:** Strategic indexes on frequently queried columns for performance.

---

## Setup Instructions

1. Create a new Supabase project
2. Run the SQL schema above in the Supabase SQL editor
3. Enable RLS on all tables
4. Create service role key for backend authentication
5. Configure environment variables in NestJS backend


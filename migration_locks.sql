-- appointment_locks: Distributed slot locking for concurrent booking prevention
CREATE TABLE IF NOT EXISTS appointment_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  locked_by UUID NOT NULL,
  locked_by_name TEXT,
  lock_source TEXT NOT NULL DEFAULT 'human',
  lock_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT lock_source_check CHECK (lock_source IN ('human', 'ai', 'client'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_locks_tenant ON appointment_locks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointment_locks_barber_date ON appointment_locks(barber_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointment_locks_expires ON appointment_locks(expires_at);

ALTER TABLE appointment_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_locks" ON appointment_locks;
CREATE POLICY "tenant_isolation_locks" ON appointment_locks
  FOR ALL USING (tenant_id = get_current_tenant_id());

ALTER PUBLICATION supabase_realtime ADD TABLE appointment_locks;

-- ============================================================================
-- ATOMIC SLOT LOCK ACQUISITION
-- Uses advisory locks + transaction to prevent race conditions
-- ============================================================================
CREATE OR REPLACE FUNCTION acquire_slot_lock(
  p_tenant_id UUID,
  p_barber_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_locked_by UUID,
  p_locked_by_name TEXT DEFAULT NULL,
  p_lock_source TEXT DEFAULT 'human',
  p_ttl_seconds INT DEFAULT 60
)
RETURNS TABLE(
  success BOOLEAN,
  lock_id UUID,
  conflict_type TEXT,
  conflict_detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_id UUID;
  v_existing_lock_id UUID;
  v_existing_apt_id UUID;
  v_advisory_key BIGINT;
BEGIN
  v_advisory_key := hashtext(p_barber_id::text || p_date::text || p_start_time::text);

  IF NOT pg_try_advisory_xact_lock(v_advisory_key) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'concurrent_lock'::TEXT, 'Another operation is in progress for this slot'::TEXT;
    RETURN;
  END IF;

  DELETE FROM appointment_locks
  WHERE tenant_id = p_tenant_id
    AND barber_id = p_barber_id
    AND appointment_date = p_date
    AND expires_at < NOW();

  SELECT id INTO v_existing_lock_id
  FROM appointment_locks
  WHERE tenant_id = p_tenant_id
    AND barber_id = p_barber_id
    AND appointment_date = p_date
    AND expires_at > NOW()
    AND start_time < p_end_time
    AND end_time > p_start_time
  LIMIT 1;

  IF v_existing_lock_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, v_existing_lock_id, 'slot_locked'::TEXT, 'Slot is currently being reserved by another user'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_existing_apt_id
  FROM appointments
  WHERE tenant_id = p_tenant_id
    AND barber_id = p_barber_id
    AND scheduled_at::date = p_date
    AND status NOT IN ('cancelled', 'no_show')
    AND scheduled_at::time < p_end_time
    AND (scheduled_at + (duration_minutes * INTERVAL '1 minute'))::time > p_start_time
  LIMIT 1;

  IF v_existing_apt_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, v_existing_apt_id, 'slot_booked'::TEXT, 'Slot already has a confirmed appointment'::TEXT;
    RETURN;
  END IF;

  INSERT INTO appointment_locks (
    tenant_id, barber_id, appointment_date,
    start_time, end_time, locked_by, locked_by_name,
    lock_source, expires_at
  )
  VALUES (
    p_tenant_id, p_barber_id, p_date,
    p_start_time, p_end_time, p_locked_by, p_locked_by_name,
    p_lock_source, NOW() + (p_ttl_seconds * INTERVAL '1 second')
  )
  RETURNING id INTO v_lock_id;

  RETURN QUERY SELECT TRUE, v_lock_id, NULL::TEXT, NULL::TEXT;
END;
$$;

-- ============================================================================
-- RELEASE SLOT LOCK
-- ============================================================================
CREATE OR REPLACE FUNCTION release_slot_lock(
  p_lock_id UUID,
  p_locked_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM appointment_locks
  WHERE id = p_lock_id
    AND locked_by = p_locked_by;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- ============================================================================
-- RENEW SLOT LOCK (heartbeat)
-- ============================================================================
CREATE OR REPLACE FUNCTION renew_slot_lock(
  p_lock_id UUID,
  p_locked_by UUID,
  p_ttl_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE appointment_locks
  SET expires_at = NOW() + (p_ttl_seconds * INTERVAL '1 second')
  WHERE id = p_lock_id
    AND locked_by = p_locked_by
    AND expires_at > NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ============================================================================
-- GET AVAILABLE SLOTS V2
-- Returns time slots with status: available / locked / booked
-- ============================================================================
CREATE OR REPLACE FUNCTION get_available_slots_v2(
  p_tenant_id UUID,
  p_barber_id UUID,
  p_date DATE,
  p_slot_duration INT DEFAULT 30
)
RETURNS TABLE(
  slot_time TIME,
  slot_end TIME,
  status TEXT,
  locked_by_name TEXT,
  appointment_id UUID,
  client_name TEXT,
  service_name TEXT,
  lock_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_start TIME;
  v_work_end TIME;
  v_current_slot TIME;
  v_slot_end TIME;
BEGIN
  SELECT work_start, work_end
  INTO v_work_start, v_work_end
  FROM barbers
  WHERE id = p_barber_id AND tenant_id = p_tenant_id;

  IF v_work_start IS NULL THEN
    v_work_start := '09:00'::TIME;
    v_work_end := '18:00'::TIME;
  END IF;

  DELETE FROM appointment_locks
  WHERE tenant_id = p_tenant_id
    AND barber_id = p_barber_id
    AND appointment_date = p_date
    AND expires_at < NOW();

  v_current_slot := v_work_start;

  WHILE v_current_slot < v_work_end LOOP
    v_slot_end := v_current_slot + (p_slot_duration * INTERVAL '1 minute');

    RETURN QUERY
    SELECT
      v_current_slot,
      v_slot_end,
      CASE
        WHEN a.id IS NOT NULL THEN 'booked'
        WHEN al.id IS NOT NULL THEN 'locked'
        ELSE 'available'
      END::TEXT,
      al.locked_by_name,
      a.id,
      c.name,
      s.name,
      al.expires_at
    FROM (SELECT 1) dummy
    LEFT JOIN appointments a ON
      a.tenant_id = p_tenant_id
      AND a.barber_id = p_barber_id
      AND a.scheduled_at::date = p_date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.scheduled_at::time < v_slot_end
      AND (a.scheduled_at + (a.duration_minutes * INTERVAL '1 minute'))::time > v_current_slot
    LEFT JOIN clients c ON c.id = a.client_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN appointment_locks al ON
      al.tenant_id = p_tenant_id
      AND al.barber_id = p_barber_id
      AND al.appointment_date = p_date
      AND al.expires_at > NOW()
      AND al.start_time < v_slot_end
      AND al.end_time > v_current_slot
    LIMIT 1;

    v_current_slot := v_slot_end;
  END LOOP;
END;
$$;

-- ============================================================================
-- DETECT APPOINTMENT CONFLICTS
-- ============================================================================
CREATE OR REPLACE FUNCTION detect_appointment_conflicts(
  p_tenant_id UUID,
  p_barber_id UUID,
  p_date DATE
)
RETURNS TABLE(
  conflict_type TEXT,
  appointment_id_1 UUID,
  appointment_id_2 UUID,
  overlap_start TIMESTAMPTZ,
  overlap_end TIMESTAMPTZ,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'overlap'::TEXT,
    a1.id,
    a2.id,
    GREATEST(a1.scheduled_at, a2.scheduled_at),
    LEAST(
      a1.scheduled_at + (a1.duration_minutes * INTERVAL '1 minute'),
      a2.scheduled_at + (a2.duration_minutes * INTERVAL '1 minute')
    ),
    'critical'::TEXT
  FROM appointments a1
  JOIN appointments a2 ON
    a1.id < a2.id
    AND a1.barber_id = a2.barber_id
    AND a1.tenant_id = a2.tenant_id
    AND a1.status NOT IN ('cancelled', 'no_show')
    AND a2.status NOT IN ('cancelled', 'no_show')
    AND a1.scheduled_at < (a2.scheduled_at + (a2.duration_minutes * INTERVAL '1 minute'))
    AND (a1.scheduled_at + (a1.duration_minutes * INTERVAL '1 minute')) > a2.scheduled_at
  WHERE a1.tenant_id = p_tenant_id
    AND a1.barber_id = p_barber_id
    AND a1.scheduled_at::date = p_date;
END;
$$;

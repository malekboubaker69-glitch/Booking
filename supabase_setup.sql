-- Function to handle booking with conflict detection
-- This should be run in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION book_court_v2(
  p_court_id UUID,
  p_user_name TEXT,
  p_user_phone TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count INT;
  v_new_booking_id UUID;
BEGIN
  -- 1. Check for conflicts
  SELECT count(*)
  INTO v_conflict_count
  FROM bookings
  WHERE court_id = p_court_id
    AND status = 'confirmed'
    AND (
      (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
    );

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Conflict detection: Slot already booked'
    );
  END IF;

  -- 2. Insert new booking
  INSERT INTO bookings (
    court_id,
    user_name,
    user_phone,
    start_time,
    end_time,
    status
  )
  VALUES (
    p_court_id,
    p_user_name,
    p_user_phone,
    p_start_time,
    p_end_time,
    'confirmed'
  )
  RETURNING id INTO v_new_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_new_booking_id
  );
END;
$$;

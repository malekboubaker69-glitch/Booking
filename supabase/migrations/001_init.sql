-- ============================================================
-- Sports Court Booking — Database Schema
-- ============================================================

-- Enable the btree_gist extension for overlap-exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ──────────────────────────────────────────────────────────────
-- Courts
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT    NOT NULL,
    sport          TEXT    NOT NULL CHECK (sport IN ('padel', 'foot')),
    price_per_hour NUMERIC NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- Bookings
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id   UUID        NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    user_id    UUID,
    user_name  TEXT,
    user_phone TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time   TIMESTAMPTZ NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'confirmed'
                           CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent overlapping bookings on the same court at the DB level
    CONSTRAINT no_overlapping_bookings
        EXCLUDE USING gist (
            court_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        )
);

-- Indices for frequent queries
CREATE INDEX IF NOT EXISTS idx_bookings_court_id   ON bookings (court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings (start_time);

-- ──────────────────────────────────────────────────────────────
-- Seed data — 2 padel courts + 2 football courts
-- ──────────────────────────────────────────────────────────────
INSERT INTO courts (name, sport, price_per_hour) VALUES
    ('Padel Court A', 'padel', 30),
    ('Padel Court B', 'padel', 35),
    ('Football Pitch 1', 'foot', 50),
    ('Football Pitch 2', 'foot', 55);

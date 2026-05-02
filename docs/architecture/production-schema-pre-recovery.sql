-- ============================================================================
-- production-schema-pre-recovery.sql
--
-- Pre-recovery production schema snapshot, captured 2026-05-02T02:23:15Z.
-- This is the rollback reference — production state BEFORE applying
-- supabase/migrations/20260407040000_recovery_schema_drift.sql.
--
-- Generated via:
--   pg_dump --schema-only --no-owner --no-privileges --schema=public \
--     $DATABASE_URL > production-schema-pre-recovery.sql
--
-- See docs/architecture/production-schema-drift-audit.md for the categorized
-- drift items (D1-D7) the recovery migration addresses.
-- ============================================================================

--
-- PostgreSQL database dump
--

\restrict h1nb3FqliL2bO5Xx8FeB3QiUvr2BDfpAl197nIH1krIkHZ4K5OUwhKDdtz0Mm9i

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Ubuntu 17.9-1.pgdg22.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: enforce_property_quota(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_property_quota() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  existing_count integer;
  user_tier text;
  tier_limit integer;
BEGIN
  -- Default to free if no subscription row exists.
  SELECT tier INTO user_tier FROM user_subscriptions WHERE user_id = NEW.user_id;
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;

  -- business = unlimited, bypass the check entirely.
  IF user_tier = 'business' THEN
    RETURN NEW;
  END IF;

  tier_limit := CASE user_tier
    WHEN 'pro' THEN 15
    ELSE 1  -- free
  END;

  SELECT COUNT(*) INTO existing_count
  FROM properties
  WHERE user_id = NEW.user_id;

  IF existing_count >= tier_limit THEN
    RAISE EXCEPTION 'property_quota_exceeded'
      USING HINT = format('Your %s plan is limited to %s properties. Upgrade to add more.', user_tier, tier_limit),
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fire_turnover_task_create(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fire_turnover_task_create() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'vault'
    AS $$
BEGIN
  -- TURN-S1a 2a — INERT. Function installed but body short-circuited.
  -- TURN-S1a 2b will replace this function (CREATE OR REPLACE) with
  -- the real body once 24h of inert-soak shows zero booking-insert
  -- regressions and zero leaked net._http_response rows.
  RETURN NEW;

  -- ------------------------------------------------------------------
  -- BELOW HERE: 2b body (NOT yet active). Kept as a comment so
  -- reviewers see the full design that 2a is preparing for.
  -- ------------------------------------------------------------------
  --
  -- DECLARE
  --   v_app_url text;
  --   v_secret  text;
  --   v_payload jsonb;
  --   v_request_id bigint;
  -- BEGIN
  --   -- iCal bulk-insert bypass: the iCal sync wraps its bulk
  --   -- insert with SET LOCAL app.skip_turnover_trigger = 'true'
  --   -- and calls backfillCleaningTasks once at end. This avoids
  --   -- thundering-herd against Vercel on a fresh host's first
  --   -- iCal import.
  --   IF current_setting('app.skip_turnover_trigger', true) = 'true' THEN
  --     RETURN NEW;
  --   END IF;
  --
  --   -- Gate: only confirmed/completed bookings with check_out today
  --   -- or later get a turnover task.
  --   IF NEW.status NOT IN ('confirmed', 'completed') THEN
  --     RETURN NEW;
  --   END IF;
  --   IF NEW.check_out < CURRENT_DATE THEN
  --     RETURN NEW;
  --   END IF;
  --
  --   -- UPDATE only fires on a transition INTO confirmed/completed.
  --   IF TG_OP = 'UPDATE' THEN
  --     IF OLD.status IN ('confirmed', 'completed') THEN
  --       RETURN NEW;
  --     END IF;
  --   END IF;
  --
  --   SELECT decrypted_secret INTO v_app_url
  --     FROM vault.decrypted_secrets WHERE name = 'turnover_app_url'
  --     LIMIT 1;
  --   SELECT decrypted_secret INTO v_secret
  --     FROM vault.decrypted_secrets WHERE name = 'turnover_trigger_secret'
  --     LIMIT 1;
  --   IF v_app_url IS NULL OR v_secret IS NULL THEN
  --     RAISE WARNING 'fire_turnover_task_create: vault secrets not set; skipping booking %', NEW.id;
  --     RETURN NEW;
  --   END IF;
  --
  --   v_payload := jsonb_build_object(
  --     'booking_id',  NEW.id,
  --     'property_id', NEW.property_id,
  --     'source',      TG_OP
  --   );
  --
  --   SELECT net.http_post(
  --     url     := v_app_url || '/api/internal/booking-created',
  --     body    := v_payload,
  --     headers := jsonb_build_object(
  --       'content-type',  'application/json',
  --       'authorization', 'Bearer ' || v_secret
  --     ),
  --     timeout_milliseconds := 10000
  --   ) INTO v_request_id;
  --
  --   RETURN NEW;
  -- EXCEPTION WHEN OTHERS THEN
  --   RAISE WARNING 'fire_turnover_task_create exception for booking %: %', NEW.id, SQLERRM;
  --   RETURN NEW;
  -- END;
END;
$$;


--
-- Name: release_stale_locks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_stale_locks() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM concurrency_locks WHERE expires_at < now() RETURNING 1 INTO deleted;
  RETURN COALESCE(deleted, 0);
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    listing_id uuid,
    platform text NOT NULL,
    platform_booking_id text,
    channex_booking_id text,
    guest_name text,
    guest_email text,
    guest_phone text,
    check_in date NOT NULL,
    check_out date NOT NULL,
    num_guests integer,
    total_price numeric(10,2),
    currency text DEFAULT 'USD'::text,
    status text DEFAULT 'confirmed'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    review_solicitation_sent boolean DEFAULT false,
    ota_reservation_code text,
    guest_first_name text,
    guest_last_name text,
    revision_number integer,
    source text DEFAULT 'ical'::text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: calendar_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    date date NOT NULL,
    base_rate numeric(10,2),
    suggested_rate numeric(10,2),
    applied_rate numeric(10,2),
    min_stay integer DEFAULT 1,
    is_available boolean DEFAULT true,
    rate_source text DEFAULT 'manual'::text,
    factors jsonb,
    created_at timestamp with time zone DEFAULT now(),
    channel_code text,
    channex_rate_plan_id text,
    last_pushed_at timestamp with time zone,
    last_channex_rate numeric(10,2),
    CONSTRAINT calendar_rates_rate_source_check CHECK ((rate_source = ANY (ARRAY['manual'::text, 'engine'::text, 'override'::text, 'manual_per_channel'::text])))
);


--
-- Name: channex_outbound_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channex_outbound_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    channex_property_id text,
    rate_plan_id text,
    endpoint text NOT NULL,
    method text NOT NULL,
    date_from date,
    date_to date,
    entries_count integer,
    payload_hash text,
    payload_sample jsonb,
    response_status integer,
    response_body jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channex_rate_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channex_rate_plans (
    id text NOT NULL,
    property_id uuid NOT NULL,
    room_type_id text NOT NULL,
    title text NOT NULL,
    sell_mode text DEFAULT 'per_room'::text,
    currency text DEFAULT 'USD'::text,
    rate_mode text DEFAULT 'manual'::text,
    cached_at timestamp with time zone DEFAULT now()
);


--
-- Name: channex_room_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channex_room_types (
    id text NOT NULL,
    property_id uuid NOT NULL,
    channex_property_id text NOT NULL,
    title text NOT NULL,
    count_of_rooms integer DEFAULT 1,
    occ_adults integer DEFAULT 2,
    occ_children integer DEFAULT 0,
    cached_at timestamp with time zone DEFAULT now()
);


--
-- Name: channex_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channex_sync_state (
    id text DEFAULT '''default'''::text NOT NULL,
    last_revision_id text,
    last_polled_at timestamp with time zone DEFAULT now(),
    revisions_processed integer DEFAULT 0
);


--
-- Name: channex_webhook_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channex_webhook_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text,
    booking_id text,
    channex_property_id text,
    guest_name text,
    check_in text,
    check_out text,
    payload jsonb,
    action_taken text,
    ack_sent boolean DEFAULT false,
    ack_response text,
    created_at timestamp with time zone DEFAULT now(),
    revision_id text
);


--
-- Name: cleaners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cleaners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cleaning_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cleaning_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    booking_id uuid,
    next_booking_id uuid,
    cleaner_id uuid,
    status text DEFAULT 'pending'::text,
    scheduled_date date NOT NULL,
    scheduled_time time without time zone,
    checklist jsonb DEFAULT '[]'::jsonb,
    photos jsonb DEFAULT '[]'::jsonb,
    notes text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    cleaner_token text,
    reminder_sent boolean DEFAULT false,
    CONSTRAINT cleaning_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'issue'::text])))
);


--
-- Name: concurrency_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concurrency_locks (
    lock_key text NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: guest_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    property_id uuid,
    direction text,
    draft_text text,
    final_text text,
    star_rating integer DEFAULT 5,
    recommend_guest boolean DEFAULT true,
    private_note text,
    incoming_text text,
    incoming_rating numeric(2,1),
    incoming_date timestamp with time zone,
    response_draft text,
    response_final text,
    response_sent boolean DEFAULT false,
    status text DEFAULT 'pending'::text,
    scheduled_publish_at timestamp with time zone,
    published_at timestamp with time zone,
    is_bad_review boolean DEFAULT false,
    ai_context jsonb,
    created_at timestamp with time zone DEFAULT now(),
    channex_review_id text,
    private_feedback text,
    subratings jsonb,
    guest_name text,
    ota_reservation_code text,
    guest_review_submitted_at timestamp with time zone,
    guest_review_channex_acked_at timestamp with time zone,
    guest_review_airbnb_confirmed_at timestamp with time zone,
    guest_review_payload jsonb,
    guest_name_override text,
    expired_at timestamp with time zone,
    is_low_rating boolean DEFAULT false NOT NULL,
    is_flagged_by_host boolean DEFAULT false NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT guest_reviews_direction_check CHECK ((direction = ANY (ARRAY['outgoing'::text, 'incoming'::text]))),
    CONSTRAINT guest_reviews_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5))),
    CONSTRAINT guest_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'draft_generated'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'bad_review_held'::text])))
);


--
-- Name: COLUMN guest_reviews.is_hidden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guest_reviews.is_hidden IS 'Pre-disclosure flag from Channex /reviews attributes.is_hidden. True while the 14-day disclosure window is open and the guest review is hidden from the host.';


--
-- Name: ical_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ical_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    platform text NOT NULL,
    feed_url text NOT NULL,
    is_active boolean DEFAULT true,
    last_synced timestamp with time zone,
    last_error text,
    sync_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    platform_listing_id text,
    CONSTRAINT ical_feeds_platform_check CHECK ((platform = ANY (ARRAY['airbnb'::text, 'vrbo'::text, 'booking_com'::text, 'direct'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    address text,
    city text,
    state text,
    zip text,
    bedrooms integer,
    current_rate numeric(10,2),
    estimated_opportunity numeric(10,2),
    market_adr numeric(10,2),
    source text DEFAULT 'revenue_check'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    platform text NOT NULL,
    platform_listing_id text,
    channex_room_id text,
    listing_url text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT listings_platform_check CHECK ((platform = ANY (ARRAY['airbnb'::text, 'vrbo'::text, 'booking_com'::text, 'direct'::text])))
);


--
-- Name: local_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    event_name text NOT NULL,
    event_date date NOT NULL,
    venue_name text,
    event_type text,
    estimated_attendance integer,
    demand_impact numeric(3,2),
    source text DEFAULT 'ticketmaster'::text,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: market_comps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_comps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    comp_listing_id text,
    comp_name text,
    comp_bedrooms integer,
    comp_adr numeric(10,2),
    comp_occupancy numeric(5,2),
    comp_revpar numeric(10,2),
    distance_km numeric(5,2),
    last_synced timestamp with time zone DEFAULT now(),
    photo_url text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    source text DEFAULT 'filtered_radius'::text NOT NULL,
    CONSTRAINT market_comps_source_check CHECK ((source = ANY (ARRAY['filtered_radius'::text, 'similarity_fallback'::text])))
);


--
-- Name: market_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    market_adr numeric(10,2),
    market_occupancy numeric(5,2),
    market_revpar numeric(10,2),
    market_supply integer,
    market_demand_score numeric(5,2),
    data_source text DEFAULT 'airroi'::text,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: message_automation_firings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_automation_firings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    draft_message_id uuid,
    fired_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    template_type text NOT NULL,
    subject text,
    body text NOT NULL,
    is_active boolean DEFAULT true,
    trigger_type text NOT NULL,
    trigger_days_offset integer DEFAULT 0,
    trigger_time time without time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    booking_id uuid,
    channex_thread_id text NOT NULL,
    channex_channel_id text,
    channex_booking_id text,
    ota_message_thread_id text,
    channel_code text NOT NULL,
    provider_raw text NOT NULL,
    title text,
    last_message_preview text,
    last_message_received_at timestamp with time zone,
    message_count integer DEFAULT 0 NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    thread_kind text DEFAULT 'message'::text NOT NULL,
    meta jsonb,
    channex_inserted_at timestamp with time zone,
    channex_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    property_id uuid NOT NULL,
    platform text NOT NULL,
    direction text,
    sender_name text,
    content text NOT NULL,
    ai_draft text,
    draft_status text DEFAULT 'none'::text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    thread_id uuid,
    channex_message_id text,
    ota_message_id text,
    sender text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    channex_meta jsonb,
    read_at timestamp with time zone,
    channex_inserted_at timestamp with time zone,
    channex_updated_at timestamp with time zone,
    host_send_submitted_at timestamp with time zone,
    host_send_channex_acked_at timestamp with time zone,
    host_send_ota_confirmed_at timestamp with time zone,
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: COLUMN messages.draft_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.draft_status IS 'Draft lifecycle: none | generated | sent | draft_pending_approval | discarded';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    recipient text,
    message text NOT NULL,
    channel text DEFAULT 'console'::text,
    sent_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pricing_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    date date NOT NULL,
    suggested_rate numeric(10,2),
    applied_rate numeric(10,2),
    rate_source text,
    was_booked boolean DEFAULT false,
    booking_id uuid,
    actual_revenue numeric(10,2),
    booked_at timestamp with time zone,
    days_before_checkin integer,
    market_adr numeric(10,2),
    market_occupancy numeric(5,2),
    demand_score numeric(5,2),
    comp_median_adr numeric(10,2),
    signals jsonb,
    revenue_vs_suggested numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pricing_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    date date NOT NULL,
    suggested_rate numeric(10,2) NOT NULL,
    applied_rate numeric(10,2),
    actual_rate numeric(10,2),
    applied_at timestamp with time zone,
    booked boolean DEFAULT false NOT NULL,
    booked_at timestamp with time zone,
    revenue_delta numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN (booked AND (actual_rate IS NOT NULL) AND (suggested_rate IS NOT NULL)) THEN (actual_rate - suggested_rate)
    ELSE NULL::numeric
END) STORED,
    channels_pushed text[] DEFAULT ARRAY[]::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pricing_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    date date NOT NULL,
    current_rate numeric(10,2),
    suggested_rate numeric(10,2),
    reason_signals jsonb,
    delta_abs numeric(10,2) GENERATED ALWAYS AS ((suggested_rate - current_rate)) STORED,
    delta_pct numeric(6,2) GENERATED ALWAYS AS (
CASE
    WHEN ((current_rate IS NULL) OR (current_rate = (0)::numeric)) THEN NULL::numeric
    ELSE round((((suggested_rate - current_rate) / current_rate) * (100)::numeric), 2)
END) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    urgency text,
    reason_text text
);


--
-- Name: pricing_recommendations_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pricing_recommendations_latest AS
 SELECT DISTINCT ON (property_id, date) id,
    property_id,
    date,
    current_rate,
    suggested_rate,
    reason_signals,
    delta_abs,
    delta_pct,
    created_at
   FROM public.pricing_recommendations
  ORDER BY property_id, date, created_at DESC;


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    base_rate numeric(10,2) NOT NULL,
    min_rate numeric(10,2) NOT NULL,
    max_rate numeric(10,2) NOT NULL,
    channel_markups jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_daily_delta_pct numeric(5,4) DEFAULT 0.20 NOT NULL,
    comp_floor_pct numeric(5,4) DEFAULT 0.85 NOT NULL,
    seasonal_overrides jsonb DEFAULT '{}'::jsonb,
    auto_apply boolean DEFAULT false NOT NULL,
    source text DEFAULT 'defaults'::text NOT NULL,
    inferred_from jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_check CHECK (((min_rate <= base_rate) AND (base_rate <= max_rate))),
    CONSTRAINT pricing_rules_comp_floor_pct_check CHECK (((comp_floor_pct >= (0)::numeric) AND (comp_floor_pct <= 1.0))),
    CONSTRAINT pricing_rules_max_daily_delta_pct_check CHECK (((max_daily_delta_pct > (0)::numeric) AND (max_daily_delta_pct <= 1.0))),
    CONSTRAINT pricing_rules_source_check CHECK ((source = ANY (ARRAY['defaults'::text, 'inferred'::text, 'host_set'::text])))
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    state text,
    zip text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    bedrooms integer,
    bathrooms numeric(3,1),
    max_guests integer,
    property_type text,
    amenities jsonb DEFAULT '[]'::jsonb,
    photos jsonb DEFAULT '[]'::jsonb,
    channex_property_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    default_cleaner_id uuid,
    cover_photo_url text,
    comp_set_quality text DEFAULT 'unknown'::text,
    reviews_last_synced_at timestamp with time zone,
    messages_last_synced_at timestamp with time zone,
    CONSTRAINT properties_comp_set_quality_check CHECK ((comp_set_quality = ANY (ARRAY['unknown'::text, 'precise'::text, 'fallback'::text, 'insufficient'::text]))),
    CONSTRAINT properties_property_type_check CHECK ((property_type = ANY (ARRAY['entire_home'::text, 'private_room'::text, 'shared_room'::text])))
);


--
-- Name: property_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    channex_channel_id text NOT NULL,
    channel_code text NOT NULL,
    channel_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: property_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    wifi_network text,
    wifi_password text,
    door_code text,
    smart_lock_instructions text,
    checkin_time time without time zone DEFAULT '15:00:00'::time without time zone,
    checkout_time time without time zone DEFAULT '11:00:00'::time without time zone,
    parking_instructions text,
    house_rules text,
    local_recommendations text,
    emergency_contact text,
    special_instructions text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: revenue_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenue_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text,
    address text,
    city text,
    state text,
    bedrooms integer,
    current_rate numeric(10,2),
    result_json jsonb,
    lead_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: review_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    is_active boolean DEFAULT true,
    auto_publish boolean DEFAULT false,
    publish_delay_days integer DEFAULT 3,
    tone text DEFAULT 'warm'::text,
    target_keywords text[] DEFAULT '{}'::text[],
    bad_review_delay boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT review_rules_tone_check CHECK ((tone = ANY (ARRAY['warm'::text, 'professional'::text, 'enthusiastic'::text])))
);


--
-- Name: sms_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cleaner_id uuid,
    cleaning_task_id uuid,
    phone_to text NOT NULL,
    message_body text NOT NULL,
    twilio_sid text,
    status text DEFAULT 'sent'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    user_id uuid NOT NULL,
    tier text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_subscriptions_tier_check CHECK ((tier = ANY (ARRAY['free'::text, 'pro'::text, 'business'::text])))
);


--
-- Name: weather_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    forecast_date date NOT NULL,
    temp_high numeric(5,1),
    temp_low numeric(5,1),
    precipitation_pct integer,
    conditions text,
    raw_data jsonb,
    fetched_at timestamp with time zone DEFAULT now()
);


--
-- Name: bookings bookings_channex_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_channex_booking_id_key UNIQUE (channex_booking_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: calendar_rates calendar_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_rates
    ADD CONSTRAINT calendar_rates_pkey PRIMARY KEY (id);


--
-- Name: calendar_rates calendar_rates_property_date_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_rates
    ADD CONSTRAINT calendar_rates_property_date_channel_key UNIQUE NULLS NOT DISTINCT (property_id, date, channel_code);


--
-- Name: channex_outbound_log channex_outbound_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_outbound_log
    ADD CONSTRAINT channex_outbound_log_pkey PRIMARY KEY (id);


--
-- Name: channex_rate_plans channex_rate_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_rate_plans
    ADD CONSTRAINT channex_rate_plans_pkey PRIMARY KEY (id);


--
-- Name: channex_room_types channex_room_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_room_types
    ADD CONSTRAINT channex_room_types_pkey PRIMARY KEY (id);


--
-- Name: channex_sync_state channex_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_sync_state
    ADD CONSTRAINT channex_sync_state_pkey PRIMARY KEY (id);


--
-- Name: channex_webhook_log channex_webhook_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_webhook_log
    ADD CONSTRAINT channex_webhook_log_pkey PRIMARY KEY (id);


--
-- Name: cleaners cleaners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaners
    ADD CONSTRAINT cleaners_pkey PRIMARY KEY (id);


--
-- Name: cleaning_tasks cleaning_tasks_booking_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_booking_id_unique UNIQUE (booking_id);


--
-- Name: cleaning_tasks cleaning_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_pkey PRIMARY KEY (id);


--
-- Name: concurrency_locks concurrency_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurrency_locks
    ADD CONSTRAINT concurrency_locks_pkey PRIMARY KEY (lock_key);


--
-- Name: guest_reviews guest_reviews_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_reviews
    ADD CONSTRAINT guest_reviews_booking_id_key UNIQUE (booking_id);


--
-- Name: guest_reviews guest_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_reviews
    ADD CONSTRAINT guest_reviews_pkey PRIMARY KEY (id);


--
-- Name: ical_feeds ical_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ical_feeds
    ADD CONSTRAINT ical_feeds_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: listings listings_property_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_property_id_platform_key UNIQUE (property_id, platform);


--
-- Name: local_events local_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_events
    ADD CONSTRAINT local_events_pkey PRIMARY KEY (id);


--
-- Name: market_comps market_comps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_comps
    ADD CONSTRAINT market_comps_pkey PRIMARY KEY (id);


--
-- Name: market_snapshots market_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_snapshots
    ADD CONSTRAINT market_snapshots_pkey PRIMARY KEY (id);


--
-- Name: message_automation_firings message_automation_firings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_automation_firings
    ADD CONSTRAINT message_automation_firings_pkey PRIMARY KEY (id);


--
-- Name: message_automation_firings message_automation_firings_template_id_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_automation_firings
    ADD CONSTRAINT message_automation_firings_template_id_booking_id_key UNIQUE (template_id, booking_id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_channex_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channex_message_id_key UNIQUE (channex_message_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pricing_outcomes pricing_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_outcomes
    ADD CONSTRAINT pricing_outcomes_pkey PRIMARY KEY (id);


--
-- Name: pricing_outcomes pricing_outcomes_property_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_outcomes
    ADD CONSTRAINT pricing_outcomes_property_id_date_key UNIQUE (property_id, date);


--
-- Name: pricing_performance pricing_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_performance
    ADD CONSTRAINT pricing_performance_pkey PRIMARY KEY (id);


--
-- Name: pricing_recommendations pricing_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_recommendations
    ADD CONSTRAINT pricing_recommendations_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_property_id_key UNIQUE (property_id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_channels property_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_channels
    ADD CONSTRAINT property_channels_pkey PRIMARY KEY (id);


--
-- Name: property_channels property_channels_property_id_channex_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_channels
    ADD CONSTRAINT property_channels_property_id_channex_channel_id_key UNIQUE (property_id, channex_channel_id);


--
-- Name: property_details property_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_details
    ADD CONSTRAINT property_details_pkey PRIMARY KEY (id);


--
-- Name: property_details property_details_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_details
    ADD CONSTRAINT property_details_property_id_key UNIQUE (property_id);


--
-- Name: revenue_checks revenue_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_checks
    ADD CONSTRAINT revenue_checks_pkey PRIMARY KEY (id);


--
-- Name: review_rules review_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_rules
    ADD CONSTRAINT review_rules_pkey PRIMARY KEY (id);


--
-- Name: sms_log sms_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id);


--
-- Name: weather_cache weather_cache_latitude_longitude_forecast_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_latitude_longitude_forecast_date_key UNIQUE (latitude, longitude, forecast_date);


--
-- Name: weather_cache weather_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_pkey PRIMARY KEY (id);


--
-- Name: calendar_rates_prop_date_chan_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_rates_prop_date_chan_unique ON public.calendar_rates USING btree (property_id, date, channel_code) NULLS NOT DISTINCT;


--
-- Name: guest_reviews_channex_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guest_reviews_channex_id_unique ON public.guest_reviews USING btree (channex_review_id);


--
-- Name: idx_bookings_ota_reservation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_ota_reservation_code ON public.bookings USING btree (ota_reservation_code) WHERE (ota_reservation_code IS NOT NULL);


--
-- Name: idx_bookings_property_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_property_checkin ON public.bookings USING btree (property_id, check_in);


--
-- Name: idx_calendar_rates_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_rates_channel ON public.calendar_rates USING btree (property_id, channel_code, date) WHERE (channel_code IS NOT NULL);


--
-- Name: idx_calendar_rates_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_rates_property_date ON public.calendar_rates USING btree (property_id, date);


--
-- Name: idx_channex_outbound_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channex_outbound_endpoint ON public.channex_outbound_log USING btree (endpoint, created_at DESC);


--
-- Name: idx_channex_outbound_property_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channex_outbound_property_time ON public.channex_outbound_log USING btree (property_id, created_at DESC);


--
-- Name: idx_channex_rate_plans_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channex_rate_plans_property ON public.channex_rate_plans USING btree (property_id);


--
-- Name: idx_channex_room_types_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channex_room_types_property ON public.channex_room_types USING btree (property_id);


--
-- Name: idx_cleaners_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cleaners_user ON public.cleaners USING btree (user_id);


--
-- Name: idx_cleaning_tasks_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cleaning_tasks_property_date ON public.cleaning_tasks USING btree (property_id, scheduled_date);


--
-- Name: idx_cleaning_tasks_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cleaning_tasks_token ON public.cleaning_tasks USING btree (cleaner_token);


--
-- Name: idx_concurrency_locks_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concurrency_locks_expires ON public.concurrency_locks USING btree (expires_at);


--
-- Name: idx_ical_feeds_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ical_feeds_active ON public.ical_feeds USING btree (is_active);


--
-- Name: idx_ical_feeds_property_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ical_feeds_property_platform ON public.ical_feeds USING btree (property_id, platform);


--
-- Name: idx_listings_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_property ON public.listings USING btree (property_id);


--
-- Name: idx_local_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_local_events_date ON public.local_events USING btree (event_date);


--
-- Name: idx_local_events_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_local_events_property_date ON public.local_events USING btree (property_id, event_date);


--
-- Name: idx_market_comps_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_comps_property ON public.market_comps USING btree (property_id);


--
-- Name: idx_market_snapshots_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_snapshots_property_date ON public.market_snapshots USING btree (property_id, snapshot_date);


--
-- Name: idx_message_automation_firings_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_automation_firings_template ON public.message_automation_firings USING btree (template_id);


--
-- Name: idx_message_templates_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_property ON public.message_templates USING btree (property_id);


--
-- Name: idx_message_templates_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_trigger ON public.message_templates USING btree (trigger_type, is_active);


--
-- Name: idx_message_threads_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_threads_booking ON public.message_threads USING btree (booking_id) WHERE (booking_id IS NOT NULL);


--
-- Name: idx_message_threads_channex_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_message_threads_channex_id ON public.message_threads USING btree (channex_thread_id);


--
-- Name: idx_message_threads_property_last; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_threads_property_last ON public.message_threads USING btree (property_id, last_message_received_at DESC);


--
-- Name: idx_messages_property_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_property_created ON public.messages USING btree (property_id, created_at);


--
-- Name: idx_messages_thread_inserted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_thread_inserted ON public.messages USING btree (thread_id, channex_inserted_at);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_pricing_outcomes_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_outcomes_property_date ON public.pricing_outcomes USING btree (property_id, date);


--
-- Name: idx_pricing_performance_applied; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_performance_applied ON public.pricing_performance USING btree (applied_at DESC) WHERE (applied_at IS NOT NULL);


--
-- Name: idx_pricing_performance_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_performance_property_date ON public.pricing_performance USING btree (property_id, date);


--
-- Name: idx_pricing_recommendations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_recommendations_created_at ON public.pricing_recommendations USING btree (created_at DESC);


--
-- Name: idx_pricing_recommendations_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_recommendations_property_date ON public.pricing_recommendations USING btree (property_id, date);


--
-- Name: idx_properties_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_user ON public.properties USING btree (user_id);


--
-- Name: idx_property_channels_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_channels_property ON public.property_channels USING btree (property_id);


--
-- Name: idx_sms_log_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_log_task ON public.sms_log USING btree (cleaning_task_id);


--
-- Name: idx_sms_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_log_user ON public.sms_log USING btree (user_id);


--
-- Name: idx_weather_cache_coords_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_cache_coords_date ON public.weather_cache USING btree (latitude, longitude, forecast_date);


--
-- Name: idx_webhook_log_revision_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_log_revision_id ON public.channex_webhook_log USING btree (revision_id) WHERE (revision_id IS NOT NULL);


--
-- Name: pricing_performance_prop_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_performance_prop_date_unique ON public.pricing_performance USING btree (property_id, date);


--
-- Name: pricing_recs_unique_pending_per_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_recs_unique_pending_per_date ON public.pricing_recommendations USING btree (property_id, date) WHERE (status = 'pending'::text);


--
-- Name: bookings bookings_fire_turnover_task; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_fire_turnover_task AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.fire_turnover_task_create();


--
-- Name: TRIGGER bookings_fire_turnover_task ON bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER bookings_fire_turnover_task ON public.bookings IS 'TURN-S1a 2a — INERT trigger. CREATE OR REPLACE FUNCTION in 2b activates the body. Emergency disable: DROP TRIGGER bookings_fire_turnover_task ON bookings;';


--
-- Name: bookings bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: properties enforce_property_quota_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_property_quota_trigger BEFORE INSERT ON public.properties FOR EACH ROW EXECUTE FUNCTION public.enforce_property_quota();


--
-- Name: properties properties_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: bookings bookings_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: bookings bookings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: calendar_rates calendar_rates_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_rates
    ADD CONSTRAINT calendar_rates_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: channex_outbound_log channex_outbound_log_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_outbound_log
    ADD CONSTRAINT channex_outbound_log_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: channex_rate_plans channex_rate_plans_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_rate_plans
    ADD CONSTRAINT channex_rate_plans_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: channex_room_types channex_room_types_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channex_room_types
    ADD CONSTRAINT channex_room_types_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: cleaners cleaners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaners
    ADD CONSTRAINT cleaners_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: cleaning_tasks cleaning_tasks_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: cleaning_tasks cleaning_tasks_cleaner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_cleaner_id_fkey FOREIGN KEY (cleaner_id) REFERENCES public.cleaners(id) ON DELETE SET NULL;


--
-- Name: cleaning_tasks cleaning_tasks_next_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_next_booking_id_fkey FOREIGN KEY (next_booking_id) REFERENCES public.bookings(id);


--
-- Name: cleaning_tasks cleaning_tasks_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: guest_reviews guest_reviews_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_reviews
    ADD CONSTRAINT guest_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: guest_reviews guest_reviews_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_reviews
    ADD CONSTRAINT guest_reviews_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: ical_feeds ical_feeds_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ical_feeds
    ADD CONSTRAINT ical_feeds_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: listings listings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: local_events local_events_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_events
    ADD CONSTRAINT local_events_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: market_comps market_comps_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_comps
    ADD CONSTRAINT market_comps_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: market_snapshots market_snapshots_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_snapshots
    ADD CONSTRAINT market_snapshots_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: message_automation_firings message_automation_firings_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_automation_firings
    ADD CONSTRAINT message_automation_firings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: message_automation_firings message_automation_firings_draft_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_automation_firings
    ADD CONSTRAINT message_automation_firings_draft_message_id_fkey FOREIGN KEY (draft_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: message_automation_firings message_automation_firings_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_automation_firings
    ADD CONSTRAINT message_automation_firings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.message_templates(id) ON DELETE CASCADE;


--
-- Name: message_templates message_templates_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: message_threads message_threads_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: message_threads message_threads_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: messages messages_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: messages messages_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE CASCADE;


--
-- Name: pricing_outcomes pricing_outcomes_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_outcomes
    ADD CONSTRAINT pricing_outcomes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: pricing_outcomes pricing_outcomes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_outcomes
    ADD CONSTRAINT pricing_outcomes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: pricing_performance pricing_performance_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_performance
    ADD CONSTRAINT pricing_performance_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: pricing_recommendations pricing_recommendations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_recommendations
    ADD CONSTRAINT pricing_recommendations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: properties properties_default_cleaner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_default_cleaner_id_fkey FOREIGN KEY (default_cleaner_id) REFERENCES public.cleaners(id);


--
-- Name: properties properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: property_channels property_channels_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_channels
    ADD CONSTRAINT property_channels_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_details property_details_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_details
    ADD CONSTRAINT property_details_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: revenue_checks revenue_checks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_checks
    ADD CONSTRAINT revenue_checks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: review_rules review_rules_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_rules
    ADD CONSTRAINT review_rules_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: sms_log sms_log_cleaner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_cleaner_id_fkey FOREIGN KEY (cleaner_id) REFERENCES public.cleaners(id);


--
-- Name: sms_log sms_log_cleaning_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_cleaning_task_id_fkey FOREIGN KEY (cleaning_task_id) REFERENCES public.cleaning_tasks(id);


--
-- Name: sms_log sms_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: leads Anyone can insert leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert leads" ON public.leads FOR INSERT WITH CHECK (true);


--
-- Name: revenue_checks Anyone can insert revenue_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert revenue_checks" ON public.revenue_checks FOR INSERT WITH CHECK (true);


--
-- Name: leads Authenticated users can read leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read leads" ON public.leads FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: revenue_checks Authenticated users can read revenue_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read revenue_checks" ON public.revenue_checks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: channex_sync_state Authenticated users can read sync state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read sync state" ON public.channex_sync_state FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: weather_cache Authenticated users can read weather cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read weather cache" ON public.weather_cache FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: sms_log Service inserts sms logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service inserts sms logs" ON public.sms_log FOR INSERT WITH CHECK (true);


--
-- Name: bookings Users can delete own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own bookings" ON public.bookings FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: calendar_rates Users can delete own calendar_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own calendar_rates" ON public.calendar_rates FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: cleaning_tasks Users can delete own cleaning_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own cleaning_tasks" ON public.cleaning_tasks FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: listings Users can delete own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own listings" ON public.listings FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_comps Users can delete own market_comps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own market_comps" ON public.market_comps FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_snapshots Users can delete own market_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own market_snapshots" ON public.market_snapshots FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: messages Users can delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: properties Users can delete own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own properties" ON public.properties FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: bookings Users can insert own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: calendar_rates Users can insert own calendar_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own calendar_rates" ON public.calendar_rates FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: cleaning_tasks Users can insert own cleaning_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own cleaning_tasks" ON public.cleaning_tasks FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: listings Users can insert own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own listings" ON public.listings FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_comps Users can insert own market_comps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own market_comps" ON public.market_comps FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_snapshots Users can insert own market_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own market_snapshots" ON public.market_snapshots FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: messages Users can insert own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own messages" ON public.messages FOR INSERT WITH CHECK ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: properties Users can insert own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: channex_rate_plans Users can manage own channex_rate_plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own channex_rate_plans" ON public.channex_rate_plans USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: channex_room_types Users can manage own channex_room_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own channex_room_types" ON public.channex_room_types USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: ical_feeds Users can manage own ical_feeds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own ical_feeds" ON public.ical_feeds USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: local_events Users can manage own local_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own local_events" ON public.local_events USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: pricing_outcomes Users can manage own pricing_outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own pricing_outcomes" ON public.pricing_outcomes USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: property_channels Users can manage own property_channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own property_channels" ON public.property_channels USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: bookings Users can update own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: calendar_rates Users can update own calendar_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own calendar_rates" ON public.calendar_rates FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: cleaning_tasks Users can update own cleaning_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own cleaning_tasks" ON public.cleaning_tasks FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: listings Users can update own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own listings" ON public.listings FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_comps Users can update own market_comps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own market_comps" ON public.market_comps FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_snapshots Users can update own market_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own market_snapshots" ON public.market_snapshots FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: messages Users can update own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own messages" ON public.messages FOR UPDATE USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: properties Users can update own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own properties" ON public.properties FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: bookings Users can view own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: calendar_rates Users can view own calendar_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own calendar_rates" ON public.calendar_rates FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: channex_rate_plans Users can view own channex_rate_plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own channex_rate_plans" ON public.channex_rate_plans FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: channex_room_types Users can view own channex_room_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own channex_room_types" ON public.channex_room_types FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: cleaning_tasks Users can view own cleaning_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own cleaning_tasks" ON public.cleaning_tasks FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: ical_feeds Users can view own ical_feeds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ical_feeds" ON public.ical_feeds FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: listings Users can view own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own listings" ON public.listings FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: local_events Users can view own local_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own local_events" ON public.local_events FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_comps Users can view own market_comps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own market_comps" ON public.market_comps FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: market_snapshots Users can view own market_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own market_snapshots" ON public.market_snapshots FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: messages Users can view own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: pricing_outcomes Users can view own pricing_outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own pricing_outcomes" ON public.pricing_outcomes FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: properties Users can view own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own properties" ON public.properties FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: property_channels Users can view own property_channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own property_channels" ON public.property_channels FOR SELECT USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: channex_webhook_log Users can view own webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own webhook logs" ON public.channex_webhook_log FOR SELECT USING ((channex_property_id IN ( SELECT properties.channex_property_id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: cleaners Users manage own cleaners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own cleaners" ON public.cleaners USING ((user_id = auth.uid()));


--
-- Name: user_preferences Users manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own preferences" ON public.user_preferences USING ((user_id = auth.uid()));


--
-- Name: property_details Users manage own property details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own property details" ON public.property_details USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: review_rules Users manage own review rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own review rules" ON public.review_rules USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: guest_reviews Users manage own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own reviews" ON public.guest_reviews USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: message_templates Users manage own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own templates" ON public.message_templates USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: sms_log Users view own sms logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own sms logs" ON public.sms_log FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: channex_outbound_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channex_outbound_log ENABLE ROW LEVEL SECURITY;

--
-- Name: channex_rate_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channex_rate_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: channex_room_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channex_room_types ENABLE ROW LEVEL SECURITY;

--
-- Name: channex_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channex_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: channex_webhook_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channex_webhook_log ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaning_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: concurrency_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concurrency_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: ical_feeds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ical_feeds ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: local_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.local_events ENABLE ROW LEVEL SECURITY;

--
-- Name: market_comps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_comps ENABLE ROW LEVEL SECURITY;

--
-- Name: market_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: message_automation_firings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_automation_firings ENABLE ROW LEVEL SECURITY;

--
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: message_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_performance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_performance ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: property_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_details ENABLE ROW LEVEL SECURITY;

--
-- Name: revenue_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revenue_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: review_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: weather_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict h1nb3FqliL2bO5Xx8FeB3QiUvr2BDfpAl197nIH1krIkHZ4K5OUwhKDdtz0Mm9i


--
-- PostgreSQL database dump
--

\restrict dgwX4U8RVzM3GQfQbxfLfbzO1wmrNuDSUMEgul0ReFujccb6CpGkQpB5hJGbeo5

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
    CONSTRAINT calendar_rates_rate_source_check CHECK ((rate_source = ANY (ARRAY['manual'::text, 'engine'::text, 'override'::text])))
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
-- Name: guest_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    property_id uuid NOT NULL,
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
    CONSTRAINT guest_reviews_direction_check CHECK ((direction = ANY (ARRAY['outgoing'::text, 'incoming'::text]))),
    CONSTRAINT guest_reviews_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5))),
    CONSTRAINT guest_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'draft_generated'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'bad_review_held'::text])))
);


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
    longitude numeric(10,7)
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
    ai_draft_status text DEFAULT 'none'::text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_ai_draft_status_check CHECK ((ai_draft_status = ANY (ARRAY['none'::text, 'pending'::text, 'generated'::text, 'approved'::text, 'sent'::text]))),
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


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
    CONSTRAINT properties_property_type_check CHECK ((property_type = ANY (ARRAY['entire_home'::text, 'private_room'::text, 'shared_room'::text])))
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
    property_id uuid NOT NULL,
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
-- Name: calendar_rates calendar_rates_property_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_rates
    ADD CONSTRAINT calendar_rates_property_id_date_key UNIQUE (property_id, date);


--
-- Name: cleaners cleaners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaners
    ADD CONSTRAINT cleaners_pkey PRIMARY KEY (id);


--
-- Name: cleaning_tasks cleaning_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_pkey PRIMARY KEY (id);


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
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


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
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


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
-- Name: idx_bookings_channex_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bookings_channex_booking_id ON public.bookings USING btree (channex_booking_id) WHERE (channex_booking_id IS NOT NULL);


--
-- Name: idx_bookings_property_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_property_checkin ON public.bookings USING btree (property_id, check_in);


--
-- Name: idx_calendar_rates_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_rates_property_date ON public.calendar_rates USING btree (property_id, date);


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

CREATE UNIQUE INDEX idx_cleaning_tasks_token ON public.cleaning_tasks USING btree (cleaner_token) WHERE (cleaner_token IS NOT NULL);


--
-- Name: idx_guest_reviews_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_reviews_property ON public.guest_reviews USING btree (property_id);


--
-- Name: idx_guest_reviews_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_reviews_scheduled ON public.guest_reviews USING btree (scheduled_publish_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_guest_reviews_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_reviews_status ON public.guest_reviews USING btree (status);


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
-- Name: idx_message_templates_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_property ON public.message_templates USING btree (property_id);


--
-- Name: idx_message_templates_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_trigger ON public.message_templates USING btree (trigger_type, is_active);


--
-- Name: idx_messages_property_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_property_created ON public.messages USING btree (property_id, created_at);


--
-- Name: idx_pricing_outcomes_booked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_outcomes_booked ON public.pricing_outcomes USING btree (was_booked, date);


--
-- Name: idx_pricing_outcomes_property_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_outcomes_property_date ON public.pricing_outcomes USING btree (property_id, date);


--
-- Name: idx_properties_channex_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_properties_channex_id ON public.properties USING btree (channex_property_id) WHERE (channex_property_id IS NOT NULL);


--
-- Name: idx_properties_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_user ON public.properties USING btree (user_id);


--
-- Name: idx_revenue_checks_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenue_checks_ip ON public.revenue_checks USING btree (ip_address, created_at);


--
-- Name: idx_review_rules_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_rules_property ON public.review_rules USING btree (property_id);


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
-- Name: bookings bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


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
    ADD CONSTRAINT cleaning_tasks_cleaner_id_fkey FOREIGN KEY (cleaner_id) REFERENCES auth.users(id);


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
-- Name: message_templates message_templates_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


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
-- Name: guest_reviews Users can manage own guest_reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own guest_reviews" ON public.guest_reviews USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: review_rules Users can manage own review_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own review_rules" ON public.review_rules USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: ical_feeds Users can manage their own ical feeds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own ical feeds" ON public.ical_feeds USING ((property_id IN ( SELECT properties.id
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
-- Name: cleaning_tasks Users can view own cleaning_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own cleaning_tasks" ON public.cleaning_tasks FOR SELECT USING ((property_id IN ( SELECT properties.id
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

CREATE POLICY "Users can view own local_events" ON public.local_events USING (((property_id IS NULL) OR (property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid())))));


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

CREATE POLICY "Users can view own pricing_outcomes" ON public.pricing_outcomes USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.user_id = auth.uid()))));


--
-- Name: properties Users can view own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own properties" ON public.properties FOR SELECT USING ((auth.uid() = user_id));


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
-- Name: cleaners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaning_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: ical_feeds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ical_feeds ENABLE ROW LEVEL SECURITY;

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
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_details ENABLE ROW LEVEL SECURITY;

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
-- PostgreSQL database dump complete
--

\unrestrict dgwX4U8RVzM3GQfQbxfLfbzO1wmrNuDSUMEgul0ReFujccb6CpGkQpB5hJGbeo5


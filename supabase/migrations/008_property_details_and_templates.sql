-- Property details for onboarding and AI messaging context
CREATE TABLE IF NOT EXISTS property_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) NOT NULL UNIQUE,
  wifi_network text,
  wifi_password text,
  door_code text,
  smart_lock_instructions text,
  checkin_time time DEFAULT '15:00',
  checkout_time time DEFAULT '11:00',
  parking_instructions text,
  house_rules text,
  local_recommendations text,
  emergency_contact text,
  special_instructions text,
  custom_fields jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Message templates for automated guest communication
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) NOT NULL,
  template_type text NOT NULL,
  subject text,
  body text NOT NULL,
  is_active boolean DEFAULT true,
  trigger_type text NOT NULL,
  trigger_days_offset int DEFAULT 0,
  trigger_time time,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own property details" ON property_details FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
CREATE POLICY "Users manage own templates" ON message_templates FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE INDEX idx_message_templates_property ON message_templates(property_id);
CREATE INDEX idx_message_templates_trigger ON message_templates(trigger_type, is_active);

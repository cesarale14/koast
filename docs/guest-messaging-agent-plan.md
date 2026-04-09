# Guest Messaging Agent — Implementation Plan

**Date:** 2026-04-09
**Strategic context:** This is StayCommand's competitive moat against Hospitable, whose entire value prop is automated guest messaging.

## Architecture

```
                    ┌─────────────────────┐
                    │   Airbnb/BDC/VRBO   │
                    │   Guest sends msg   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   Channex Webhook   │
                    │   (message event)   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  StayCommand API    │
                    │  /api/messages/     │
                    │  incoming           │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  Claude Managed     │
                    │  Agents Session     │
                    │                     │
                    │  Tools:             │
                    │  - read_booking     │
                    │  - read_property    │
                    │  - read_messages    │
                    │  - check_rules      │
                    │  - send_message     │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │Auto-send │   │  Draft   │   │ Escalate │
        │(common Q)│   │(complex) │   │(urgent)  │
        └──────────┘   └──────────┘   └──────────┘
```

## Triggers

### 1. Webhook: New Guest Message
- Channex sends message events to `/api/webhooks/channex`
- Event type: `message_new` or similar
- Contains: message text, booking_id, guest info, property_id
- Response: Create Managed Agent session immediately

### 2. Scheduled: Unanswered Message Check
- VPS worker runs every 5 minutes
- Queries messages table for unanswered guest messages older than 2 minutes
- For each: creates a Managed Agent session

### 3. Manual: Host Requests AI Draft
- Host clicks "AI Draft" button in Messages page
- Frontend calls API → creates session → streams response

## Agent Definition

```python
agent = client.beta.agents.create(
    name="StayCommand Guest Assistant",
    model="claude-sonnet-4-6",
    system="""You are a professional Airbnb/vacation rental guest communication assistant.

Your job:
1. Read the guest's message and conversation history
2. Look up the relevant booking and property details
3. Determine the best response based on the host's rules
4. Either auto-respond, draft for approval, or escalate

Response guidelines:
- Be warm, professional, and concise
- Use the guest's first name
- Reference specific booking details (dates, property name)
- Only state facts from the property/booking records — never make up info
- For check-in instructions, WiFi, parking: respond with exact details
- For pricing/refund questions: escalate to host
- For complaints/damage: escalate immediately
- Match the host's preferred tone (casual, professional, friendly)

Response format:
- action: "auto_send" | "draft" | "escalate"
- message: the composed response text
- reason: why this action was chosen
- confidence: 0.0-1.0
""",
    tools=[{"type": "agent_toolset_20260401"}]
)
```

## Tools

### read_booking
```json
{
  "name": "read_booking",
  "description": "Fetch booking details by booking ID or guest name",
  "input_schema": {
    "type": "object",
    "properties": {
      "booking_id": { "type": "string" },
      "guest_name": { "type": "string" }
    }
  }
}
```
Returns: check_in, check_out, guest_name, guest_email, total_price, num_guests, platform, status, notes

### read_property
```json
{
  "name": "read_property",
  "description": "Fetch property details including check-in instructions, house rules, amenities",
  "input_schema": {
    "type": "object",
    "properties": {
      "property_id": { "type": "string" }
    }
  }
}
```
Returns: name, address, check_in_instructions, check_out_instructions, wifi_name, wifi_password, door_code, parking_instructions, house_rules, amenities, emergency_contact

### read_messages
```json
{
  "name": "read_messages",
  "description": "Fetch conversation history with a guest",
  "input_schema": {
    "type": "object",
    "properties": {
      "booking_id": { "type": "string" },
      "limit": { "type": "integer", "default": 20 }
    }
  }
}
```
Returns: array of { sender, text, timestamp }

### check_rules
```json
{
  "name": "check_rules",
  "description": "Check host's auto-reply rules and tone preferences",
  "input_schema": {
    "type": "object",
    "properties": {
      "property_id": { "type": "string" }
    }
  }
}
```
Returns: auto_reply_enabled, tone (casual/professional/friendly), auto_topics (check_in, wifi, parking, directions), escalate_topics (pricing, refunds, complaints, damage), response_delay_minutes

### send_message
```json
{
  "name": "send_message",
  "description": "Send or draft a message to the guest",
  "input_schema": {
    "type": "object",
    "properties": {
      "booking_id": { "type": "string" },
      "text": { "type": "string" },
      "action": { "type": "string", "enum": ["auto_send", "draft", "escalate"] },
      "confidence": { "type": "number" }
    }
  }
}
```
- auto_send: sends immediately via Channex Messages API
- draft: saves to messages table with status="draft", notifies host
- escalate: saves with status="escalate", sends push notification to host

## Response Modes

### Auto-Respond (confidence > 0.85)
Common questions with clear answers from property data:
- "What's the WiFi password?" → Auto-send WiFi details
- "What time is check-in?" → Auto-send check-in time
- "Where do I park?" → Auto-send parking instructions
- "What's the address?" → Auto-send address

### Draft (confidence 0.5-0.85)
Questions requiring judgment:
- "Can I check in early?" → Draft: "I'll check with the host about early check-in..."
- "Is there a pool nearby?" → Draft with info from property details
- "Can I bring my dog?" → Draft based on pet policy

### Escalate (confidence < 0.5 or sensitive topics)
- "I want a refund" → Escalate immediately
- "There's a water leak" → Escalate with urgency flag
- "The door code doesn't work" → Escalate + auto-send "I'm notifying the host right away"
- Any message containing: damage, emergency, refund, police, lawsuit

## Database Changes

### New table: auto_reply_rules
```sql
CREATE TABLE auto_reply_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  tone text DEFAULT 'friendly', -- casual, professional, friendly
  auto_topics text[] DEFAULT '{check_in,wifi,parking,directions,amenities}',
  escalate_topics text[] DEFAULT '{refund,damage,complaint,emergency}',
  response_delay_minutes integer DEFAULT 2, -- wait before auto-sending
  max_auto_replies_per_day integer DEFAULT 20,
  greeting_template text, -- custom greeting override
  created_at timestamptz DEFAULT now()
);
```

### Extend messages table
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_action text; -- auto_sent, drafted, escalated
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_confidence numeric;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_reason text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_session_id text;
```

### New table: agent_sessions
```sql
CREATE TABLE agent_sessions (
  id text PRIMARY KEY, -- Managed Agent session ID
  property_id uuid REFERENCES properties(id),
  booking_id uuid REFERENCES bookings(id),
  trigger text NOT NULL, -- webhook, scheduled, manual
  status text DEFAULT 'running', -- running, completed, failed
  action_taken text, -- auto_sent, drafted, escalated
  tokens_used integer,
  cost_estimate numeric,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/messages/incoming` | POST | Receives message webhook, triggers agent |
| `/api/messages/ai-draft` | POST | Manual AI draft request from host |
| `/api/messages/approve` | POST | Host approves AI draft → sends to guest |
| `/api/messages/settings` | GET/PUT | Auto-reply rules per property |
| `/api/messages/agent-log` | GET | Agent session history + decisions |

## Cost Estimate

Based on Managed Agents pricing:

| Scenario | Sessions/day | Avg tokens/session | Est. daily cost |
|----------|-------------|-------------------|-----------------|
| 1 property, 5 msgs/day | 5 | ~2,000 | ~$0.05 |
| 4 properties, 20 msgs/day | 20 | ~2,000 | ~$0.20 |
| 50 properties, 200 msgs/day | 200 | ~2,000 | ~$2.00 |

At scale (50 properties): ~$60/month — well within the $79/mo Pro plan pricing.

## UI Changes

### Messages Page Updates
1. **AI status badge** on each message: "AI Auto-sent ✓", "AI Draft (pending)", "Escalated ⚠️"
2. **Approval flow**: Draft messages show with "Approve & Send" / "Edit" / "Discard" buttons
3. **Confidence indicator**: Color-coded bar showing how confident the AI was
4. **Settings panel**: Toggle auto-reply, set tone, configure auto/escalate topics
5. **Agent log**: Expandable section showing what the agent did and why

### Property Detail Updates
- Auto-reply toggle in property settings
- Tone selector (casual/professional/friendly)
- Topic configuration (which questions auto-respond, which escalate)

## Phased Rollout

### Phase 1: AI Draft Mode (ship first)
- Host clicks "AI Draft" → Claude generates response → host reviews and sends
- No auto-sending, no webhooks, no scheduling
- Uses standard Messages API (not Managed Agents) for simplicity
- Database: extend messages table with ai_action, ai_confidence
- UI: Add draft button, show AI responses, approve/edit flow
- **Timeline: 1-2 days**

### Phase 2: Auto-Reply on Common Questions
- Enable auto-reply for simple factual questions (WiFi, check-in, parking)
- Requires: auto_reply_rules table, property details populated
- Still uses Messages API with tool use (not Managed Agents yet)
- Host can toggle on/off per property
- **Timeline: 2-3 days**

### Phase 3: Managed Agents Integration
- Migrate to Managed Agents for autonomous operation
- Add webhook trigger for incoming messages
- Add scheduled check for unanswered messages
- Full escalation flow with push notifications
- Agent session logging and analytics
- **Timeline: 1-2 weeks**

### Phase 4: Intelligence Layer
- Learn from host edits (when host changes AI draft, learn the pattern)
- Per-property response style adaptation
- Multi-language support
- Sentiment analysis on guest messages
- Revenue impact tracking (response time → booking conversion)
- **Timeline: 2-4 weeks**

## Integration with Existing Infrastructure

### Channex Messages API
- Channex has a Messages API for sending/receiving guest messages
- Messages arrive via webhook (same `/api/webhooks/channex` endpoint)
- We can send replies via Channex to reach guests on Airbnb/BDC/VRBO
- Need to verify: does our Channex channel have messaging scope? (Check `settings.scope` — currently includes `messages_read messages_write`)

### Existing Messages Table
- Already has: id, property_id, booking_id, sender, text, timestamp
- Extend with: ai_action, ai_confidence, ai_reason, agent_session_id
- The UnifiedInbox component already shows messages — add AI indicators

### Existing Claude Integration
- Already using Claude API for AI drafts (POST /api/messages/draft)
- Upgrade path: Messages API → Managed Agents is additive, not rewrite

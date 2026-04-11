import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (!client) {
    if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendSMS(to: string, body: string): Promise<string | null> {
  if (!from) throw new Error("TWILIO_PHONE_NUMBER not configured");
  try {
    const message = await getClient().messages.create({ body, from, to });
    return message.sid;
  } catch (err) {
    console.error("[sms] Failed to send:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Variant that throws on error so callers can return the actual error
 * message instead of a generic boolean. Use this for user-initiated
 * actions like Test SMS where we want to surface the cause.
 */
export async function sendSMSOrThrow(to: string, body: string): Promise<string> {
  if (!from) throw new Error("TWILIO_PHONE_NUMBER not configured on the server");
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured on the server");
  try {
    const message = await getClient().messages.create({ body, from, to });
    return message.sid;
  } catch (err) {
    // Twilio errors have a `code` and `message`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const code = e?.code ? ` (Twilio code ${e.code})` : "";
    const msg = e?.message || (err instanceof Error ? err.message : "Unknown SMS error");
    throw new Error(`${msg}${code}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logSMS(supabase: any, params: {
  userId?: string;
  cleanerId?: string;
  cleaningTaskId?: string;
  phoneTo: string;
  messageBody: string;
  twilioSid: string | null;
  status?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("sms_log") as any).insert({
    user_id: params.userId ?? null,
    cleaner_id: params.cleanerId ?? null,
    cleaning_task_id: params.cleaningTaskId ?? null,
    phone_to: params.phoneTo,
    message_body: params.messageBody,
    twilio_sid: params.twilioSid,
    status: params.status ?? (params.twilioSid ? "sent" : "failed"),
  });
}

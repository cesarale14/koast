import { sendSMS, logSMS } from "./sms";

interface NotificationPayload {
  type: string;
  recipient: string;
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // M10 Phase C STEP 7 (M3): owning-host attribution. null permitted only
  // for legitimately-unknown host paths (defensive null-safety); all 4
  // notify* callers source a host id (cleaner-notify via opts.userId;
  // host-notify via explicit hostId param). NULL rows stay invisible to
  // per-host audit-feed filtering (STEP 8 WHERE host_id = $auth_uid).
  hostId: string | null,
  payload: NotificationPayload,
  channel = "sms",
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("notifications") as any).insert({
    host_id: hostId,
    type: payload.type,
    recipient: payload.recipient,
    message: payload.message,
    channel,
  });
}

// Resolves lazily so module import doesn't crash in environments where
// NEXT_PUBLIC_APP_URL isn't set. Every code path that sends SMS reaches
// through one of the notify* helpers, which call this first.
function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url;
}

export async function notifyCleanerAssigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string; scheduled_time?: string | null; cleaner_token: string },
  propertyName: string,
  cleaner: { id: string; phone: string; name: string },
  opts?: { checkoutTime?: string; checkinTime?: string; userId?: string }
) {
  const link = `${getAppUrl()}/clean/${task.id}/${task.cleaner_token}`;
  const date = new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const body = `Koast: New cleaning task for ${propertyName} on ${date}.${
    opts?.checkoutTime ? ` Checkout: ${opts.checkoutTime}.` : ""
  }${opts?.checkinTime ? ` Next check-in: ${opts.checkinTime}.` : ""
  }\nView checklist: ${link}`;

  const sid = await sendSMS(cleaner.phone, body);
  await logSMS(supabase, {
    userId: opts?.userId,
    cleanerId: cleaner.id,
    cleaningTaskId: task.id,
    phoneTo: cleaner.phone,
    messageBody: body,
    twilioSid: sid,
  });
  await storeNotification(
    supabase,
    opts?.userId ?? null,
    { type: "cleaner_assigned", recipient: cleaner.name, message: body },
  );
}

export async function notifyCleanerReminder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string; cleaner_token: string },
  propertyName: string,
  propertyAddress: string,
  cleaner: { id: string; phone: string; name: string },
  opts?: { checkoutTime?: string; userId?: string }
) {
  const link = `${getAppUrl()}/clean/${task.id}/${task.cleaner_token}`;
  const body = `Koast reminder: Cleaning tomorrow at ${propertyName}.${
    propertyAddress ? `\n${propertyAddress}.` : ""
  }${opts?.checkoutTime ? ` Checkout at ${opts.checkoutTime}.` : ""
  }\nChecklist: ${link}`;

  const sid = await sendSMS(cleaner.phone, body);
  await logSMS(supabase, {
    userId: opts?.userId,
    cleanerId: cleaner.id,
    cleaningTaskId: task.id,
    phoneTo: cleaner.phone,
    messageBody: body,
    twilioSid: sid,
  });
  await storeNotification(
    supabase,
    opts?.userId ?? null,
    { type: "cleaner_reminder", recipient: cleaner.name, message: body },
  );
}

export async function notifyHostComplete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // M10 Phase C STEP 7 (M3): owning-host id. Cleaner-facing routes derive
  // via task.property_id -> properties.user_id (no auth.uid available;
  // public-token endpoint). Pass null only if derivation legitimately fails.
  hostId: string | null,
  task: { id: string; scheduled_date: string },
  propertyName: string,
  hostPhone?: string | null,
  checklist?: { done: boolean }[],
  checkinTime?: string
) {
  const completed = checklist?.filter((i) => i.done).length ?? 0;
  const total = checklist?.length ?? 0;
  const body = `Cleaning complete at ${propertyName}.\nChecklist: ${completed}/${total} items done.${
    checkinTime ? `\nNext guest checks in at ${checkinTime}.` : ""
  }`;

  if (hostPhone) {
    const sid = await sendSMS(hostPhone, body);
    await logSMS(supabase, {
      cleaningTaskId: task.id,
      phoneTo: hostPhone,
      messageBody: body,
      twilioSid: sid,
    });
  }
  await storeNotification(
    supabase,
    hostId,
    { type: "host_complete", recipient: "host", message: body },
  );
}

export async function notifyHostIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // M10 Phase C STEP 7 (M3): owning-host id. Same pattern as notifyHostComplete.
  hostId: string | null,
  task: { id: string; scheduled_date: string; cleaner_token?: string },
  propertyName: string,
  issue: string,
  hostPhone?: string | null
) {
  const link = task.cleaner_token ? `${getAppUrl()}/clean/${task.id}/${task.cleaner_token}` : "";
  const body = `Issue reported at ${propertyName}: ${issue}${link ? `\nView details: ${link}` : ""}`;

  if (hostPhone) {
    const sid = await sendSMS(hostPhone, body);
    await logSMS(supabase, {
      cleaningTaskId: task.id,
      phoneTo: hostPhone,
      messageBody: body,
      twilioSid: sid,
    });
  }
  await storeNotification(
    supabase,
    hostId,
    { type: "host_issue", recipient: "host", message: body },
  );
}

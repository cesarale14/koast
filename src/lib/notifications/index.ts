// Notification stubs — will connect to Twilio/Slack later

interface NotificationPayload {
  type: string;
  recipient: string;
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeNotification(supabase: any, payload: NotificationPayload) {
  console.log(`[notification] ${payload.type} → ${payload.recipient}: ${payload.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("notifications") as any).insert({
    type: payload.type,
    recipient: payload.recipient,
    message: payload.message,
    channel: "console",
  });
}

export async function notifyCleanerAssigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string; cleaner_token: string },
  cleanerName: string
) {
  await storeNotification(supabase, {
    type: "cleaner_assigned",
    recipient: cleanerName,
    message: `You've been assigned a cleaning task for ${task.scheduled_date}. Access: /clean/${task.id}/${task.cleaner_token}`,
  });
}

export async function notifyCleanerReminder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string },
  cleanerName: string
) {
  await storeNotification(supabase, {
    type: "cleaner_reminder",
    recipient: cleanerName,
    message: `Reminder: cleaning task scheduled for ${task.scheduled_date}`,
  });
}

export async function notifyHostComplete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string },
  propertyName: string
) {
  await storeNotification(supabase, {
    type: "host_complete",
    recipient: "host",
    message: `Cleaning completed for ${propertyName} on ${task.scheduled_date}`,
  });
}

export async function notifyHostIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string },
  propertyName: string,
  issue: string
) {
  await storeNotification(supabase, {
    type: "host_issue",
    recipient: "host",
    message: `Issue reported at ${propertyName} on ${task.scheduled_date}: ${issue}`,
  });
}

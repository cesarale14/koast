import { sendSMS, logSMS } from "./sms";

interface NotificationPayload {
  type: string;
  recipient: string;
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeNotification(supabase: any, payload: NotificationPayload, channel = "sms") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("notifications") as any).insert({
    type: payload.type,
    recipient: payload.recipient,
    message: payload.message,
    channel,
  });
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.STAYCOMMAND_API_URL ?? "https://staycommand.vercel.app";

export async function notifyCleanerAssigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string; scheduled_time?: string | null; cleaner_token: string },
  propertyName: string,
  cleaner: { id: string; phone: string; name: string },
  opts?: { checkoutTime?: string; checkinTime?: string; userId?: string }
) {
  const link = `${BASE_URL}/clean/${task.id}/${task.cleaner_token}`;
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
  await storeNotification(supabase, { type: "cleaner_assigned", recipient: cleaner.name, message: body });
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
  const link = `${BASE_URL}/clean/${task.id}/${task.cleaner_token}`;
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
  await storeNotification(supabase, { type: "cleaner_reminder", recipient: cleaner.name, message: body });
}

export async function notifyHostComplete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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
  await storeNotification(supabase, { type: "host_complete", recipient: "host", message: body });
}

export async function notifyHostIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  task: { id: string; scheduled_date: string; cleaner_token?: string },
  propertyName: string,
  issue: string,
  hostPhone?: string | null
) {
  const link = task.cleaner_token ? `${BASE_URL}/clean/${task.id}/${task.cleaner_token}` : "";
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
  await storeNotification(supabase, { type: "host_issue", recipient: "host", message: body });
}

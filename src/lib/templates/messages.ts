export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  autoReplyType?: string; // for auto-pilot matching
}

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "check_in",
    name: "Check-in Instructions",
    content: `Welcome to {property_name}! Check-in is at 3:00 PM. You'll find the lockbox on the front door — the code is your last 4 digits of your phone number. WiFi and house guide are on the kitchen counter. Let us know if you need anything!`,
    autoReplyType: "check_in",
  },
  {
    id: "wifi",
    name: "WiFi Info",
    content: `The WiFi network is "{property_name} Guest" and the password is on the card next to the TV. Let us know if you have any trouble connecting!`,
    autoReplyType: "wifi",
  },
  {
    id: "checkout",
    name: "Checkout Reminder",
    content: `Hi {guest_name}! Just a friendly reminder that checkout is at 11:00 AM tomorrow. Please start the dishwasher, take out any trash, and leave the keys on the counter. We hope you had a wonderful stay at {property_name}!`,
    autoReplyType: "checkout",
  },
  {
    id: "local_recs",
    name: "Local Recommendations",
    content: `Great question! Here are some of our favorite spots near {property_name}: For restaurants, we love [Restaurant 1] and [Restaurant 2]. The nearest grocery store is about 5 minutes away. For beaches/attractions, check out [Spot 1]. Let us know if you'd like more specific recommendations!`,
  },
  {
    id: "early_checkin",
    name: "Early Check-in Request",
    content: `Thanks for asking, {guest_name}! We'll do our best to accommodate an early check-in. It depends on when our cleaning team finishes — we'll confirm by the morning of your check-in day. We'll text you as soon as the place is ready!`,
    autoReplyType: "early_checkin",
  },
  {
    id: "late_checkout",
    name: "Late Checkout Request",
    content: `Hi {guest_name}! We can sometimes offer late checkout depending on our cleaning schedule and next guest arrival. Let us check and get back to you — we'll do our best to make it work!`,
    autoReplyType: "late_checkout",
  },
];

export function fillTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value ?? "");
  }
  return result;
}

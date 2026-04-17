export interface DefaultTemplate {
  templateType: string;
  subject: string;
  body: string;
  triggerType: string;
  triggerDaysOffset: number;
  triggerTime: string;
}

export const DEFAULT_ONBOARDING_TEMPLATES: DefaultTemplate[] = [
  {
    templateType: "booking_confirmation",
    subject: "Booking Confirmed!",
    body: `Hi {guest_name},

Your stay at {property_name} is confirmed!

Check-in: {check_in} at {checkin_time}
Check-out: {check_out} at {checkout_time}

We're looking forward to hosting you. I'll send check-in details a day before your arrival — reach out any time before then if you have questions.`,
    triggerType: "on_booking",
    triggerDaysOffset: 0,
    triggerTime: "12:00",
  },
  {
    templateType: "pre_arrival",
    subject: "Getting Ready for Your Stay",
    body: `Hi {guest_name},

Your trip to {property_name} is coming up in 3 days. Here's a quick preview:

Check-in: {check_in} at {checkin_time}
Check-out: {check_out} at {checkout_time}
Parking: {parking_instructions}

I'll send full check-in details tomorrow. See you soon.`,
    triggerType: "before_checkin",
    triggerDaysOffset: -3,
    triggerTime: "10:00",
  },
  {
    templateType: "checkin_instructions",
    subject: "Check-in Instructions",
    body: `Hi {guest_name}, here are your check-in details for tomorrow:

Door access: {door_code}
WiFi: {wifi_network} / Password: {wifi_password}
Parking: {parking_instructions}
Check-in time: {checkin_time}

House rules:
{house_rules}

If you need anything during your stay, just message me here. Enjoy.`,
    triggerType: "before_checkin",
    triggerDaysOffset: -1,
    triggerTime: "14:00",
  },
  {
    templateType: "welcome",
    subject: "Welcome!",
    body: `Welcome to {property_name}, {guest_name}!

Hope you had a smooth arrival — everything should be ready for you.

Quick reminders:
WiFi: {wifi_network} / {wifi_password}
Door: {door_code}

{special_instructions}

Let me know if you need anything at all.`,
    triggerType: "on_checkin",
    triggerDaysOffset: 0,
    triggerTime: "16:00",
  },
  {
    templateType: "midstay_checkin",
    subject: "How's Everything Going?",
    body: `Hi {guest_name}, just checking in — how's everything at {property_name}?

If there's anything you need or any way I can make the rest of your stay better, let me know.`,
    triggerType: "after_checkin",
    triggerDaysOffset: 2,
    triggerTime: "11:00",
  },
  {
    templateType: "checkout_reminder",
    subject: "Checkout Tomorrow",
    body: `Hi {guest_name},

A friendly reminder that checkout is tomorrow at {checkout_time}.

Before you go:
- Please start the dishwasher if you used any dishes
- Leave used towels in the bathtub
- Lock the door behind you

Thanks for being a great guest.`,
    triggerType: "before_checkout",
    triggerDaysOffset: -1,
    triggerTime: "18:00",
  },
  {
    templateType: "thank_you",
    subject: "Thank You",
    body: `Thank you for staying at {property_name}, {guest_name}.

We hope you had a great time. If you enjoyed your stay, we'd really appreciate a review — it helps us a lot.

You're always welcome back. Safe travels.`,
    triggerType: "on_checkout",
    triggerDaysOffset: 0,
    triggerTime: "14:00",
  },
  {
    templateType: "review_request",
    subject: "Quick Favor",
    body: `Hi {guest_name},

Hope you made it home safe. We loved hosting you at {property_name}.

Would you mind leaving us a quick review? It takes less than a minute and really helps future guests find us.

Thank you.`,
    triggerType: "after_checkout",
    triggerDaysOffset: 2,
    triggerTime: "10:00",
  },
];

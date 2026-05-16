/**
 * All-patterns fixture — M9 Phase F D24.
 *
 * Contains one matching example per PHASE_F_SHIP catalog entry. Meta-test
 * asserts every catalog id matches ≥1 segment of this fixture; failure
 * means either a regex regression or an out-of-date fixture.
 *
 * Maintenance discipline (gate STEP 6.3):
 *   - When you add a catalog entry, add a fixture line below in the same PR.
 *   - When you remove a catalog entry, remove its fixture line in the same PR.
 *   - The introspection meta-test in anti-patterns.test.ts enforces both
 *     directions: every id has a fixture line; every fixture line has a
 *     matching catalog id.
 *
 * Each pattern is delineated by a `// pattern: <id>` comment so the
 * fixture is human-readable + machine-checkable.
 */

export const ALL_PATTERNS_FIXTURE = `
// pattern: sycophancy_great_question
Great question! You're absolutely right to ask.

// pattern: sycophancy_smart_approach
That's a smart approach for this season.

// pattern: sycophancy_excellent_point
Excellent point about the lead-time signal.

// pattern: sycophancy_love_thinking
I love that you're thinking about this carefully.

// pattern: sycophancy_thoughtful_frame
What a thoughtful way to frame it.

// pattern: sycophancy_brilliant_idea
Brilliant idea — we should run with it.

// pattern: sycophancy_excellent_question_guest
What an excellent question about checkout!

// pattern: sycophancy_great_choice_booking
Great choice on the booking — you'll love this place.

// pattern: sycophancy_so_excited_chain
We're so excited to have you with us!

// pattern: sycophancy_absolutely_love_hosting
We absolutely love hosting guests like you.

// pattern: apology_sorry_but_cannot
I'm sorry, but I cannot push to that channel right now.

// pattern: apology_apologize_no_access
I apologize, I don't have access to that data.

// pattern: apology_unfortunately_unable
Unfortunately, I'm unable to do that for you.

// pattern: apology_deeply_apologize
I deeply apologize for any inconvenience this caused.

// pattern: apology_please_accept
Please accept my apologies for the missing report.

// pattern: apology_so_sorry_confusion
I'm so sorry for any confusion my earlier message caused.

// pattern: apology_apologies_delay
My apologies for the delay in responding to your request.

// pattern: hedge_think_maybe
I think maybe the calendar push went through.

// pattern: hedge_might_perhaps
It might be the case that perhaps the rate is too low.

// pattern: hedge_not_entirely_sure
I'm not entirely sure, but the booking might be cancelled.

// pattern: hedge_had_to_guess
If I had to guess, the channel reconnected overnight.

// pattern: hedge_seems_possible
It seems possible that the webhook fired twice.

// pattern: hedge_would_say_potentially
I would say that potentially the price ceiling is off.

// pattern: hedge_bit_hard_to_say
It's a bit hard to say, but the comp set looks thin.

// pattern: hedge_stacked_qualifiers
The push probably might have failed silently.

// pattern: corporate_reach_out_team
Please reach out to our team for support.

// pattern: corporate_optimized_portfolio
We've optimized your portfolio for the high season.

// pattern: corporate_discuss_next_steps
Let's discuss next steps on the integration.

// pattern: corporate_hop_on_call
I'd love to hop on a call to walk through it.

// pattern: corporate_circle_back
I'll circle back later this week on the rate plan.

// pattern: corporate_touch_base
Let me touch base with the operations side.

// pattern: corporate_aligning_objectives
We're aligning on objectives for Q3.

// pattern: corporate_leveraging_data
We're leveraging your data to surface revenue opportunities.

// pattern: corporate_driving_outcomes
Driving outcomes is the focus this quarter.

// pattern: corporate_synergies
There are real synergies between channels here.

// pattern: corporate_best_practices
We follow best practices for rate management.

// pattern: corporate_our_solution
Our solution handles cross-channel sync automatically.

// pattern: corporate_industry_leading
Koast delivers industry-leading occupancy gains.

// pattern: corporate_cutting_edge
Our cutting-edge engine ingests nine signals.

// pattern: corporate_world_class
World-class infrastructure backs every push.

// pattern: corporate_empowering_hosts
Empowering hosts to take back their time.

// pattern: corporate_streamlining_operations
Streamlining operations across the portfolio.

// pattern: corporate_we_at_koast_believe
We at Koast believe in operational honesty.

// pattern: corporate_our_goal_is_to
Our goal is to surface every revenue opportunity.

// pattern: corporate_we_strive_to
We strive to keep channels healthy at all times.

// pattern: corporate_it_is_our_pleasure_to
It is our pleasure to manage your listings.

// pattern: chipper_heads_up
Just a heads up! Your rate plan changed overnight.

// pattern: chipper_hope_week_great
Hope your week is going great!

// pattern: chipper_good_vibes
Sending good vibes for the upcoming stay!

// pattern: chipper_youve_got_this
You've got this! Just a few more bookings to hit goal.

// pattern: chipper_way_to_go
Way to go! Best month yet.

// pattern: chipper_yay
Yay! Your channel reconnected.

// pattern: chipper_woohoo
Woohoo! New booking just came in.

// pattern: chipper_exciting_news
Exciting news! We just shipped the new pricing tab.

// pattern: chipper_big_news
Big news on the channel-health front this week.

// pattern: ai_as_your_host_ensure_exceptional
As your host, I want to ensure your stay is exceptional.

// pattern: ai_please_dont_hesitate
Please don't hesitate to reach out with any questions.

// pattern: ai_hope_message_finds_well
I hope this message finds you well.

// pattern: ai_trust_message_good_health
I trust this message reaches you in good health.

// pattern: ai_committed_to_providing
We are committed to providing the best experience.

// pattern: ai_satisfaction_top_priority
Your satisfaction is our top priority.

// pattern: ai_anything_else_we_can_do
If there's anything else we can do, let us know.

// pattern: ai_pleasure_to_host_you
It is our pleasure to host you this weekend.

// pattern: ai_we_pride_ourselves
We pride ourselves on quick communication.

// pattern: ai_rest_assured
Rest assured, we will take care of the cleaning.

// pattern: ai_your_host_third_person
Your host has prepared coffee and tea for the morning.
`;

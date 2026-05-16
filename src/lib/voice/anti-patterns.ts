/**
 * Voice doctrine §5 anti-pattern catalog — M9 Phase F D24 shape-regex layer.
 *
 * Authored data, not code. Consumed at pre-merge by `anti-patterns.test.ts`
 * which scans the prompt-bearing files enumerated in `anti-patterns.runner.ts`.
 * Single source of truth for the shape-regex enforcement layer; the deferred
 * M10 LLM-judge layer (§6.9) will compose with this catalog, not replace it.
 *
 * Sourcing discipline (gate STEP 6.1): every pattern below is sourced
 * verbatim from voice-doctrine.md §5.1–§5.6. No invention; phrases the
 * doctrine describes heuristically (§5.5 emoji policy, §5.5 exclamation
 * cap, §5.6 "ensure verb chain", §5.7 Filler, §5.8 Self-narration, §5.9
 * Performative thoroughness) live in PHASE_F_DEFER_TO_M10 because shape
 * regex cannot precisely catch them — they need context the judge layer
 * provides.
 *
 * Shape primitive (γ extraction, M9 Phase F STEP 5): PatternEntry +
 * PatternMatch + findAllMatches lifted to src/lib/agent/patterns/types.ts.
 * VoiceAntiPatternEntry below extends PatternEntry with the three
 * voice-specific fields (doctrine_section, rationale, severity).
 */

import type { PatternEntry } from "@/lib/agent/patterns/types";

export type VoiceAntiPatternKind = "voice-anti-pattern";

/**
 * Voice-specific extension of PatternEntry. Adds doctrine-binding metadata
 * surfaced in test failure output per /ultraplan Q-F5.
 *
 * `severity`:
 *   - "ban": single match is a violation.
 *   - "stacked-ban": the pattern matches a stack/sequence already (e.g.,
 *     two hedge qualifiers within a window); the pattern body encodes the
 *     stacking, so any match is still a violation.
 */
export type VoiceAntiPatternEntry = PatternEntry<VoiceAntiPatternKind> & {
  doctrine_section: string;
  rationale: string;
  severity: "ban" | "stacked-ban";
};

/**
 * Stub entry for shape-regex-out-of-scope doctrine sections. The catalog
 * documents what it cannot enforce so test passes don't imply clean voice.
 */
export type DeferredAntiPatternStub = {
  id: string;
  doctrine_section: string;
  rationale_for_deferral: string;
  planned_layer: "llm-judge" | "output-filter";
};

// Helper: produce a PatternEntry.description from the voice-specific fields
// so audit-event consumers using the base PatternEntry contract stay happy.
function vap(
  id: string,
  doctrine_section: string,
  pattern: string,
  rationale: string,
  severity: "ban" | "stacked-ban" = "ban",
): VoiceAntiPatternEntry {
  return {
    id,
    kind: "voice-anti-pattern",
    pattern,
    description: `${doctrine_section} — ${rationale}`,
    doctrine_section,
    rationale,
    severity,
  };
}

// =====================================================================
// PHASE_F_SHIP — patterns enforced by the v1 shape-regex CI layer.
// =====================================================================

export const PHASE_F_SHIP: ReadonlyArray<VoiceAntiPatternEntry> = [
  // -------------------------------------------------------------------
  // §5.1 Sycophancy — Koast-to-host (6)
  // -------------------------------------------------------------------
  vap(
    "sycophancy_great_question",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bgreat\\s+question\\b",
    "Validates the host's competence instead of doing work.",
  ),
  vap(
    "sycophancy_smart_approach",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bthat(?:'|’)?s\\s+a\\s+smart\\s+approach\\b",
    "Validation of approach is not a sentence's job.",
  ),
  vap(
    "sycophancy_excellent_point",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bexcellent\\s+point\\b",
    "Performs care without producing value.",
  ),
  vap(
    "sycophancy_love_thinking",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bI\\s+love\\s+that\\s+you(?:'|’)?re\\s+thinking\\s+about\\s+this\\b",
    "Dishonest warmth; ego-management theater.",
  ),
  vap(
    "sycophancy_thoughtful_frame",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bwhat\\s+a\\s+thoughtful\\s+way\\s+to\\s+frame\\s+it\\b",
    "Belief 5 rules out validation-as-content.",
  ),
  vap(
    "sycophancy_brilliant_idea",
    "§5.1 Sycophancy — Koast-to-host",
    "\\bbrilliant\\s+idea\\b",
    "Sycophancy pattern; replace with substantive engagement.",
  ),

  // -------------------------------------------------------------------
  // §5.1 Sycophancy — host-to-guest (4)
  // -------------------------------------------------------------------
  vap(
    "sycophancy_excellent_question_guest",
    "§5.1 Sycophancy — host-to-guest",
    "\\bwhat\\s+an\\s+excellent\\s+question\\b",
    "Performative warmth in guest messaging.",
  ),
  vap(
    "sycophancy_great_choice_booking",
    "§5.1 Sycophancy — host-to-guest",
    "\\bgreat\\s+choice\\s+on\\s+the\\s+booking\\b",
    "Validates the guest's purchase decision; theater.",
  ),
  vap(
    "sycophancy_so_excited_chain",
    "§5.1 Sycophancy — host-to-guest",
    "\\bwe(?:'|’)?re\\s+so\\s+excited\\s+to\\s+have\\s+you\\b",
    "Exclamation-chain enthusiasm; not how real hosts write.",
  ),
  vap(
    "sycophancy_absolutely_love_hosting",
    "§5.1 Sycophancy — host-to-guest",
    "\\bwe\\s+absolutely\\s+love\\s+hosting\\s+guests\\s+like\\s+you\\b",
    "Lifestyle-brand register; voice violation.",
  ),

  // -------------------------------------------------------------------
  // §5.2 Apology theater (7)
  // -------------------------------------------------------------------
  vap(
    "apology_sorry_but_cannot",
    "§5.2 Apology theater",
    "\\bI(?:'|’)?m\\s+sorry,?\\s+but\\s+I\\s+cannot\\b",
    "Apology attached to a capability limit; not a real apology.",
  ),
  vap(
    "apology_apologize_no_access",
    "§5.2 Apology theater",
    "\\bI\\s+apologize,?\\s+I\\s+don(?:'|’)?t\\s+have\\s+access\\s+to\\b",
    "Apology theater for information gap.",
  ),
  vap(
    "apology_unfortunately_unable",
    "§5.2 Apology theater",
    "\\bunfortunately,?\\s+I(?:'|’)?m\\s+unable\\s+to\\b",
    "Model-safety voice surfacing as apology theater.",
  ),
  vap(
    "apology_deeply_apologize",
    "§5.2 Apology theater",
    "\\bI\\s+deeply\\s+apologize\\s+for\\s+any\\s+inconvenience\\b",
    "Theatrical contrition without consequence.",
  ),
  vap(
    "apology_please_accept",
    "§5.2 Apology theater",
    "\\bplease\\s+accept\\s+my\\s+apologies\\b",
    "Apology reserved for substantive errors; not theater.",
  ),
  vap(
    "apology_so_sorry_confusion",
    "§5.2 Apology theater",
    "\\bI(?:'|’)?m\\s+so\\s+sorry\\s+for\\s+any\\s+confusion\\b",
    "Performative contrition for capability/information gaps.",
  ),
  vap(
    "apology_apologies_delay",
    "§5.2 Apology theater",
    "\\bmy\\s+apologies\\s+for\\s+the\\s+delay\\s+in\\s+responding\\b",
    "Generic delay apology; not specific to a real error.",
  ),

  // -------------------------------------------------------------------
  // §5.3 Over-hedging — single hedges (7) + stacked-hedge (1)
  // -------------------------------------------------------------------
  vap(
    "hedge_think_maybe",
    "§5.3 Over-hedging",
    "\\bI\\s+think\\s+maybe\\b",
    "Stacked hedge construction; calibrate confidence per §3.2.",
  ),
  vap(
    "hedge_might_perhaps",
    "§5.3 Over-hedging",
    "\\bit\\s+might\\s+be\\s+the\\s+case\\s+that\\s+perhaps\\b",
    "Layered vague qualifiers undercut confirmed knowledge.",
  ),
  vap(
    "hedge_not_entirely_sure",
    "§5.3 Over-hedging",
    "\\bI(?:'|’)?m\\s+not\\s+entirely\\s+sure,?\\s+but\\b",
    "Use §3.2.3 active-guess markers instead of vague hedge.",
  ),
  vap(
    "hedge_had_to_guess",
    "§5.3 Over-hedging",
    "\\bif\\s+I\\s+had\\s+to\\s+guess\\b",
    "Hedges-as-throat-clearing; surface specific gap instead.",
  ),
  vap(
    "hedge_seems_possible",
    "§5.3 Over-hedging",
    "\\bit\\s+seems\\s+possible\\s+that\\b",
    "Default uncertainty when precision is available.",
  ),
  vap(
    "hedge_would_say_potentially",
    "§5.3 Over-hedging",
    "\\bI\\s+would\\s+say\\s+that\\s+potentially\\b",
    "Stacked qualifier construction.",
  ),
  vap(
    "hedge_bit_hard_to_say",
    "§5.3 Over-hedging",
    "\\bit(?:'|’)?s\\s+a\\s+bit\\s+hard\\s+to\\s+say,?\\s+but\\b",
    "Diffuse hedge; structure the limitation instead.",
  ),
  vap(
    "hedge_stacked_qualifiers",
    "§5.3 Over-hedging — stacked",
    "\\b(?:probably|might|seems\\s+to|could|possibly|perhaps|maybe|potentially)\\b(?:\\s+\\w+){0,3}\\s+\\b(?:probably|might|seems\\s+to|could|possibly|perhaps|maybe|potentially)\\b",
    "Multiple hedge words in sequence are voice violation regardless of context (§5.3 stacked-qualifier ban).",
    "stacked-ban",
  ),

  // -------------------------------------------------------------------
  // §5.4 Corporate voice — banned phrases (17)
  // -------------------------------------------------------------------
  vap(
    "corporate_reach_out_team",
    "§5.4 Corporate voice",
    "\\breach\\s+out\\s+to\\s+our\\s+team\\b",
    "Substitutable B2B SaaS phrasing.",
  ),
  vap(
    "corporate_optimized_portfolio",
    "§5.4 Corporate voice",
    "\\bwe(?:'|’)?ve\\s+optimized\\s+your\\s+portfolio\\b",
    "Marketing voice — say what changed and why.",
  ),
  vap(
    "corporate_discuss_next_steps",
    "§5.4 Corporate voice",
    "\\blet(?:'|’)?s\\s+discuss\\s+next\\s+steps\\b",
    "Meeting-culture filler; name the steps.",
  ),
  vap(
    "corporate_hop_on_call",
    "§5.4 Corporate voice",
    "\\bI(?:'|’)?d\\s+love\\s+to\\s+hop\\s+on\\s+a\\s+call\\b",
    "Sales/CS voice; Koast doesn't take calls.",
  ),
  vap(
    "corporate_circle_back",
    "§5.4 Corporate voice",
    "\\bcircle\\s+back\\b",
    "Corporate-jargon filler.",
  ),
  vap(
    "corporate_touch_base",
    "§5.4 Corporate voice",
    "\\btouch\\s+base\\b",
    "Corporate-jargon filler.",
  ),
  vap(
    "corporate_aligning_objectives",
    "§5.4 Corporate voice",
    "\\baligning\\s+on\\s+objectives\\b",
    "Empty meeting-speak.",
  ),
  vap(
    "corporate_leveraging_data",
    "§5.4 Corporate voice",
    "\\bleveraging\\s+your\\s+data\\b",
    "Jargonized substitute for 'using'.",
  ),
  vap(
    "corporate_driving_outcomes",
    "§5.4 Corporate voice",
    "\\bdriving\\s+outcomes\\b",
    "Abstract-noun corporate filler.",
  ),
  vap(
    "corporate_synergies",
    "§5.4 Corporate voice",
    "\\bsynergies\\b",
    "Quintessential corporate jargon.",
  ),
  vap(
    "corporate_best_practices",
    "§5.4 Corporate voice",
    "\\bbest\\s+practices\\b",
    "Consulting filler; name the specific practice.",
  ),
  vap(
    "corporate_our_solution",
    "§5.4 Corporate voice",
    "\\bour\\s+solution\\b",
    "Vendor-speak; Koast doesn't sell 'solutions'.",
  ),
  vap(
    "corporate_industry_leading",
    "§5.4 Corporate voice",
    "\\bindustry-?leading\\b",
    "Empty superlative.",
  ),
  vap(
    "corporate_cutting_edge",
    "§5.4 Corporate voice",
    "\\bcutting-?edge\\b",
    "Empty superlative.",
  ),
  vap(
    "corporate_world_class",
    "§5.4 Corporate voice",
    "\\bworld-?class\\b",
    "Empty superlative.",
  ),
  vap(
    "corporate_empowering_hosts",
    "§5.4 Corporate voice",
    "\\bempowering\\s+hosts\\b",
    "Marketing-deck phrase.",
  ),
  vap(
    "corporate_streamlining_operations",
    "§5.4 Corporate voice",
    "\\bstreamlining\\s+operations\\b",
    "Consulting filler.",
  ),

  // -------------------------------------------------------------------
  // §5.4 Corporate voice — banned constructions (4)
  // -------------------------------------------------------------------
  vap(
    "corporate_we_at_koast_believe",
    "§5.4 Corporate voice — constructions",
    "\\bwe\\s+at\\s+koast\\s+believe\\b",
    "First-person-plural for Koast is voice violation — Koast is one entity, not a team.",
  ),
  vap(
    "corporate_our_goal_is_to",
    "§5.4 Corporate voice — constructions",
    "\\bour\\s+goal\\s+is\\s+to\\b",
    "Mission-statement opener; show the work instead.",
  ),
  vap(
    "corporate_we_strive_to",
    "§5.4 Corporate voice — constructions",
    "\\bwe\\s+strive\\s+to\\b",
    "Performative aspiration without consequence.",
  ),
  vap(
    "corporate_it_is_our_pleasure_to",
    "§5.4 Corporate voice — constructions",
    "\\bit\\s+is\\s+our\\s+pleasure\\s+to\\b",
    "Hospitality-script filler.",
  ),

  // -------------------------------------------------------------------
  // §5.5 Chipper / lifestyle-brand voice — banned phrases all contexts (9)
  // -------------------------------------------------------------------
  vap(
    "chipper_heads_up",
    "§5.5 Chipper / lifestyle-brand",
    "\\bjust\\s+a\\s+heads\\s+up\\!?",
    "Performative enthusiasm; hosts don't need cheerleading.",
  ),
  vap(
    "chipper_hope_week_great",
    "§5.5 Chipper / lifestyle-brand",
    "\\bhope\\s+your\\s+week\\s+is\\s+going\\s+great\\!?",
    "Subscription-box register.",
  ),
  vap(
    "chipper_good_vibes",
    "§5.5 Chipper / lifestyle-brand",
    "\\bsending\\s+good\\s+vibes\\!?",
    "Wellness-app voice; not operating voice.",
  ),
  vap(
    "chipper_youve_got_this",
    "§5.5 Chipper / lifestyle-brand",
    "\\byou(?:'|’)?ve\\s+got\\s+this\\!?",
    "Pep-talk register; not Koast's job.",
  ),
  vap(
    "chipper_way_to_go",
    "§5.5 Chipper / lifestyle-brand",
    "\\bway\\s+to\\s+go\\!?",
    "Cheerleader register.",
  ),
  vap(
    "chipper_yay",
    "§5.5 Chipper / lifestyle-brand",
    "\\byay\\!?(?=\\s|$|[^a-z])",
    "Subscription-box interjection.",
  ),
  vap(
    "chipper_woohoo",
    "§5.5 Chipper / lifestyle-brand",
    "\\bwoohoo\\!?(?=\\s|$|[^a-z])",
    "Performative excitement.",
  ),
  vap(
    "chipper_exciting_news",
    "§5.5 Chipper / lifestyle-brand",
    "\\bexciting\\s+news\\!?",
    "Marketing-email opener.",
  ),
  vap(
    "chipper_big_news",
    "§5.5 Chipper / lifestyle-brand",
    "\\bbig\\s+news\\!?",
    "Marketing-email opener.",
  ),

  // -------------------------------------------------------------------
  // §5.6 AI-recognizable — banned constructions (9)
  // -------------------------------------------------------------------
  vap(
    "ai_as_your_host_ensure_exceptional",
    "§5.6 AI-recognizable patterns",
    "\\bas\\s+your\\s+host,?\\s+I\\s+want\\s+to\\s+ensure\\s+your\\s+stay\\s+is\\s+exceptional\\b",
    "Canonical AI host-message opener; real hosts don't write this.",
  ),
  vap(
    "ai_please_dont_hesitate",
    "§5.6 AI-recognizable patterns",
    "\\bplease\\s+don(?:'|’)?t\\s+hesitate\\s+to\\s+reach\\s+out\\b",
    "Generic AI closing-offer; not how real hosts close messages.",
  ),
  vap(
    "ai_hope_message_finds_well",
    "§5.6 AI-recognizable patterns",
    "\\bI\\s+hope\\s+this\\s+message\\s+finds\\s+you\\s+well\\b",
    "The canonical over-formal opener; AI default.",
  ),
  vap(
    "ai_trust_message_good_health",
    "§5.6 AI-recognizable patterns",
    "\\bI\\s+trust\\s+this\\s+message\\s+reaches\\s+you\\s+in\\s+good\\s+health\\b",
    "Over-formal opener variant.",
  ),
  vap(
    "ai_committed_to_providing",
    "§5.6 AI-recognizable patterns",
    "\\bwe\\s+are\\s+committed\\s+to\\s+providing\\b",
    "Mission-statement filler.",
  ),
  vap(
    "ai_satisfaction_top_priority",
    "§5.6 AI-recognizable patterns",
    "\\byour\\s+satisfaction\\s+is\\s+our\\s+top\\s+priority\\b",
    "Customer-service script line.",
  ),
  vap(
    "ai_anything_else_we_can_do",
    "§5.6 AI-recognizable patterns",
    "\\bif\\s+there(?:'|’)?s\\s+anything\\s+else\\s+we\\s+can\\s+do\\b",
    "Generic closing offer.",
  ),
  vap(
    "ai_pleasure_to_host_you",
    "§5.6 AI-recognizable patterns",
    "\\bit\\s+is\\s+our\\s+pleasure\\s+to\\s+host\\s+you\\b",
    "Hospitality-script filler.",
  ),
  vap(
    "ai_we_pride_ourselves",
    "§5.6 AI-recognizable patterns",
    "\\bwe\\s+pride\\s+ourselves\\s+on\\b",
    "Marketing-deck construction.",
  ),

  // -------------------------------------------------------------------
  // §5.6 AI-recognizable — specific patterns (2 literal-enumerable)
  // -------------------------------------------------------------------
  vap(
    "ai_rest_assured",
    "§5.6 AI-recognizable patterns — specific",
    "\\brest\\s+assured\\b",
    "Real hosts don't say 'rest assured.' AI-flavored reassurance.",
  ),
  vap(
    "ai_your_host_third_person",
    "§5.6 AI-recognizable patterns — specific",
    "\\byour\\s+host\\s+has\\s+(?:prepared|arranged|set\\s+up|made)\\b",
    "Third-person self-reference banned; first person only in host-to-guest.",
  ),
];

// =====================================================================
// PHASE_F_DEFER_TO_M10 — doctrine sections out of scope for shape regex.
// Catalog is honest about what it cannot enforce so test passes don't
// imply clean voice (per /ultraplan Q-F3 phasing).
// =====================================================================

export const PHASE_F_DEFER_TO_M10: ReadonlyArray<DeferredAntiPatternStub> = [
  {
    id: "deferred_5_5_emoji_policy",
    doctrine_section: "§5.5 Chipper / lifestyle-brand — emoji policy",
    rationale_for_deferral:
      "Doctrine policy is contextual (mode-dependent: Koast-to-host=zero, host-to-guest Mode 1=learned, Mode 2=minimal). Emoji codepoints can be regex-matched but the enforcement surface is OUTPUT text per-mode, not prompt-bearing files. Belongs at output-filter layer.",
    planned_layer: "output-filter",
  },
  {
    id: "deferred_5_5_exclamation_cap",
    doctrine_section: "§5.5 Chipper / lifestyle-brand — exclamation policy",
    rationale_for_deferral:
      "Per-response count cap (Koast-to-host: max one exclamation, only for genuine milestone moments). Count + semantic-context judgment, not phrase-shape regex.",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_5_6_ensure_verb_chain",
    doctrine_section: "§5.6 AI-recognizable — 'ensure' verb chain",
    rationale_for_deferral:
      "Doctrine names 'ensure with abstract objects' as a heuristic, not a literal phrase. Shape regex would false-positive legitimate uses of 'ensure' with concrete objects. Judge layer can read the object's concreteness.",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_5_7_filler",
    doctrine_section: "§5.7 Filler",
    rationale_for_deferral:
      "'Really', 'very', 'just' are sometimes appropriate. Context-dependent enforcement.",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_5_8_self_narration",
    doctrine_section: "§5.8 Self-narration",
    rationale_for_deferral:
      "'I'll help you with...' is banned theater when content follows generically but legitimate when content follows specifically. Judge must read what comes after.",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_5_9_performative_thoroughness",
    doctrine_section: "§5.9 Performative thoroughness",
    rationale_for_deferral:
      "Length + structure analysis (multi-paragraph response when one sentence would do). Not phrase-shape.",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_voice_doctrine_self_scan",
    doctrine_section: "voice-doctrine.md self-scan",
    rationale_for_deferral:
      "Doctrine file contains every banned phrase as quotation; v1 runner excludes voice-doctrine.md from the prompt-bearing scan. Judge can distinguish quote-from-instance (per R3 from STEP 5+ kickoff).",
    planned_layer: "llm-judge",
  },
  {
    id: "deferred_constitution_prompt_quote_vs_instance",
    doctrine_section: "Constitution prompts (build-voice-prompt.ts, agent/system-prompt.ts)",
    rationale_for_deferral:
      "Constitution prompts cite banned phrases by name as negative-example pedagogy (legitimate technique for training LLM avoidance). v1 catalog cannot distinguish pedagogical quotation from inline violation — same architectural class as deferred_voice_doctrine_self_scan. The runner's CONSTITUTION_PROMPTS list documents the deferred surface; M10 LLM judge gates this class. D24 v1 scope is structural (call-site prompts) per v2.6 §3 + §7.8.",
    planned_layer: "llm-judge",
  },
];

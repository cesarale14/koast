"use client";

/**
 * MemoryVoiceSection — M10 Phase D STEP 9 (S4).
 *
 * Dedicated render surface for host voice memory. Placed ABOVE entity-type
 * groups in MemoryTab (§S4-a) — voice is host-foundational and semantically
 * distinct from per-property facts.
 *
 * Data source: VoiceFactPayload from memory_facts (entity_type='host' +
 * sub_entity_type='voice' + attribute='voice_mode'); fetched at the memory
 * page route via readVoiceMode (separate-fetch per ultraplan §13.2 (b)
 * resolution — listMemoryFacts returns voice rows but humanizes display_value,
 * so the raw VoiceFactPayload needs a parallel fetch).
 *
 * Read/display only. Voice-fact WRITE is the Phase E extraction worker.
 *
 * Empty state (§S4-b): when voicePayload is null OR mode='neutral' with
 * sample_count=0, show neutral-baseline placeholder copy.
 *
 * frontend-design: matches DESIGN_SYSTEM.md tokens (deep-sea / coastal /
 * tideline / golden / hairline / shore). KoastChip for greeting/closing/vocab
 * patterns. Quoted blocks for seed_samples.
 */

import type { VoiceFactPayload } from "@/lib/memory/voice-fact-schema";
import { KoastChip } from "@/components/polish/KoastChip";

type Props = {
  voicePayload: VoiceFactPayload | null;
};

export function MemoryVoiceSection({ voicePayload }: Props) {
  const isEmpty =
    voicePayload === null ||
    (voicePayload.mode === "neutral" && voicePayload.features.sample_count === 0);

  return (
    <section
      aria-label="Voice memory"
      className="rounded-[12px] border bg-white"
      style={{ borderColor: "var(--hairline)" }}
    >
      <header
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <div>
          <div
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "var(--golden)" }}
          >
            Voice memory
          </div>
          <p
            className="text-[12px] mt-1"
            style={{ color: "var(--tideline)" }}
          >
            How Koast learns your voice for drafted guest messages.
          </p>
        </div>
        <ModeBadge mode={voicePayload?.mode ?? "neutral"} />
      </header>

      {isEmpty ? (
        <EmptyVoiceState />
      ) : (
        <LearnedVoiceContent payload={voicePayload!} />
      )}
    </section>
  );
}

function ModeBadge({ mode }: { mode: "neutral" | "learned" }) {
  if (mode === "learned") {
    return (
      <KoastChip variant="koast" aria-label="Voice mode: learned">
        Learned
      </KoastChip>
    );
  }
  return (
    <KoastChip variant="neutral" aria-label="Voice mode: neutral baseline">
      Neutral baseline
    </KoastChip>
  );
}

function EmptyVoiceState() {
  return (
    <div className="px-5 py-6">
      <p
        className="text-[13px] leading-[1.6] max-w-prose"
        style={{ color: "var(--coastal)" }}
      >
        Neutral baseline — Koast hasn&apos;t observed enough of your writing
        to learn your voice yet. As you approve guest message drafts, Koast
        notes your cadence, greeting style, and sign-offs so drafted messages
        stay recognizably yours at scale.
      </p>
    </div>
  );
}

function LearnedVoiceContent({ payload }: { payload: VoiceFactPayload }) {
  const { features, seed_samples } = payload;
  return (
    <div className="px-5 py-4 space-y-4">
      <CadenceRow features={features} />
      {features.greeting_patterns.length > 0 && (
        <ChipRow
          label="Greeting patterns"
          values={features.greeting_patterns.slice(0, 3)}
        />
      )}
      {features.closing_patterns.length > 0 && (
        <ChipRow
          label="Sign-off patterns"
          values={features.closing_patterns.slice(0, 3)}
        />
      )}
      {features.vocabulary_signature.length > 0 && (
        <ChipRow
          label="Distinctive vocabulary"
          values={features.vocabulary_signature.slice(0, 6)}
        />
      )}
      {seed_samples && seed_samples.length > 0 && (
        <SamplesBlock samples={seed_samples} />
      )}
    </div>
  );
}

function CadenceRow({
  features,
}: {
  features: VoiceFactPayload["features"];
}) {
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.04em] mb-1.5"
        style={{ color: "var(--tideline)" }}
      >
        Cadence
      </div>
      <p className="text-[13px]" style={{ color: "var(--coastal)" }}>
        Average sentence length{" "}
        <span className="font-semibold">
          {Math.round(features.sentence_length_avg)} chars
        </span>
        {features.sentence_length_stdev > 0 && (
          <>
            {" "}(stdev {Math.round(features.sentence_length_stdev)})
          </>
        )}
        ; observed from{" "}
        <span className="font-semibold">{features.sample_count}</span> sample
        {features.sample_count === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.04em] mb-1.5"
        style={{ color: "var(--tideline)" }}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <KoastChip key={`${label}-${i}`} variant="neutral">
            {v}
          </KoastChip>
        ))}
      </div>
    </div>
  );
}

function SamplesBlock({ samples }: { samples: string[] }) {
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.04em] mb-1.5"
        style={{ color: "var(--tideline)" }}
      >
        Sample messages
      </div>
      <ul className="space-y-2">
        {samples.slice(0, 5).map((s, i) => (
          <li
            key={i}
            className="px-3 py-2 text-[12px] leading-[1.5]"
            style={{
              background: "var(--shore)",
              borderRadius: 8,
              color: "var(--coastal)",
            }}
          >
            “{s}”
          </li>
        ))}
      </ul>
    </div>
  );
}

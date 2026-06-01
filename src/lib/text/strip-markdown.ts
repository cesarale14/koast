/**
 * strip-markdown — conservative markdown → plain-prose stripper.
 *
 * The chat surface renders PLAIN TEXT, so any markdown the model emits shows up
 * as literal asterisks/hashes and (worse) re-enters conversation history, where
 * it primes the model to keep formatting — a prompt-only "no markdown" rule is
 * provably defeatable by that in-conversation precedent (the 823dafd2 leak).
 * This module is the deterministic guarantee: stored + streamed prose is clean
 * regardless of what the model does, so the priming loop can't form.
 *
 * It is NOT agenda-specific — the cockpit reuses it across every prose surface.
 *
 * Design rule: strip FORMATTING CONSTRUCTS only, never touch surrounding
 * content. Already-plain prose comes back byte-identical, and the function is
 * idempotent. Constructs handled: bold/italic via `*`/`**`, inline code spans,
 * ATX headers, unordered (`-`/`*`/`+`) and ordered (`1.`/`1)`) list markers.
 *
 * Deliberately NOT handled (conservatism over completeness):
 *   - Underscore emphasis (`_x_` / `__x__`): intraword `_` in snake_case and
 *     filenames is a real content-mangling risk the model's asterisk/hash/dash
 *     habit doesn't justify. Add later if a real `_`-emphasis leak appears.
 *   - A literal lone `*` / backtick in prose (e.g. "3 * 4") is left untouched.
 */

/** Strip markdown formatting from a complete string. Pure + idempotent. */
export function stripMarkdown(input: string): string {
  let s = input;
  // Inline code: `code` → code (single-backtick spans, no newline inside).
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // Bold: **text** → text. Non-greedy, no `*` inside, no space just inside the
  // delimiters (so "** " / " **" stray pairs don't match).
  s = s.replace(/\*\*(?=\S)([^*]*?\S|\S)\*\*/g, "$1");
  // Italic: *text* → text (run AFTER bold). No space adjacent to the delimiters
  // ("3 * 4" stays); not intraword ("a*b*c" stays); no `*` inside.
  s = s.replace(/(?<![*\w])\*(?=\S)([^*\n]*?\S|\S)\*(?!\w)/g, "$1");
  // ATX headers at line start: up to 3 leading spaces, 1–6 `#`, then space.
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  // Unordered list markers at line start: -, *, or + then space.
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  // Ordered list markers at line start: digits then `.` or `)` then space.
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");
  return s;
}

/**
 * A stateful streaming stripper for the live token feed. `push(delta)` returns
 * the clean text to display NOW; `flush()` returns whatever was held back at
 * stream end. The concatenation of every push() + the final flush() equals
 * stripMarkdown(full raw), and nothing emitted is ever retracted.
 *
 * Mechanism: only emit a prefix that has SETTLED — cut at the last newline or
 * sentence-final punctuation, then back off while that prefix still carries an
 * unmatched inline delimiter (an open `*`/code span). stripMarkdown itself is
 * the oracle for "open": a delimiter that survives stripping is unmatched. So
 * marker-free prose streams immediately; an open bold/code span (or a literal
 * stray `*`) briefly holds until it's settled or the turn flushes.
 */
export function createMarkdownStripStream(): {
  push(delta: string): string;
  flush(): string;
} {
  let raw = "";
  let emitted = 0; // length of clean text already returned

  // An emphasis/code span is still open iff a `*` or backtick survives a strip.
  const hasOpenInline = (s: string): boolean => /[*`]/.test(stripMarkdown(s));

  // End-exclusive indices just past each newline / sentence-final punctuation.
  // A sentence end only SETTLES once the following whitespace actually arrives
  // — matching `$` (end-of-buffer) would treat "check-in?" as a boundary, then
  // the next char ("'") would invalidate it and collapse the cut, so the lookahead
  // requires real whitespace, never end-of-buffer. This keeps the cut monotonic.
  const safePrefixLen = (text: string): number => {
    const re = /\n|[.!?](?=[ \t\n])/g;
    const bounds: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) bounds.push(m.index + m[0].length);
    for (let i = bounds.length - 1; i >= 0; i--) {
      if (!hasOpenInline(text.slice(0, bounds[i]))) return bounds[i];
    }
    return 0;
  };

  return {
    push(delta: string): string {
      raw += delta;
      const clean = stripMarkdown(raw.slice(0, safePrefixLen(raw)));
      const out = clean.slice(emitted);
      emitted = clean.length;
      return out;
    },
    flush(): string {
      const clean = stripMarkdown(raw);
      const out = clean.slice(emitted);
      emitted = clean.length;
      return out;
    },
  };
}

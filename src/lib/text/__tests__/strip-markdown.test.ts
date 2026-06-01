import { stripMarkdown, createMarkdownStripStream } from "@/lib/text/strip-markdown";

describe("stripMarkdown — formatting removed, content untouched", () => {
  it("strips bold, italic, headers, lists, inline code", () => {
    expect(stripMarkdown("**bold**")).toBe("bold");
    expect(stripMarkdown("a *italic* word")).toBe("a italic word");
    expect(stripMarkdown("# Heading")).toBe("Heading");
    expect(stripMarkdown("### Deep heading")).toBe("Deep heading");
    expect(stripMarkdown("- item one")).toBe("item one");
    expect(stripMarkdown("* item two")).toBe("item two");
    expect(stripMarkdown("+ item three")).toBe("item three");
    expect(stripMarkdown("1. first")).toBe("first");
    expect(stripMarkdown("2) second")).toBe("second");
    expect(stripMarkdown("use `read_memory` now")).toBe("use read_memory now");
  });

  it("strips the actual prod leak shape (bold header + dash list + inline bold)", () => {
    const leak =
      "You've got a busy couple of days. Here's what to prioritize:\n\n" +
      "**Today (May 31):**\n" +
      "- **Three check-outs** at Villa Jamaica\n" +
      "- One check-out at Cozy Loft";
    expect(stripMarkdown(leak)).toBe(
      "You've got a busy couple of days. Here's what to prioritize:\n\n" +
        "Today (May 31):\n" +
        "Three check-outs at Villa Jamaica\n" +
        "One check-out at Cozy Loft",
    );
  });

  it("leaves already-plain prose BYTE-IDENTICAL", () => {
    const clean = [
      "Three checkouts at Villa Jamaica today including Jeremy, plus one at Cozy Loft.",
      "You're clear for the next couple days — nothing on the calendar.",
      "Looks like Erwin may be waiting on a reply about parking.",
      "Multi-line\nplain prose\nwith newlines but no markers.",
    ];
    for (const c of clean) expect(stripMarkdown(c)).toBe(c);
  });

  it("never mangles non-formatting punctuation (the conservatism cases)", () => {
    // Asterisks used as math / literals (space-adjacent or intraword) survive.
    expect(stripMarkdown("3 * 4 * 5 = 60")).toBe("3 * 4 * 5 = 60");
    expect(stripMarkdown("a*b*c stays")).toBe("a*b*c stays");
    // Underscores (snake_case, filenames, URLs) survive — emphasis not handled.
    expect(stripMarkdown("read snake_case_name and pricing_rules")).toBe(
      "read snake_case_name and pricing_rules",
    );
    expect(stripMarkdown("see https://x.com/a_b_c for more")).toBe(
      "see https://x.com/a_b_c for more",
    );
    // A hyphen mid-sentence / hyphenated word is not a list marker.
    expect(stripMarkdown("it's a well-known check-in flow")).toBe(
      "it's a well-known check-in flow",
    );
  });

  it("is idempotent", () => {
    const samples = [
      "**bold** and *italic* and `code`",
      "# H\n- a\n- b\n1. c",
      "3 * 4 plain",
      "already clean prose.",
    ];
    for (const s of samples) {
      const once = stripMarkdown(s);
      expect(stripMarkdown(once)).toBe(once);
    }
  });
});

describe("createMarkdownStripStream — stream === stripMarkdown(full), no retraction", () => {
  const SAMPLES = [
    "Plain prose with no markdown at all, just sentences. Two of them.",
    "You've got a busy couple of days. Here's what to prioritize:\n\n**Today (May 31):**\n- **Three check-outs** at Villa Jamaica\n- One at Cozy Loft.",
    "Erwin (May 30): 'what time is check-in?' and a *quick* note.",
    "Math like 3 * 4 in the middle, then **bold** after.",
    "# Heading line\nbody text here. More body.",
  ];

  // Feed the sample through the streaming stripper in arbitrary chunk sizes and
  // assert (a) the concatenated output equals stripMarkdown(full) and (b) the
  // running output is ALWAYS a prefix of stripMarkdown(full) — i.e. nothing is
  // ever emitted that later has to be retracted.
  function feed(sample: string, chunk: number): void {
    const full = stripMarkdown(sample);
    const s = createMarkdownStripStream();
    let acc = "";
    for (let i = 0; i < sample.length; i += chunk) {
      acc += s.push(sample.slice(i, i + chunk));
      expect(full.startsWith(acc)).toBe(true); // never over-emit
    }
    acc += s.flush();
    expect(acc).toBe(full); // complete + exact
  }

  it("char-by-char feed matches stripMarkdown(full)", () => {
    for (const sample of SAMPLES) feed(sample, 1);
  });

  it("chunked feeds (2,3,5,17) match stripMarkdown(full)", () => {
    for (const sample of SAMPLES) for (const c of [2, 3, 5, 17]) feed(sample, c);
  });

  it("whole-string-in-one-push still flushes clean", () => {
    for (const sample of SAMPLES) {
      const s = createMarkdownStripStream();
      const out = s.push(sample) + s.flush();
      expect(out).toBe(stripMarkdown(sample));
    }
  });
});

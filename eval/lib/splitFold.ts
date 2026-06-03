/**
 * splitFold — detects the checkout-split FOLD: the model attributing Harbor's
 * UPCOMING checkout to TODAY's count ("three at Harbor today" when it's 2 today
 * + 1 upcoming). This is a WRONG COUNT in the model's prose, distinct from the
 * rollup count gate (eval/lib/agenda-render.test.ts):
 *   - rollup count gate  = the count is computed right AT THE SOURCE (groupAgenda).
 *   - this fold detector = the model conveys the today/upcoming SPLIT right in
 *     PROSE (it doesn't fold the upcoming item into today).
 * The rollup is correct even when the model folds — the fold happens downstream.
 *
 * Conservative by calibration: the three↔Harbor proximity window only fires on
 * the fold arrangement. The CORRECT today-total ("three checkouts today — two at
 * Harbor, one at Dockside") puts "two at" between three and Harbor, past the
 * window, so it does NOT flag — nor do varied correct phrasings ("Jeremy plus one
 * more at Harbor today, plus one upcoming"). That's the point: catch the real
 * count error without re-introducing the brittle literal-token problem.
 */
const FOLD =
  /(?:three|3)\b[^.?!]{0,25}harbor[^.?!]{0,20}today|harbor[^.?!]{0,20}(?:three|3)\b[^.?!]{0,20}check|today[^.?!]{0,25}(?:three|3)\b[^.?!]{0,25}harbor/i;

/** True if the prose folds Harbor's upcoming checkout into today's count. */
export function detectsSplitFold(text: string): boolean {
  return FOLD.test(text);
}

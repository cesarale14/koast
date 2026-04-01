"use client";

import { useState, useEffect, useCallback } from "react";

interface WebhookLog {
  id: string;
  event_type: string;
  booking_id: string;
  guest_name: string | null;
  check_in: string | null;
  check_out: string | null;
  action_taken: string;
  ack_sent: boolean;
  ack_response: string | null;
  created_at: string;
}

interface TestResult {
  test: number;
  success: boolean;
  taskIds: string[];
  details: string;
  apiCalls: number;
  error?: string;
}

const TESTS = [
  { num: 1, name: "Full Sync (500 days)", desc: "Push realistic availability, rates, and restrictions for 500 days. Varied by season, day-of-week. 2 API calls." },
  { num: 2, name: "Single Date Rate", desc: "Twin BAR Nov 22 = $333. 1 API call." },
  { num: 3, name: "Single Date, Multiple Rates", desc: "Twin BAR Nov 21=$333, Double BAR Nov 25=$444, Double B&B Nov 29=$456.23. 1 API call." },
  { num: 4, name: "Multiple Date Range Rates", desc: "Twin BAR Nov 1-10=$241, Double BAR Nov 10-16=$312.66, Double B&B Nov 1-20=$111. 1 API call." },
  { num: 5, name: "Min Stay Update", desc: "Twin BAR Nov 23: min_stay=3, Double BAR Nov 25: min_stay=2, Double B&B Nov 15: min_stay=5. 1 API call." },
  { num: 6, name: "Stop Sell", desc: "Twin BAR Nov 14, Double BAR Nov 16, Double B&B Nov 20: stop_sell=true. 1 API call." },
  { num: 7, name: "Multiple Restrictions", desc: "CTA, CTD, max_stay, min_stay combos across room types and rate plans. 1 API call." },
  { num: 8, name: "Half-Year Update", desc: "Twin BAR Dec-May: $432 min_stay=2, Double BAR Dec-May: $342 min_stay=3. 1 API call." },
  { num: 9, name: "Single Date Availability", desc: "Twin Nov 21: avail=7, Double Nov 25: avail=0 (simulated booking). 1 API call." },
  { num: 10, name: "Multiple Date Availability", desc: "Twin Nov 10-16: avail=3, Double Nov 17-24: avail=4. 1 API call." },
  { num: 11, name: "Booking Receiving", desc: "MANUAL: Create/modify/cancel booking in Channex CRS. Take screenshots in StayCommand." },
  { num: 12, name: "Rate Limits", desc: "CONFIRM: Sequential requests, no parallel flooding, rate limit headers respected." },
  { num: 13, name: "Update Logic", desc: "CONFIRM: Push changes only, no scheduled full syncs." },
  { num: 14, name: "Extra Notes", desc: "min_stay_arrival (not through), stop_sell, CTA, CTD supported. No CC needed. Not PCI certified." },
];

export default function CertificationPage() {
  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const runTest = async (testNum: number) => {
    setRunning(testNum);
    try {
      const res = await fetch("/api/channex/certification-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: testNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResults((prev) => ({ ...prev, [testNum]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [testNum]: {
          test: testNum,
          success: false,
          taskIds: [],
          details: "",
          apiCalls: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
    setRunning(null);
  };

  const runAll = async () => {
    setRunningAll(true);
    // Run tests 1-10, then re-run Test 1 to restore realistic data
    for (let i = 1; i <= 10; i++) {
      await runTest(i);
    }
    // Final reset: re-run Test 1 to overwrite flat test values with realistic data
    setRunning(-1); // -1 = reset indicator
    try {
      const res = await fetch("/api/channex/certification-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setResults((prev) => ({
        ...prev,
        [-1]: { ...data, test: -1, details: "Reset: " + data.details },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [-1]: {
          test: -1, success: false, taskIds: [], apiCalls: 0,
          details: "", error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
    setRunning(null);
    setRunningAll(false);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const allTaskIds = Object.values(results)
    .flatMap((r) => r.taskIds)
    .filter(Boolean);

  return (
    <div className="max-w-[900px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Channex PMS Certification</h1>
          <p className="text-sm text-neutral-500">14 test cases for Google Form submission</p>
        </div>
        <div className="flex gap-3">
          {allTaskIds.length > 0 && (
            <button
              onClick={() => copyText(allTaskIds.join("\n"))}
              className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              {copied === allTaskIds.join("\n") ? "Copied!" : `Copy All Task IDs (${allTaskIds.length})`}
            </button>
          )}
          <button
            onClick={runAll}
            disabled={runningAll || running !== null}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {runningAll ? "Running..." : "Run All (1-10 + Reset)"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {TESTS.map((t) => {
          const result = results[t.num];
          const isRunning = running === t.num;
          const isManual = t.num >= 11;
          const passed = result?.success && !result?.error;
          const failed = result && !result.success;

          return (
            <div
              key={t.num}
              className={`bg-neutral-0 rounded-xl border p-4 transition-colors ${
                passed ? "border-emerald-200 bg-emerald-50/30" : failed ? "border-red-200 bg-red-50/30" : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {isRunning ? (
                    <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                  ) : passed ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : failed ? (
                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center">
                      <span className="text-xs font-bold text-neutral-500">{t.num}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-800">
                      Test {t.num}: {t.name}
                    </h3>
                    {isManual && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                        MANUAL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{t.desc}</p>

                  {/* Result */}
                  {result && (
                    <div className="mt-2">
                      {result.error && (
                        <p className="text-xs text-red-600 font-medium">{result.error}</p>
                      )}
                      {result.details && (
                        <p className="text-xs text-neutral-600 mt-1">{result.details}</p>
                      )}
                      {result.taskIds.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {result.taskIds.map((tid, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <code className="text-[11px] font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
                                {tid}
                              </code>
                              <button
                                onClick={() => copyText(tid)}
                                className="text-[10px] text-brand-500 hover:text-brand-600 font-medium"
                              >
                                {copied === tid ? "Copied!" : "Copy"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {result.apiCalls > 0 && (
                        <p className="text-[10px] text-neutral-400 mt-1">
                          {result.apiCalls} API call{result.apiCalls !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Run button */}
                {!isManual && (
                  <button
                    onClick={() => runTest(t.num)}
                    disabled={isRunning || runningAll}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 disabled:opacity-50 transition-colors"
                  >
                    {isRunning ? "Running..." : passed ? "Re-run" : "Run"}
                  </button>
                )}
                {isManual && !result && (
                  <button
                    onClick={() => runTest(t.num)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-neutral-500 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                  >
                    Show Info
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset card (shows after Run All) */}
      {results[-1] && (() => {
        const r = results[-1];
        const isResetting = running === -1;
        const passed = r.success && !r.error;
        return (
          <div className={`mt-3 bg-neutral-0 rounded-xl border p-4 ${passed ? "border-emerald-200 bg-emerald-50/30" : "border-[var(--border)]"}`}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {isResetting ? (
                  <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                ) : passed ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">R</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-neutral-800">Test 1 (Reset) — Restoring realistic data</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Re-runs full sync to overwrite flat test values from Tests 2-10 with realistic seasonal rates and real booking availability.</p>
                {r.details && <p className="text-xs text-neutral-600 mt-1">{r.details}</p>}
                {r.taskIds.length > 0 && (
                  <div className="mt-1">
                    {r.taskIds.map((tid: string, i: number) => (
                      <code key={i} className="text-[11px] font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-700 mr-2">{tid}</code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Test 11: Webhook Log Viewer */}
      <WebhookLogViewer />

      {/* Summary */}
      {allTaskIds.length > 0 && (
        <div className="mt-6 bg-neutral-0 rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-bold text-neutral-800 mb-2">All Task IDs for Google Form</h2>
          <div className="bg-neutral-50 rounded-lg p-3 font-mono text-xs text-neutral-700 space-y-0.5">
            {Object.entries(results)
              .filter(([, r]) => r.taskIds.length > 0)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([testNum, r]) => (
                <div key={testNum}>
                  <span className="text-neutral-400">Test {testNum}:</span> {r.taskIds.join(", ")}
                </div>
              ))}
          </div>
          <button
            onClick={() =>
              copyText(
                Object.entries(results)
                  .filter(([, r]) => r.taskIds.length > 0)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([testNum, r]) => `Test ${testNum}: ${r.taskIds.join(", ")}`)
                  .join("\n")
              )
            }
            className="mt-3 px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
          >
            {copied && copied.includes("Test") ? "Copied!" : "Copy Summary"}
          </button>
        </div>
      )}
    </div>
  );
}

// ====== Webhook Log Viewer (Test 11) ======

function WebhookLogViewer() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channex/webhook-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const actionIcon = (action: string) => {
    switch (action) {
      case "created": return { emoji: "📥", color: "text-blue-600 bg-blue-50" };
      case "modified": return { emoji: "✏️", color: "text-amber-600 bg-amber-50" };
      case "cancelled": return { emoji: "❌", color: "text-red-600 bg-red-50" };
      default: return { emoji: "❓", color: "text-neutral-600 bg-neutral-50" };
    }
  };

  const hasAll3 = logs.some((l) => l.action_taken === "created")
    && logs.some((l) => l.action_taken === "modified")
    && logs.some((l) => l.action_taken === "cancelled");

  return (
    <div className="mt-6 bg-neutral-0 rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-neutral-800">
            Test 11: Booking Webhook Events
          </h2>
          {hasAll3 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
              ALL 3 RECEIVED
            </span>
          )}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="text-xs text-brand-500 hover:text-brand-600 font-medium disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="text-xs text-neutral-500 mb-4">
        Create a booking in Channex Booking CRS app, then modify it, then cancel it. All 3 events should appear below.
        Auto-refreshing every 5 seconds.
      </p>

      {logs.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-neutral-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-neutral-400">Waiting for webhook events...</p>
          <p className="text-xs text-neutral-300 mt-1">
            Webhook URL: staycommand.vercel.app/api/webhooks/channex
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const { emoji, color } = actionIcon(log.action_taken);
            const timeStr = new Date(log.created_at).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
            });
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50">
                <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm ${color}`}>
                  {emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-800 capitalize">{log.action_taken}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">{log.event_type}</span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {log.guest_name || "Unknown guest"}
                    {log.check_in && log.check_out && ` \u2022 ${log.check_in} \u2192 ${log.check_out}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-neutral-400">{timeStr}</span>
                    <span className={`text-[10px] font-medium ${log.ack_sent ? "text-emerald-600" : "text-red-500"}`}>
                      {log.ack_sent ? "ACK sent" : "ACK pending"}
                    </span>
                    <code className="text-[10px] text-neutral-400 font-mono">{log.booking_id?.substring(0, 8)}...</code>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

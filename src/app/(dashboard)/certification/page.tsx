"use client";

import { useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestResult = any;

export default function CertificationPage() {
  const [running, setRunning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [config, setConfig] = useState<any>(null);

  const runTests = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/channex/certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setRunning(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Channex PMS Certification</h1>
      <p className="text-gray-500 mb-6">Run all 14 certification tests</p>

      {/* Config display */}
      {config && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-xs font-mono">
          <p className="text-gray-400 mb-1">Test Property Config (reuse for re-runs):</p>
          <pre className="text-gray-700 overflow-x-auto">{JSON.stringify(config, null, 2)}</pre>
        </div>
      )}

      <button
        onClick={runTests}
        disabled={running}
        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-6"
      >
        {running ? "Running Tests..." : config ? "Re-Run Tests" : "Setup & Run All Tests"}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {results && (
        <div>
          {/* Summary */}
          <div className="flex gap-4 mb-6">
            <div className="bg-emerald-50 rounded-xl p-4 flex-1 text-center">
              <p className="text-3xl font-bold text-emerald-600">{results.summary.passed}</p>
              <p className="text-xs text-emerald-500">Passed</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 flex-1 text-center">
              <p className="text-3xl font-bold text-red-600">{results.summary.failed}</p>
              <p className="text-xs text-red-500">Failed</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 flex-1 text-center">
              <p className="text-3xl font-bold text-gray-600">{results.summary.total}</p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            {results.results.map((r: TestResult) => (
              <div
                key={r.test}
                className={`bg-white rounded-xl border p-4 ${
                  r.status === "pass" ? "border-emerald-200" :
                  r.status === "fail" ? "border-red-200" :
                  "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      r.status === "pass" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "fail" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {r.test}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                      {typeof r.details === "string" && (
                        <p className="text-xs text-gray-500 mt-0.5">{r.details}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    r.status === "pass" ? "bg-emerald-50 text-emerald-700" :
                    r.status === "fail" ? "bg-red-50 text-red-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {r.status.toUpperCase()}
                  </span>
                </div>

                {r.error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600 font-mono">
                    {r.error}
                  </div>
                )}

                {r.taskIds && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 cursor-pointer">Task IDs / Response</summary>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] text-gray-600 overflow-x-auto">
                      {JSON.stringify(r.taskIds, null, 2)}
                    </pre>
                  </details>
                )}

                {typeof r.details === "object" && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 cursor-pointer">Details</summary>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] text-gray-600 overflow-x-auto">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

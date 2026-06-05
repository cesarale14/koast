"use client";

/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — "Enable job alerts" flow on the cleaner portal.
 *
 * Proves the iOS chain: installed PWA → push permission → subscription →
 * received push that opens the job page. Surfaces the two iOS failure states
 * (not standalone → "Add to Home Screen"; in-app webview → "Open in Safari")
 * because exposing those is part of the proof. Instruments every step on-screen.
 *
 * NOT production. No real subscription model is persisted. Delete with branch.
 * ==========================================================================*/

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface Env {
  isIOS: boolean;
  isStandalone: boolean;
  inApp: boolean;
  pushSupported: boolean;
  ua: string;
}

function detectEnv(): Env {
  const ua = navigator.userAgent || "";
  const nav = navigator as Navigator & { standalone?: boolean; maxTouchPoints?: number };
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true;
  // Best-effort in-app-webview detection. Imperfect by nature (that's a finding).
  const knownInApp = /(FBAN|FBAV|Instagram|Line|MicroMessenger|Twitter|WhatsApp|Snapchat|TikTok|GSA)/i.test(ua);
  const looksLikeIosWebview =
    isIOS && !isStandalone && !/Version\/[\d.]+ Mobile\/\w+ Safari/i.test(ua);
  const inApp = knownInApp || looksLikeIosWebview;
  const pushSupported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { isIOS, isStandalone, inApp, pushSupported, ua };
}

type Guide = null | "add-to-home-screen" | "open-in-safari" | "denied" | "unsupported";

export default function EnableAlerts({ taskId, token }: { taskId: string; token: string }) {
  const [env, setEnv] = useState<Env | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<Guide>(null);
  const [done, setDone] = useState(false);
  const [subJson, setSubJson] = useState<string>("");
  const [origin, setOrigin] = useState<string>("");
  const [openedFromPush, setOpenedFromPush] = useState(false);

  const add = (m: string) => setLog((l) => [...l, m]);

  // Inject manifest + apple meta into <head> so "Add to Home Screen" yields a
  // standalone PWA whose start_url is THIS job. iOS reads these at install time.
  useEffect(() => {
    setEnv(detectEnv());
    setOrigin(window.location.origin);
    if (new URLSearchParams(window.location.search).get("from") === "push") {
      setOpenedFromPush(true);
    }
    const jobUrl = `/clean/${taskId}/${token}`;
    const nodes: HTMLElement[] = [];
    const link = (rel: string, href: string) => {
      const el = document.createElement("link");
      el.rel = rel;
      el.href = href;
      document.head.appendChild(el);
      nodes.push(el);
    };
    const meta = (name: string, content: string) => {
      const el = document.createElement("meta");
      el.name = name;
      el.content = content;
      document.head.appendChild(el);
      nodes.push(el);
    };
    link("manifest", `/api/spike/manifest?start=${encodeURIComponent(jobUrl)}`);
    link("apple-touch-icon", "/icons/spike/apple-touch-icon.png");
    meta("apple-mobile-web-app-capable", "yes");
    meta("mobile-web-app-capable", "yes");
    meta("apple-mobile-web-app-status-bar-style", "black-translucent");
    meta("apple-mobile-web-app-title", "Koast for Cleaners");
    meta("theme-color", "#17392a");
    return () => nodes.forEach((n) => n.remove());
  }, [taskId, token]);

  async function enable() {
    setGuide(null);
    setBusy(true);
    try {
      const e = detectEnv();
      setEnv(e);
      add(`env — iOS:${e.isIOS} standalone:${e.isStandalone} inApp:${e.inApp} pushAPI:${e.pushSupported}`);

      if (e.isIOS && !e.isStandalone) {
        // The two iOS bootstrap failure states — surfacing these IS the proof.
        if (e.inApp) {
          add("blocked: opened inside an in-app browser (can't install a PWA here)");
          setGuide("open-in-safari");
        } else {
          add("blocked: not running as an installed app yet");
          setGuide("add-to-home-screen");
        }
        return;
      }

      if (!e.pushSupported) {
        add("blocked: this browser has no Push API");
        setGuide("unsupported");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      add("✓ service worker registered (scope /)");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      add(`permission: ${perm}`);
      if (perm !== "granted") {
        setGuide("denied");
        return;
      }

      const { publicKey } = await fetch("/api/spike/vapid").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      add("✓ push subscription created");

      const jobUrl = `/clean/${taskId}/${token}?from=push`;
      const res = await fetch("/api/spike/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), url: jobUrl }),
      });
      const data = await res.json();
      add(`✓ subscription sent to server — confirmation push: ${data.confirmation}`);
      setSubJson(JSON.stringify(sub.toJSON()));
      setDone(true);
    } catch (err) {
      add("error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  const jobPath = `/clean/${taskId}/${token}?from=push`;
  const testCmd =
    `curl -X POST "${origin}/api/spike/test-push?secret=koast-spike-push-2026" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify({ subscription: subJson ? JSON.parse(subJson) : {}, url: jobPath })}'`;

  return (
    <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
        SPIKE · push-alerts proof (throwaway)
      </p>

      {openedFromPush && (
        <p className="mt-2 rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
          ✅ This page was opened from a push notification.
        </p>
      )}

      {env && (
        <p className="mt-2 text-xs text-amber-800">
          iOS:{String(env.isIOS)} · installed:{String(env.isStandalone)} · in-app-browser:{String(env.inApp)} · push-API:{String(env.pushSupported)}
        </p>
      )}

      {!done && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-coastal py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Enable job alerts"}
        </button>
      )}

      {guide === "add-to-home-screen" && (
        <div className="mt-3 rounded bg-white p-3 text-amber-900">
          <p className="font-semibold">Add Koast to your Home Screen first</p>
          <ol className="mt-1 list-decimal pl-5 text-xs">
            <li>Tap the Share button (the square with an up-arrow) at the bottom of Safari.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open the new <b>Koast for Cleaners</b> icon, then tap <b>Enable job alerts</b> again.</li>
          </ol>
        </div>
      )}

      {guide === "open-in-safari" && (
        <div className="mt-3 rounded bg-white p-3 text-amber-900">
          <p className="font-semibold">Open this link in Safari</p>
          <p className="mt-1 text-xs">
            You&apos;re viewing this inside another app&apos;s browser, which can&apos;t install
            Koast. Tap the <b>•••</b> (or share) menu and choose <b>Open in Safari</b>
            (or Default Browser), then follow the Add-to-Home-Screen steps.
          </p>
        </div>
      )}

      {guide === "denied" && (
        <p className="mt-3 rounded bg-white p-3 text-xs text-red-700">
          Notifications were blocked. Enable them in Settings → Notifications → Koast for Cleaners, then try again.
        </p>
      )}

      {guide === "unsupported" && (
        <p className="mt-3 rounded bg-white p-3 text-xs text-red-700">
          This browser doesn&apos;t support web push.
        </p>
      )}

      {done && (
        <div className="mt-3 space-y-2">
          <p className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
            ✅ Alerts on. You should have just received a confirmation notification.
          </p>
          <p className="text-xs text-amber-800">
            Closed-app test: close this app, then run the command below from a laptop to fire a push:
          </p>
          <textarea
            readOnly
            value={testCmd}
            onFocusCapture={(ev) => ev.currentTarget.select()}
            className="h-32 w-full rounded border border-amber-300 bg-white p-2 font-mono text-[10px]"
          />
        </div>
      )}

      {log.length > 0 && (
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-deep-sea/90 p-2 text-[10px] leading-relaxed text-shore">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}

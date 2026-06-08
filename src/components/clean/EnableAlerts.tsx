"use client";

/**
 * EnableAlerts — "Enable job alerts" flow on the cleaner portal (TURN-S2-send).
 *
 * Productionized from the cleaner-PWA spike. Drives the iOS chain:
 * installed PWA → notification permission → push subscription persisted to
 * cleaner_push_subscriptions (bound to the cleaner via the task token). Surfaces
 * the two iOS bootstrap states (not installed → Add to Home Screen; in-app
 * webview → Open in Safari) since push only works from an installed PWA on iOS.
 *
 * Requires vapidPublicKey (browser applicationServerKey); when push isn't
 * configured (env unset → null) it renders an "unavailable" note instead.
 */

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
}

function detectEnv(): Env {
  const ua = navigator.userAgent || "";
  const nav = navigator as Navigator & { standalone?: boolean; maxTouchPoints?: number; platform?: string };
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const knownInApp = /(FBAN|FBAV|Instagram|Line|MicroMessenger|Twitter|WhatsApp|Snapchat|TikTok|GSA)/i.test(ua);
  const looksLikeIosWebview =
    isIOS && !isStandalone && !/Version\/[\d.]+ Mobile\/\w+ Safari/i.test(ua);
  const inApp = knownInApp || looksLikeIosWebview;
  const pushSupported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { isIOS, isStandalone, inApp, pushSupported };
}

type Guide = null | "add-to-home-screen" | "open-in-safari" | "denied" | "unsupported" | "error";

export default function EnableAlerts({
  taskId,
  token,
  vapidPublicKey,
}: {
  taskId: string;
  token: string;
  vapidPublicKey: string | null;
}) {
  const [env, setEnv] = useState<Env | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<Guide>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setEnv(detectEnv());
  }, []);

  async function enable() {
    setGuide(null);
    setErrMsg("");
    setBusy(true);
    try {
      const e = detectEnv();
      setEnv(e);

      if (e.isIOS && !e.isStandalone) {
        setGuide(e.inApp ? "open-in-safari" : "add-to-home-screen");
        return;
      }
      if (!e.pushSupported || !vapidPublicKey) {
        setGuide("unsupported");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setGuide("denied");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const res = await fetch(`/api/clean/${taskId}/${token}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      setDone(true);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
      setGuide("error");
    } finally {
      setBusy(false);
    }
  }

  // Push not configured for this deployment — render nothing actionable.
  if (env && !vapidPublicKey) {
    return null;
  }

  if (done) {
    return (
      <div className="bg-success-light border border-lagoon/30 rounded-lg p-3 text-center">
        <p className="text-sm font-medium text-lagoon">Alerts on — you&apos;ll get a notification for your next job.</p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-0 rounded-lg p-4 shadow-sm border border-[var(--border)]">
      <p className="text-sm font-semibold text-neutral-900">Get notified about new jobs</p>
      <p className="text-xs text-neutral-500 mt-0.5">
        Turn on alerts so Koast can notify you the moment a cleaning is assigned to you.
      </p>

      <button
        onClick={enable}
        disabled={busy}
        className="mt-3 w-full py-3 bg-coastal text-white text-sm font-semibold rounded-lg hover:bg-deep-sea disabled:opacity-50"
      >
        {busy ? "Working…" : "Enable job alerts"}
      </button>

      {guide === "add-to-home-screen" && (
        <div className="mt-3 rounded-lg bg-shore p-3 text-neutral-800">
          <p className="text-sm font-semibold">Add Koast to your Home Screen first</p>
          <ol className="mt-1 list-decimal pl-5 text-xs space-y-0.5">
            <li>Tap the Share button (square with an up-arrow) at the bottom of Safari.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open the new Koast icon, then tap <b>Enable job alerts</b> again.</li>
          </ol>
        </div>
      )}
      {guide === "open-in-safari" && (
        <p className="mt-3 rounded-lg bg-shore p-3 text-xs text-neutral-800">
          You&apos;re viewing this inside another app&apos;s browser, which can&apos;t enable alerts.
          Tap the menu and choose <b>Open in Safari</b>, then try again.
        </p>
      )}
      {guide === "denied" && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          Notifications were blocked. Enable them in Settings → Notifications → Koast, then try again.
        </p>
      )}
      {guide === "unsupported" && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          This browser doesn&apos;t support web push.
        </p>
      )}
      {guide === "error" && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 break-words">
          Couldn&apos;t enable alerts: {errMsg}
        </p>
      )}
    </div>
  );
}

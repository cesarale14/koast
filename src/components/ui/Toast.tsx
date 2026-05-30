"use client";

import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";

type ToastType = "success" | "error";

/** Reusable toast action affordance (e.g. "Undo"). General — not feature-
 * specific. Clicking runs onClick then dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Optional action button. */
  action?: ToastAction;
  /** Override the auto-dismiss window (ms). Default DEFAULT_DURATION_MS. */
  durationMs?: number;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const DEFAULT_DURATION_MS = 4000;

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "success", options?: ToastOptions) => {
      const id = ++nextIdRef.current;
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      setTimeout(() => dismiss(id), options?.durationMs ?? DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${
        toast.type === "success"
          ? "bg-success-light border-success text-success"
          : "bg-danger-light border-danger text-danger"
      }`}
    >
      {toast.type === "success" ? (
        <svg className="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className="text-sm font-medium">{toast.message}</span>
      {toast.action ? (
        <button
          data-testid="toast-action"
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="ml-1 text-sm font-semibold underline underline-offset-2 hover:opacity-80"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        aria-label="Dismiss"
        onClick={onDismiss}
        className="ml-2 text-neutral-400 hover:text-neutral-600"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

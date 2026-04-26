"use client";

import { Minus, Plus } from "lucide-react";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-[10px] font-bold tracking-[0.06em] uppercase mb-1.5"
        style={{ color: "var(--tideline)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full outline-none transition-all"
      style={{
        padding: "9px 12px",
        border: "1.5px solid var(--dry-sand)",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 500,
        color: "var(--coastal)",
        backgroundColor: "rgba(255,255,255,0.7)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--golden)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.12)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--dry-sand)";
        e.currentTarget.style.boxShadow = "";
      }}
    />
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          border: "1px solid var(--dry-sand)",
          backgroundColor: "#fff",
          color: "var(--coastal)",
        }}
      >
        <Minus size={14} />
      </button>
      <div
        className="flex-1 text-center text-[14px] font-bold tabular-nums"
        style={{ color: "var(--coastal)" }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          border: "1px solid var(--dry-sand)",
          backgroundColor: "#fff",
          color: "var(--coastal)",
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

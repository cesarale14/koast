"use client";

// Shared layout/helpers for the login + signup pages — Koast dark theme
// per DESIGN_SYSTEM.md Section 17.10.

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, var(--deep-sea) 0%, var(--abyss) 50%, var(--abyss) 100%)",
      }}
    >
      {/* Ambient glows */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-120px",
          right: "-120px",
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(196,154,90,0.06), transparent 70%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-100px",
          left: "-100px",
          width: 400,
          height: 400,
          background: "radial-gradient(circle, rgba(26,122,90,0.05), transparent 70%)",
        }}
      />

      <div className="w-full flex flex-col items-center relative z-[1]" style={{ maxWidth: 420 }}>
        <LogoRow />
        <div
          className="w-full"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function LogoRow() {
  return (
    <div className="flex flex-col items-center mb-9">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "linear-gradient(135deg, var(--golden), #a87d3a)",
            boxShadow: "0 4px 24px rgba(196,154,90,0.4)",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--deep-sea)",
              lineHeight: 1,
            }}
          >
            K
          </span>
        </div>
        <span
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: "var(--golden)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          Koast
        </span>
      </div>
      <div className="text-center" style={{ fontSize: 14, color: "rgba(168,191,174,0.6)" }}>
        Your hosting runs itself
      </div>
    </div>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h1>
      <p className="mt-1" style={{ fontSize: 13, color: "rgba(168,191,174,0.6)" }}>
        {subtitle}
      </p>
    </div>
  );
}

export function AuthInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label
        className="block mb-1.5"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(168,191,174,0.7)",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        className="w-full outline-none transition-all"
        style={{
          padding: "12px 14px",
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1.5px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 500,
          color: "#fff",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--golden)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,154,90,0.15)";
          e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          e.currentTarget.style.boxShadow = "";
          e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
        }}
      />
    </div>
  );
}

export function GoldenButton({
  children,
  type,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className="w-full transition-all disabled:cursor-not-allowed"
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: "linear-gradient(135deg, var(--golden), #a87d3a)",
        color: "var(--deep-sea)",
        fontSize: 14,
        fontWeight: 700,
        border: "none",
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(196,154,90,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {children}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(168,191,174,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        or continue with
      </div>
      <div className="flex-1" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
    </div>
  );
}

export function GoogleButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2.5 transition-colors disabled:cursor-not-allowed"
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(168,191,174,0.8)",
        fontSize: 14,
        fontWeight: 600,
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
        />
        <path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.6 16.2 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5C29 35.6 26.6 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.5 39.6 16.1 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.9l6 5c3.9-3.5 6.7-8.9 6.7-14.9 0-1.3-.1-2.6-.4-3.9z"
        />
      </svg>
      {children}
    </button>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[13px] font-medium"
      style={{
        backgroundColor: "rgba(196,64,64,0.12)",
        color: "#ff9f9f",
        border: "1px solid rgba(196,64,64,0.25)",
      }}
    >
      {message}
    </div>
  );
}

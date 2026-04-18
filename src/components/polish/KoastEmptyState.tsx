"use client";

import { type ReactNode } from "react";

interface KoastEmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function KoastEmptyState({ icon, title, body, action }: KoastEmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 12,
      }}
    >
      {icon && (
        <div
          style={{
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--tideline)",
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--coastal)",
          letterSpacing: "-0.01em",
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "var(--tideline)",
            lineHeight: 1.5,
            maxWidth: 320,
          }}
        >
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

export default KoastEmptyState;

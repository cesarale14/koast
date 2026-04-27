"use client";

/**
 * First error.tsx in the Koast app — sets the pattern.
 * Future per-route error boundaries should mirror this shape.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import KoastCard from "@/components/polish/KoastCard";
import KoastButton from "@/components/polish/KoastButton";

export default function PropertyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[PropertyDetail error.tsx]", error);
    }
  }, [error]);

  return (
    <div className="max-w-[1760px] mx-auto px-10 pt-16 pb-12">
      <KoastCard
        variant="elevated"
        style={{
          maxWidth: 480,
          margin: "0 auto",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: "40px 32px",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(212,150,11,0.12)",
            color: "var(--amber-tide)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AlertTriangle size={24} strokeWidth={2} />
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--coastal)",
            letterSpacing: "-0.01em",
          }}
        >
          Couldn&apos;t load this property
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--tideline)",
            lineHeight: 1.5,
            maxWidth: 320,
          }}
        >
          Something went wrong on our end. Try again, or head back to your properties.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Link href="/properties">
            <KoastButton variant="ghost" size="md">
              Back to properties
            </KoastButton>
          </Link>
          <KoastButton variant="primary" size="md" onClick={reset}>
            Try again
          </KoastButton>
        </div>

        {process.env.NODE_ENV === "development" && (
          <details
            style={{
              marginTop: 16,
              width: "100%",
              textAlign: "left",
              fontSize: 11,
              color: "var(--tideline)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Dev details
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 8,
                background: "var(--shore-soft)",
                border: "1px solid var(--hairline)",
                fontSize: 11,
                lineHeight: 1.4,
                color: "var(--coastal)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
      </KoastCard>
    </div>
  );
}

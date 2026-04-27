import Link from "next/link";
import { Home } from "lucide-react";
import KoastCard from "@/components/polish/KoastCard";
import KoastButton from "@/components/polish/KoastButton";

export default function PropertyDetailNotFound() {
  return (
    <div className="max-w-[1760px] mx-auto px-10 pt-16 pb-12">
      <KoastCard
        variant="quiet"
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
            background: "rgba(61,107,82,0.12)",
            color: "var(--tideline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Home size={24} strokeWidth={2} />
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--coastal)",
            letterSpacing: "-0.01em",
          }}
        >
          Property not found
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--tideline)",
            lineHeight: 1.5,
            maxWidth: 320,
          }}
        >
          This property doesn&apos;t exist or you don&apos;t have access to it.
        </div>
        <Link href="/properties" style={{ marginTop: 4 }}>
          <KoastButton variant="primary" size="md">
            Back to properties
          </KoastButton>
        </Link>
      </KoastCard>
    </div>
  );
}

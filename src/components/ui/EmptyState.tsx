import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgba(196,154,90,0.1)" }}
      >
        <Icon size={24} style={{ color: "var(--golden)" }} />
      </div>
      <h3 className="text-base font-bold mb-1" style={{ color: "var(--coastal)" }}>
        {title}
      </h3>
      <p
        className="text-[13px] text-center max-w-[320px] mb-5"
        style={{ color: "var(--tideline)" }}
      >
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="text-xs font-semibold transition-all duration-150"
          style={{
            backgroundColor: "var(--coastal)",
            color: "var(--shore)",
            borderRadius: 10,
            padding: "9px 20px",
          }}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

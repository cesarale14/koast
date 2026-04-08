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
    <div className="bg-neutral-0 rounded-xl p-16 text-center">
      <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Icon size={32} className="text-brand-500" strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-bold text-neutral-800 mb-2">{title}</h2>
      <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

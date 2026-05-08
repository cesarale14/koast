import type { ReactNode } from "react";
import { InspectTabBar } from "@/components/inspect/InspectTabBar";

export const metadata = {
  title: "Inspect · Koast",
};

export default function InspectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1760px] px-6 sm:px-10 pt-8 pb-24">
      <header className="mb-6">
        <h1 className="text-[24px] font-semibold text-[var(--coastal)] leading-tight">
          Inspect
        </h1>
        <p className="mt-1 text-[13px] text-[var(--tideline)]">
          What Koast knows and what it&rsquo;s done on your behalf.
        </p>
      </header>
      <InspectTabBar />
      <div className="mt-6">{children}</div>
    </div>
  );
}

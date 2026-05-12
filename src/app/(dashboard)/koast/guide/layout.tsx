import type { ReactNode } from "react";
import { GuideTabBar } from "@/components/guide/GuideTabBar";

export const metadata = {
  title: "Guide · Koast",
};

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1760px] px-6 sm:px-10 pt-8 pb-24">
      <header className="mb-6">
        <h1 className="text-[24px] font-semibold text-[var(--coastal)] leading-tight">
          Guide
        </h1>
        <p className="mt-1 text-[13px] text-[var(--tideline)]">
          What Koast does, how memory works, and the gradient of actions it takes on your behalf.
        </p>
      </header>
      <GuideTabBar />
      <div className="mt-6">{children}</div>
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free STR Revenue Check | StayCommand",
  description: "Find out how much more your short-term rental could earn with AI-powered pricing",
  openGraph: {
    title: "Free STR Revenue Check | StayCommand",
    description: "Find out how much more your short-term rental could earn with AI-powered pricing",
    type: "website",
  },
};

export default function RevenueCheckLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

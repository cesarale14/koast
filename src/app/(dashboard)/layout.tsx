"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import ReviewBadge from "@/components/ui/ReviewBadge";
import {
  LayoutGrid,
  Building2,
  CalendarDays,
  ClipboardList,
  DollarSign,
  BarChart3,
  Star,
  MessageSquare,
  RefreshCw,
  Bell,
  Settings,
  RefreshCcw,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

const navGroups: NavItem[][] = [
  [
    { name: "Overview", href: "/", icon: LayoutGrid },
    { name: "Properties", href: "/properties", icon: Building2 },
    { name: "Calendar", href: "/calendar", icon: CalendarDays },
    { name: "Bookings", href: "/bookings", icon: ClipboardList },
  ],
  [
    { name: "Pricing", href: "/pricing", icon: DollarSign },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Reviews", href: "/reviews", icon: Star, badge: true },
  ],
  [
    { name: "Messages", href: "/messages", icon: MessageSquare },
    { name: "Turnover", href: "/turnover", icon: RefreshCw },
  ],
];

/* ---- Desktop icon-only nav link with tooltip ---- */
function NavLinkCollapsed({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`
        group relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150
        ${isActive
          ? "bg-sidebar-active-bg text-sidebar-active-text"
          : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
        }
      `}
    >
      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-400" />}
      <Icon size={20} strokeWidth={1.5} />
      {item.badge && (
        <span className="absolute top-1 right-1"><ReviewBadge /></span>
      )}
      {/* Tooltip */}
      <span className="absolute left-full ml-3 px-2.5 py-1 rounded-md bg-neutral-800 text-white text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50">
        {item.name}
      </span>
    </Link>
  );
}

/* ---- Mobile/expanded nav link ---- */
function NavLinkExpanded({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        relative flex items-center gap-3 px-3 h-9 text-sm font-medium
        rounded-md transition-all duration-150
        ${isActive
          ? "bg-sidebar-active-bg text-sidebar-active-text"
          : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
        }
      `}
    >
      {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-brand-400" />}
      <Icon size={18} strokeWidth={1.5} />
      <span>{item.name}</span>
      {item.badge && <ReviewBadge />}
    </Link>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const allItems = navGroups.flat();
  const current = allItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );
  const sectionIdx = navGroups.findIndex((group) =>
    group.some((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    )
  );
  const sectionNames = ["Main", "Revenue", "Operations"];
  const section = sectionNames[sectionIdx] ?? "Main";

  return (
    <div className="hidden md:flex items-center gap-2 text-sm">
      <span className="text-neutral-400">{section}</span>
      <span className="text-neutral-300">/</span>
      <span className="text-neutral-700 font-medium">{current?.name ?? "Overview"}</span>
    </div>
  );
}

/* ---- Desktop sidebar (icon-only, 60px) ---- */
function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside
      className="hidden md:flex w-[60px] flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30 items-center py-3"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* Logo dot */}
      <Link href="/" className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center mb-6">
        <span className="w-2.5 h-2.5 rounded-full bg-brand-400" />
      </Link>

      {/* Nav icons */}
      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3 pt-3 border-t border-sidebar-border w-8" : ""}>
            <div className="flex flex-col items-center gap-1">
              {group.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return <NavLinkCollapsed key={item.name} item={item} isActive={isActive} />;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User avatar */}
      <div className="mt-3 pt-3 border-t border-sidebar-border w-8 flex flex-col items-center gap-2">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-medium text-brand-200 hover:bg-brand-600 transition-colors">
          U
        </Link>
      </div>
    </aside>
  );
}

/* ---- Mobile sidebar content (expanded, overlay) ---- */
function MobileSidebarContent({ pathname, onNavClick, onClose }: { pathname: string; onNavClick: () => void; onClose: () => void }) {
  return (
    <>
      <div className="px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-400" />
          <span className="text-white font-semibold text-md tracking-tight">StayCommand</span>
        </div>
        <button onClick={onClose} className="text-sidebar-text hover:text-white transition-colors p-1">
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-5 pt-5 border-t border-sidebar-border" : ""}>
            <div className="space-y-0.5">
              {group.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return <NavLinkExpanded key={item.name} item={item} isActive={isActive} onClick={onNavClick} />;
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-medium text-brand-200">U</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">User</p>
          </div>
          <Link href="/settings" onClick={onNavClick} className="text-sidebar-text hover:text-white transition-colors">
            <Settings size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex h-screen overflow-x-hidden">
      {/* Desktop sidebar — icon-only 60px */}
      <DesktopSidebar pathname={pathname} />

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={closeMobile} />
          <aside className="fixed inset-y-0 left-0 w-60 flex flex-col z-50 md:hidden animate-slide-in-left" style={{ background: "var(--sidebar-bg)" }}>
            <MobileSidebarContent pathname={pathname} onNavClick={closeMobile} onClose={closeMobile} />
          </aside>
        </>
      )}

      {/* Main content area — offset by 60px sidebar */}
      <div className="flex-1 md:ml-[60px] flex flex-col min-h-screen w-full overflow-x-hidden">
        {/* Topbar */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b bg-neutral-0" style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden text-neutral-500 hover:text-neutral-700 transition-colors" onClick={() => setMobileOpen(true)}>
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <span className="md:hidden text-sm font-medium text-neutral-700">
              {navGroups.flat().find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.name ?? "Overview"}
            </span>
            <Breadcrumb />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="relative text-neutral-400 hover:text-neutral-600 transition-colors">
              <Bell size={18} strokeWidth={1.5} />
            </button>
            <button className="hidden sm:flex items-center gap-2 px-3 h-8 text-sm font-medium text-neutral-500 hover:text-neutral-700 border rounded-md hover:border-neutral-300 transition-all" style={{ borderColor: "var(--border)" }}>
              <RefreshCcw size={14} strokeWidth={1.5} />
              Sync Now
            </button>
          </div>
        </header>

        {/* Page content — max-width for readability on large screens */}
        <main className="flex-1 overflow-auto">
          <ToastProvider>
            <div className="max-w-[1200px] mx-auto p-4 md:p-8 page-enter">{children}</div>
          </ToastProvider>
        </main>
      </div>
    </div>
  );
}

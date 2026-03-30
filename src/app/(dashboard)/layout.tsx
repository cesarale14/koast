"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import ReviewBadge from "@/components/ui/ReviewBadge";
import {
  LayoutGrid, Building2, CalendarDays, ClipboardList,
  DollarSign, BarChart3, Star, MessageSquare, RefreshCw,
  Bell, Settings, RefreshCcw, Menu, ChevronLeft, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem { name: string; href: string; icon: LucideIcon; badge?: boolean; }

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

/* ---- Collapsed nav link with tooltip ---- */
function NavLinkCollapsed({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  const [showTip, setShowTip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Link href={item.href}
      onMouseEnter={() => { timerRef.current = setTimeout(() => setShowTip(true), 300); }}
      onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); setShowTip(false); }}
      className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 ${
        isActive ? "bg-sidebar-active-bg text-sidebar-active-text" : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
      }`}>
      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-400" />}
      <Icon size={20} strokeWidth={1.5} />
      {item.badge && <span className="absolute top-1 right-1"><ReviewBadge /></span>}
      {showTip && (
        <span className="fixed ml-[68px] px-2.5 py-1.5 rounded-lg text-white text-xs font-medium whitespace-nowrap z-[9999]"
          style={{ backgroundColor: "#1c1917", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
          {item.name}
        </span>
      )}
    </Link>
  );
}

/* ---- Expanded nav link ---- */
function NavLinkExpanded({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onClick}
      className={`relative flex items-center gap-3 px-3 h-9 text-sm font-medium rounded-md transition-all duration-150 ${
        isActive ? "bg-sidebar-active-bg text-sidebar-active-text" : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
      }`}>
      {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-brand-400" />}
      <Icon size={18} strokeWidth={1.5} className="flex-shrink-0" />
      <span className="truncate">{item.name}</span>
      {item.badge && <ReviewBadge />}
    </Link>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const allItems = navGroups.flat();
  const current = allItems.find((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href));
  const sectionIdx = navGroups.findIndex((g) => g.some((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const section = ["Main", "Revenue", "Operations"][sectionIdx] ?? "Main";
  return (
    <div className="hidden md:flex items-center gap-2 text-sm">
      <span className="text-neutral-400">{section}</span>
      <span className="text-neutral-300">/</span>
      <span className="text-neutral-700 font-medium">{current?.name ?? "Overview"}</span>
    </div>
  );
}

/* ---- Desktop sidebar — toggleable collapsed/expanded ---- */
function DesktopSidebar({ pathname, expanded, onToggle }: { pathname: string; expanded: boolean; onToggle: () => void }) {
  return (
    <>
    <aside
      className="hidden md:flex flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30 transition-[width] duration-200 ease-out"
      style={{ background: "var(--sidebar-bg)", width: expanded ? 240 : 60 }}
    >
      {expanded ? (
        /* ---- EXPANDED ---- */
        <>
          <div className="px-4 h-14 flex items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-400" />
              <span className="text-white font-semibold text-md tracking-tight">StayCommand</span>
            </div>
          </div>
          <nav className="flex-1 px-3 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-5 pt-5 border-t border-sidebar-border" : ""}>
                <div className="space-y-0.5">
                  {group.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return <NavLinkExpanded key={item.name} item={item} isActive={isActive} />;
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="px-4 py-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-medium text-brand-200">U</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-white truncate">User</p></div>
              <Link href="/settings" className="text-sidebar-text hover:text-white transition-colors"><Settings size={16} strokeWidth={1.5} /></Link>
            </div>
          </div>
        </>
      ) : (
        /* ---- COLLAPSED ---- */
        <div className="flex flex-col items-center py-3 h-full">
          <Link href="/" className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-400" />
          </Link>
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
          <div className="mt-3 pt-3 border-t border-sidebar-border w-8 flex flex-col items-center">
            <Link href="/settings" className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-medium text-brand-200 hover:bg-brand-600 transition-colors">U</Link>
          </div>
        </div>
      )}
    </aside>
    {/* 3D toggle pill — centered on the sidebar's right border */}
    <button
      onClick={onToggle}
      className="hidden md:flex fixed z-40 items-center justify-center w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 transition-[left] duration-200 ease-out"
      style={{
        left: (expanded ? 240 : 60) - 12,
        top: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
      }}
      title={expanded ? "Collapse sidebar" : "Expand sidebar"}
    >
      <ChevronLeft size={13} strokeWidth={2} className={`transition-transform duration-200 ${expanded ? "" : "rotate-180"}`} />
    </button>
    </>
  );
}

/* ---- Mobile sidebar ---- */
function MobileSidebar({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      <aside className="fixed inset-y-0 left-0 w-60 flex flex-col z-50 md:hidden animate-slide-in-left" style={{ background: "var(--sidebar-bg)" }}>
        <div className="px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-400" />
            <span className="text-white font-semibold text-md tracking-tight">StayCommand</span>
          </div>
          <button onClick={onClose} className="text-sidebar-text hover:text-white transition-colors p-1"><X size={18} strokeWidth={1.5} /></button>
        </div>
        <nav className="flex-1 px-3 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-5 pt-5 border-t border-sidebar-border" : ""}>
              <div className="space-y-0.5">
                {group.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return <NavLinkExpanded key={item.name} item={item} isActive={isActive} onClick={onClose} />;
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-medium text-brand-200">U</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-white truncate">User</p></div>
            <Link href="/settings" onClick={onClose} className="text-sidebar-text hover:text-white transition-colors"><Settings size={16} strokeWidth={1.5} /></Link>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Persist sidebar preference
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-expanded");
    if (saved === "true") setSidebarExpanded(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded((v) => {
      localStorage.setItem("sidebar-expanded", String(!v));
      return !v;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const sidebarWidth = sidebarExpanded ? 240 : 60;

  return (
    <div className="flex h-screen overflow-x-hidden">
      <DesktopSidebar pathname={pathname} expanded={sidebarExpanded} onToggle={toggleSidebar} />

      {mobileOpen && <MobileSidebar pathname={pathname} onClose={closeMobile} />}

      {/* Main content — smooth margin transition */}
      <div
        className="flex-1 flex flex-col min-h-screen w-full overflow-x-hidden transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: undefined }}
      >
        <style>{`@media(min-width:768px){.main-offset{margin-left:${sidebarWidth}px}}`}</style>
        <div className="main-offset flex-1 flex flex-col min-h-screen">
          {/* Topbar */}
          <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b bg-neutral-0" style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                className="md:hidden text-neutral-500 hover:text-neutral-700 transition-colors"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
              <span className="md:hidden text-sm font-medium text-neutral-700">
                {navGroups.flat().find((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))?.name ?? "Overview"}
              </span>
              {/* breadcrumb removed — cleaner topbar */}
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button className="relative text-neutral-400 hover:text-neutral-600 transition-colors"><Bell size={18} strokeWidth={1.5} /></button>
              <button className="hidden sm:flex items-center gap-2 px-3 h-8 text-sm font-medium text-neutral-500 hover:text-neutral-700 border rounded-md hover:border-neutral-300 transition-all" style={{ borderColor: "var(--border)" }}>
                <RefreshCcw size={14} strokeWidth={1.5} />Sync Now
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <ToastProvider>
              <div className="max-w-[1200px] mx-auto p-4 md:p-8 page-enter">{children}</div>
            </ToastProvider>
          </main>
        </div>
      </div>
    </div>
  );
}

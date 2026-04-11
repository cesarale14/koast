"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import Logo from "@/components/ui/Logo";
import {
  LayoutDashboard, CalendarDays, MessageCircle,
  Home, DollarSign, Star, SprayCan,
  Map, MapPin, GitCompare,
  Bell, Settings, RefreshCcw, Menu, ChevronLeft, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem { name: string; href: string; icon: LucideIcon; external?: boolean; dot?: boolean; dotColor?: "emerald" | "red"; }
interface NavGroup { label?: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Calendar", href: "/calendar", icon: CalendarDays },
      { name: "Messages", href: "/messages", icon: MessageCircle, dot: true },
    ],
  },
  {
    items: [
      { name: "Properties", href: "/properties", icon: Home },
      { name: "Pricing", href: "/pricing", icon: DollarSign },
      { name: "Reviews", href: "/reviews", icon: Star },
      { name: "Cleaning", href: "/turnover", icon: SprayCan },
    ],
  },
  {
    items: [
      { name: "Market Intel", href: "/market-explorer", icon: Map },
      { name: "Nearby Listings", href: "/nearby-listings", icon: MapPin },
      { name: "Comp Sets", href: "/comp-sets", icon: GitCompare },
    ],
  },
];

/* ---- Collapsed nav link with tooltip ---- */
function NavLinkCollapsed({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  const [showTip, setShowTip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotBg = item.dotColor === "red" ? "bg-red-500" : "bg-emerald-500";
  return (
    <Link href={item.href}
      onMouseEnter={() => { timerRef.current = setTimeout(() => setShowTip(true), 300); }}
      onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); setShowTip(false); }}
      className={`relative flex items-center justify-center w-11 h-11 rounded-lg transition-all duration-150 ${
        isActive ? "bg-emerald-50 text-emerald-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      }`}>
      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-emerald-500" />}
      <Icon size={20} strokeWidth={1.5} />
      {item.dot && <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${dotBg} ring-2 ring-white`} />}
      {showTip && (
        <span className="fixed ml-[72px] px-3 py-2 rounded-lg text-white text-xs font-medium whitespace-nowrap z-[9999]"
          style={{ backgroundColor: "#1f2937", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {item.name}
        </span>
      )}
    </Link>
  );
}

/* ---- Expanded nav link ---- */
function NavLinkExpanded({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  const linkProps = item.external ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
  return (
    <Link href={item.href} onClick={onClick} {...linkProps}
      className={`relative flex items-center gap-3 px-3 h-11 text-sm font-medium rounded-lg transition-all duration-150 ${
        isActive ? "bg-emerald-50 text-emerald-600" : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
      }`}>
      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-emerald-500" />}
      <Icon size={20} strokeWidth={1.5} className={`flex-shrink-0 ${isActive ? "text-emerald-600" : "text-gray-400"}`} />
      <span className="truncate">{item.name}</span>
      {item.dot && <span className={`w-2 h-2 rounded-full ml-auto flex-shrink-0 ${item.dotColor === "red" ? "bg-red-500" : "bg-emerald-500"}`} />}
      {item.external && <span className="text-gray-300 text-[10px] ml-auto">↗</span>}
    </Link>
  );
}

/* ---- Desktop sidebar — toggleable collapsed/expanded ---- */
function DesktopSidebar({ pathname, expanded, onToggle, groups }: { pathname: string; expanded: boolean; onToggle: () => void; groups: NavGroup[] }) {
  return (
    <>
    <aside
      className="hidden md:flex flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200 transition-[width] duration-200 ease-out"
      style={{ width: expanded ? 240 : 60 }}
    >
      {expanded ? (
        /* ---- EXPANDED ---- */
        <>
          <div className="px-5 h-16 flex items-center">
            <Logo variant="full" size={30} className="[&_span]:!text-gray-900 [&_span]:!font-bold [&_span]:!text-lg" />
          </div>
          <nav className="flex-1 px-3 overflow-y-auto">
            {groups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-2 pt-2 border-t border-gray-100" : ""}>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return <NavLinkExpanded key={item.name} item={item} isActive={isActive} />;
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-semibold text-emerald-700">C</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 truncate">Cesar</p></div>
              <Link href="/settings" className="text-gray-400 hover:text-gray-600 transition-colors"><Settings size={16} strokeWidth={1.5} /></Link>
            </div>
          </div>
        </>
      ) : (
        /* ---- COLLAPSED ---- */
        <div className="flex flex-col items-center pt-4 h-full">
          <Link href="/" className="mb-5">
            <Logo variant="icon" size={30} />
          </Link>
          <nav className="flex-1 flex flex-col items-center gap-0.5 overflow-y-auto">
            {groups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-2 pt-2 border-t border-gray-100 w-8" : ""}>
                <div className="flex flex-col items-center gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return <NavLinkCollapsed key={item.name} item={item} isActive={isActive} />;
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-3 pt-3 border-t border-gray-100 w-8 flex flex-col items-center pb-3">
            <Link href="/settings" className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors">C</Link>
          </div>
        </div>
      )}
    </aside>
    {/* Toggle pill — centered on sidebar right edge */}
    <button
      onClick={onToggle}
      className="hidden md:flex fixed z-40 items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-all duration-200 ease-out"
      style={{
        left: (expanded ? 240 : 60) - 12,
        top: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        transitionProperty: "left, background-color, border-color, color",
      }}
      title={expanded ? "Collapse sidebar" : "Expand sidebar"}
    >
      <ChevronLeft size={13} strokeWidth={2} className={`transition-transform duration-200 ${expanded ? "" : "rotate-180"}`} />
    </button>
    </>
  );
}

/* ---- Mobile sidebar ---- */
function MobileSidebar({ pathname, onClose, groups }: { pathname: string; onClose: () => void; groups: NavGroup[] }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />
      <aside className="fixed inset-y-0 left-0 w-60 flex flex-col z-50 md:hidden animate-slide-in-left bg-white border-r border-gray-200">
        <div className="px-5 h-16 flex items-center justify-between">
          <Logo variant="full" size={30} className="[&_span]:!text-gray-900 [&_span]:!font-bold [&_span]:!text-lg" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><X size={18} strokeWidth={1.5} /></button>
        </div>
        <nav className="flex-1 px-3 overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-2 pt-2 border-t border-gray-100" : ""}>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return <NavLinkExpanded key={item.name} item={item} isActive={isActive} onClick={onClose} />;
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-semibold text-emerald-700">C</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 truncate">Cesar</p></div>
            <Link href="/settings" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><Settings size={16} strokeWidth={1.5} /></Link>
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
  const [conflictCount, setConflictCount] = useState(0);

  // Persist sidebar preference
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-expanded");
    if (saved === "true") setSidebarExpanded(true);
  }, []);

  // Poll for unresolved overbookings — flips the Messages dot red.
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/bookings/conflicts");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setConflictCount(json.count ?? 0);
      } catch { /* non-critical */ }
    };
    fetchCount();
    const t = setInterval(fetchCount, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Rebuild navGroups with the current dot color for Messages
  const dynamicNavGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.name === "Messages"
        ? { ...item, dotColor: conflictCount > 0 ? ("red" as const) : ("emerald" as const) }
        : item
    ),
  }));

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded((v) => {
      localStorage.setItem("sidebar-expanded", String(!v));
      return !v;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const sidebarWidth = sidebarExpanded ? 240 : 60;

  return (
    <div className="flex h-screen overflow-x-hidden bg-gray-50">
      <DesktopSidebar pathname={pathname} expanded={sidebarExpanded} onToggle={toggleSidebar} groups={dynamicNavGroups} />

      {mobileOpen && <MobileSidebar pathname={pathname} onClose={closeMobile} groups={dynamicNavGroups} />}

      {/* Main content — smooth margin transition */}
      <div
        className="flex-1 flex flex-col min-h-screen w-full overflow-x-hidden transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: undefined }}
      >
        <style>{`@media(min-width:768px){.main-offset{margin-left:${sidebarWidth}px}}`}</style>
        <div className="main-offset flex-1 flex flex-col min-h-screen">
          {/* Topbar */}
          <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                className="md:hidden text-gray-500 hover:text-gray-700 transition-colors"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
              <span className="md:hidden text-sm font-medium text-gray-700">
                {navGroups.flatMap((g) => g.items).find((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))?.name ?? "Dashboard"}
              </span>
              <span className="hidden md:block text-sm text-gray-500">
                {(() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })()}, Cesar
              </span>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button className="relative text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-50"><Bell size={20} strokeWidth={1.5} /></button>
              <button className="hidden sm:flex items-center gap-2 px-3.5 h-9 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all">
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

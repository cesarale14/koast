"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import TopBarSearch from "@/components/polish/TopBarSearch";
import CommandPalette from "@/components/polish/CommandPalette";
import { ChatStoreProvider } from "@/components/chat/ChatStore";
import { ChatBar } from "@/components/chat/ChatBar";
import { ChatClient } from "@/components/chat/ChatClient";
import {
  LayoutDashboard, CalendarDays, MessageCircle,
  Home, DollarSign, Star, Sparkles,
  TrendingUp, GitCompare,
  Bell, Settings, Menu, ChevronLeft, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem { name: string; href: string; icon: LucideIcon; external?: boolean; badge?: number | null; }
interface NavGroup { label?: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Calendar", href: "/calendar", icon: CalendarDays },
      { name: "Messages", href: "/messages", icon: MessageCircle },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { name: "Properties", href: "/properties", icon: Home },
      { name: "Pricing", href: "/pricing", icon: DollarSign },
      { name: "Reviews", href: "/reviews", icon: Star },
      { name: "Turnovers", href: "/turnovers", icon: Sparkles },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { name: "Market Intel", href: "/market-intel", icon: TrendingUp },
      { name: "Comp Sets", href: "/comp-sets", icon: GitCompare },
    ],
  },
];

const SIDEBAR_BG = "linear-gradient(180deg, var(--deep-sea) 0%, var(--abyss) 100%)";
const SIDEBAR_RIGHT_EDGE = "inset -1px 0 0 rgba(196,154,90,0.15)";
const INACTIVE_TEXT = "rgba(168,191,174,0.6)";

/* ---- Collapsed nav link with tooltip ---- */
function NavLinkCollapsed({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  const [showTip, setShowTip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Link
      href={item.href}
      onMouseEnter={() => { timerRef.current = setTimeout(() => setShowTip(true), 300); }}
      onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); setShowTip(false); }}
      className="relative flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-150"
      style={{
        color: isActive ? "var(--golden)" : INACTIVE_TEXT,
        backgroundColor: isActive ? "rgba(196,154,90,0.1)" : "transparent",
      }}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r" style={{ backgroundColor: "var(--golden)" }} />
      )}
      <Icon size={20} strokeWidth={1.5} />
      {item.badge != null && item.badge > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2"
          style={{ backgroundColor: "var(--coral-reef)", boxShadow: "0 0 0 2px var(--deep-sea)" }}
        >
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
      {showTip && (
        <span
          className="fixed ml-[72px] px-3 py-2 rounded-lg text-white text-xs font-medium whitespace-nowrap z-[9999]"
          style={{ backgroundColor: "var(--coastal)", boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}
        >
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
    <Link
      href={item.href}
      onClick={onClick}
      {...linkProps}
      className="relative flex items-center gap-3 px-3 h-11 text-sm font-medium rounded-lg transition-colors duration-150"
      style={{
        color: isActive ? "var(--golden)" : INACTIVE_TEXT,
        backgroundColor: isActive ? "rgba(196,154,90,0.1)" : "transparent",
      }}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r" style={{ backgroundColor: "var(--golden)" }} />
      )}
      <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" style={{ color: isActive ? "var(--golden)" : INACTIVE_TEXT }} />
      <span className="truncate">{item.name}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: "var(--coral-reef)" }}
        >
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </Link>
  );
}

/* ---- Group label (MANAGE / INSIGHTS) ---- */
function GroupLabel({ label }: { label: string }) {
  return (
    <div
      className="px-3 mb-1 mt-3 text-[10px] font-bold tracking-[0.08em]"
      style={{ color: "var(--tideline)" }}
    >
      {label}
    </div>
  );
}

/* ---- Logo mark "K" with gold glow ---- */
function LogoMark() {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{
        backgroundColor: "var(--golden)",
        boxShadow: "0 2px 12px rgba(196,154,90,0.4)",
      }}
    >
      <span className="text-white text-base font-bold tracking-tight">K</span>
    </div>
  );
}

/* ---- Desktop sidebar ---- */
function DesktopSidebar({ pathname, expanded, onToggle, groups }: { pathname: string; expanded: boolean; onToggle: () => void; groups: NavGroup[] }) {
  return (
    <>
      <aside
        className="hidden md:flex flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30 transition-[width] duration-200 ease-out"
        style={{ width: expanded ? 240 : 60, background: SIDEBAR_BG, boxShadow: SIDEBAR_RIGHT_EDGE }}
      >
        {expanded ? (
          /* ---- EXPANDED ---- */
          <>
            <div className="px-5 h-16 flex items-center">
              <div className="flex items-center gap-2.5">
                <LogoMark />
                <span className="text-white font-bold text-lg tracking-tight">Koast</span>
              </div>
            </div>
            <nav className="flex-1 px-3 overflow-y-auto">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.label && <GroupLabel label={group.label} />}
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                      return <NavLinkExpanded key={item.name} item={item} isActive={isActive} />;
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(196,154,90,0.1)" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: "rgba(196,154,90,0.2)", color: "var(--golden)" }}
                >
                  C
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">Cesar</p>
                  <p className="text-[11px] truncate" style={{ color: INACTIVE_TEXT }}>Free plan</p>
                </div>
                <Link href="/settings" className="transition-colors" style={{ color: INACTIVE_TEXT }}>
                  <Settings size={16} strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </>
        ) : (
          /* ---- COLLAPSED ---- */
          <div className="flex flex-col items-center pt-4 h-full">
            <Link href="/" className="mb-5">
              <LogoMark />
            </Link>
            <nav className="flex-1 flex flex-col items-center gap-0.5 overflow-y-auto w-full px-2">
              {groups.map((group, gi) => (
                <div key={gi} className={`w-full flex flex-col items-center ${gi > 0 ? "mt-2 pt-2" : ""}`} style={gi > 0 ? { borderTop: "1px solid rgba(196,154,90,0.1)" } : {}}>
                  <div className="flex flex-col items-center gap-0.5">
                    {group.items.map((item) => {
                      const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                      return <NavLinkCollapsed key={item.name} item={item} isActive={isActive} />;
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div
              className="mt-3 pt-3 w-10 flex flex-col items-center pb-3"
              style={{ borderTop: "1px solid rgba(196,154,90,0.1)" }}
            >
              <Link
                href="/settings"
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                style={{ backgroundColor: "rgba(196,154,90,0.2)", color: "var(--golden)" }}
              >
                C
              </Link>
            </div>
          </div>
        )}
      </aside>
      {/* Toggle pill */}
      <button
        onClick={onToggle}
        className="hidden md:flex fixed z-40 items-center justify-center w-7 h-7 rounded-full border transition-all duration-200 ease-out"
        style={{
          left: (expanded ? 240 : 60) - 12,
          top: 20,
          backgroundColor: "var(--mangrove)",
          borderColor: "var(--tideline)",
          color: INACTIVE_TEXT,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)",
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
      <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} />
      <aside
        className="fixed inset-y-0 left-0 w-60 flex flex-col z-50 md:hidden animate-slide-in-left"
        style={{ background: SIDEBAR_BG, boxShadow: SIDEBAR_RIGHT_EDGE }}
      >
        <div className="px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-white font-bold text-lg tracking-tight">Koast</span>
          </div>
          <button onClick={onClose} className="transition-colors p-1" style={{ color: INACTIVE_TEXT }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <nav className="flex-1 px-3 overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.label && <GroupLabel label={group.label} />}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return <NavLinkExpanded key={item.name} item={item} isActive={isActive} onClick={onClose} />;
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(196,154,90,0.1)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: "rgba(196,154,90,0.2)", color: "var(--golden)" }}
            >
              C
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Cesar</p>
              <p className="text-[11px] truncate" style={{ color: INACTIVE_TEXT }}>Free plan</p>
            </div>
            <Link href="/settings" onClick={onClose} className="transition-colors" style={{ color: INACTIVE_TEXT }}>
              <Settings size={16} strokeWidth={1.5} />
            </Link>
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

  // Poll for unresolved overbookings — surfaces as coral-reef badge on Messages.
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

  // Inject the live badge count onto the Messages item.
  const dynamicNavGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.name === "Messages"
        ? { ...item, badge: conflictCount }
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

  // M8 C8 Step D — early-return preserved only for /_preview/m5-states.
  // /chat routes now render alongside the persistent chat layout slot
  // (ChatBar + ChatClient mounted below) instead of replacing the
  // dashboard chrome. Per conventions v1.4 D1: chat is a layout slot,
  // not a route.
  if (pathname?.startsWith("/_preview/m5-states")) {
    return <>{children}</>;
  }

  return (
    <ChatStoreProvider
      initialConversationId={null}
      initialHistory={[]}
      initialProposals={[]}
    >
      <div className="flex h-screen overflow-x-hidden" style={{ backgroundColor: "var(--shore)" }}>
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
            <header
              className="h-14 flex-shrink-0 flex items-center justify-between gap-4 px-4 md:px-6 border-b bg-white"
              style={{ borderColor: "var(--dry-sand)" }}
            >
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  className="md:hidden transition-colors"
                  style={{ color: "var(--coastal)" }}
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu size={20} strokeWidth={1.5} />
                </button>
                <span className="md:hidden text-sm font-medium" style={{ color: "var(--coastal)" }}>
                  {navGroups.flatMap((g) => g.items).find((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))?.name ?? "Dashboard"}
                </span>
              </div>
              <TopBarSearch />
              <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <button className="relative transition-colors p-1.5 rounded-lg" style={{ color: "var(--tideline)" }}>
                  <Bell size={20} strokeWidth={1.5} />
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-auto" style={{ paddingBottom: "56px" }}>
              <ToastProvider>
                {pathname === "/calendar" || pathname === "/messages" ? (
                  <div className="h-full page-enter">{children}</div>
                ) : /^\/properties\/[^/]+$/.test(pathname) ? (
                  // Property detail page handles its own layout (full-bleed
                  // hero + max-w content). Skip the wrapper padding.
                  <div className="page-enter">{children}</div>
                ) : (
                  <div className="p-4 md:p-8 page-enter">{children}</div>
                )}
              </ToastProvider>
            </main>
          </div>
        </div>
        <CommandPalette />

        {/* M8 C8 Step D — persistent chat layout slot (D1).
            ChatBar: bottom-anchored resting state (z-40, hides when expanded).
            ChatClient: expanded surface, store-driven visibility (display:none when collapsed).
            Both mount unconditionally at layout scope so chat state survives navigation. */}
        <ChatBar />
        <ChatClient />
      </div>
    </ChatStoreProvider>
  );
}

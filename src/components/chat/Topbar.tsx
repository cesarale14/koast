"use client";

import styles from "./ChatShell.module.css";
import {
  PropertyContext,
  type PropertyOption,
  type PropertyRef,
} from "./PropertyContext";

export type TopbarProps = {
  property?: PropertyRef;
  /** Property dropdown options (D18). When empty, the trigger doesn't open. */
  propertyOptions?: PropertyOption[];
  /** Currently-selected property id (drives the highlighted row). */
  selectedPropertyId?: string | null;
  /** Dropdown open state — parent-owned for outside-click handling. */
  propertyMenuOpen?: boolean;
  onTogglePropertyMenu?: () => void;
  onClosePropertyMenu?: () => void;
  onSelectProperty?: (id: string) => void;
  onOpenAuditLog?: () => void;
  /** M8 Phase G C4: unread-event badge text ("1"–"9" or "9+"), or null/undefined when no unread. */
  auditUnreadBadge?: string | null;
  onNewThread?: () => void;
  /** Mobile drawer toggle — hamburger button is visible only at <768px via @media. */
  onToggleDrawer?: () => void;
  /** M8 C8 Step D: collapse the chat panel back to the resting-state bar. */
  onDismiss?: () => void;
};

export function Topbar({
  property,
  propertyOptions,
  selectedPropertyId,
  propertyMenuOpen,
  onTogglePropertyMenu,
  onClosePropertyMenu,
  onSelectProperty,
  onOpenAuditLog,
  auditUnreadBadge,
  onNewThread,
  onToggleDrawer,
  onDismiss,
}: TopbarProps) {
  return (
    <header className={styles.topbar}>
      {onToggleDrawer && (
        <button
          type="button"
          className={styles["menu-btn"]}
          aria-label="Open conversations"
          onClick={onToggleDrawer}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <PropertyContext
        property={property}
        options={propertyOptions}
        selectedId={selectedPropertyId}
        open={propertyMenuOpen}
        onToggleOpen={onTogglePropertyMenu}
        onClose={onClosePropertyMenu}
        onSelect={onSelectProperty}
      />
      <div className={styles["topbar-right"]}>
        <button
          type="button"
          className={styles["icon-btn"]}
          title="Audit log"
          aria-label="Audit log"
          onClick={onOpenAuditLog}
          style={{ position: "relative" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          {auditUnreadBadge ? (
            <span
              aria-label={`${auditUnreadBadge} unread audit events`}
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                background: "var(--coral-reef)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                lineHeight: "16px",
                borderRadius: 8,
                textAlign: "center",
                boxShadow: "0 0 0 2px var(--shore)",
              }}
            >
              {auditUnreadBadge}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={styles["icon-btn"]}
          title="New thread"
          aria-label="New thread"
          onClick={onNewThread}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        {onDismiss && (
          <button
            type="button"
            className={styles["icon-btn"]}
            title="Collapse Koast"
            aria-label="Collapse Koast"
            onClick={onDismiss}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

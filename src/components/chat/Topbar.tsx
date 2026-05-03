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
  onNewThread?: () => void;
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
  onNewThread,
}: TopbarProps) {
  return (
    <header className={styles.topbar}>
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
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
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
      </div>
    </header>
  );
}

"use client";

import styles from "./ChatShell.module.css";
import { RailHead } from "./RailHead";
import { RailNav } from "./RailNav";
import { RailList } from "./RailList";
import { RailFoot } from "./RailFoot";

export type ConversationItem = {
  id: string;
  /** Conversation name — typically the resolved property name (D-F2). */
  name: string;
  /** Preview text — derived from the first user turn's content_text (D-F2). */
  meta: string;
  /** "2:14 pm" / "mon" / "sun" — caller formats per locale + bucketing rules. */
  timeLabel: string;
};

export type ConversationGroup = {
  /** "Today" / "Yesterday" / "This week" / "Older" — render only groups with items. */
  label: string;
  items: ConversationItem[];
};

export type RailUser = {
  initials: string;
  name: string;
  org: string;
};

export type RailProps = {
  groups: ConversationGroup[];
  user: RailUser;
  activeConversationId?: string;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
  /** Mobile drawer: close it after a tab navigation from RailNav. The
   *  conversation Rail IS the mobile drawer, so the folded-in global nav
   *  closes the drawer on tap (operator msg 3727 — one drawer, tabs +
   *  conversations, no second trigger). */
  onNavigate?: () => void;
};

export function Rail({
  groups,
  user,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onNavigate,
}: RailProps) {
  return (
    <aside className={styles.rail} aria-label="Conversations">
      <RailHead onNew={onNewConversation} />
      <RailNav onNavigate={onNavigate} />
      <RailList
        groups={groups}
        activeId={activeConversationId}
        onSelect={onSelectConversation}
        onDelete={onDeleteConversation}
      />
      <RailFoot user={user} />
    </aside>
  );
}

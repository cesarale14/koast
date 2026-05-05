// Barrel exports for the M5 chat shell component family.
// Components are added incrementally as M5 implementation order steps land.

export { ChatShell, type ChatShellProps } from "./ChatShell";
export {
  Rail,
  type RailProps,
  type RailUser,
  type ConversationGroup,
  type ConversationItem,
} from "./Rail";
export { RailHead } from "./RailHead";
export { RailList } from "./RailList";
export { RailFoot } from "./RailFoot";
export { Surface, type SurfaceProps } from "./Surface";
export { Topbar, type TopbarProps } from "./Topbar";
export { PropertyContext, type PropertyRef } from "./PropertyContext";
export { DayDivider } from "./DayDivider";
export { Turn, type TurnRole } from "./Turn";
export { Meta, type MetaProps } from "./Meta";
export { UserMessage } from "./UserMessage";
export {
  KoastMessage,
  StreamingParagraph,
  StreamTail,
} from "./KoastMessage";
export { ToolCall, type ToolCallProps, type ToolCallState } from "./ToolCall";
export { KoastMark, type KoastMarkProps, type KoastMarkState } from "./KoastMark";
export { Composer, type ComposerProps, type ComposerState } from "./Composer";
export { RespondingRow, type RespondingRowProps } from "./RespondingRow";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorBlock, type ErrorBlockProps, type ErrorBlockKind } from "./ErrorBlock";
export { RefusalTag, type RefusalTagProps } from "./RefusalTag";
export {
  ActionProposal,
  type ActionProposalProps,
  type ProposalAction,
  type ActionKind,
} from "./ActionProposal";
export {
  MemoryArtifact,
  type MemoryArtifactProps,
  type FactSpan,
} from "./MemoryArtifact";
export {
  GuestMessageProposal,
  type GuestMessageProposalProps,
  type GuestMessageProposalState,
} from "./GuestMessageProposal";
export { ChatClient, type ChatClientProps } from "./ChatClient";

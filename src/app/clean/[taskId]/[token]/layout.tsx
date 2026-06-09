/**
 * Server layout for the cleaner job page. Its only job is to override the
 * PWA manifest for the /clean/[taskId]/[token] route so an installed icon
 * opens to THIS job (not the host cockpit at "/"). The page itself is a
 * client component and so can't export metadata — this server layout can.
 *
 * generateMetadata sets `manifest` to the per-task dynamic manifest, which
 * overrides the global file-convention manifest (start_url "/") for cleaner
 * pages only. Host routes are unaffected.
 */
import type { Metadata } from "next";

export function generateMetadata(
  { params }: { params: { taskId: string; token: string } },
): Metadata {
  return {
    manifest: `/api/clean/${params.taskId}/${params.token}/manifest`,
  };
}

export default function CleanTaskLayout({ children }: { children: React.ReactNode }) {
  return children;
}

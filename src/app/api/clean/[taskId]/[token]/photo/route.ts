import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { verifyCleanerToken } from "@/lib/cleaner-token/verify";

/**
 * POST /api/clean/[taskId]/[token]/photo  (S3b — v1 program)
 *
 * Token-verified cleaner photo upload. The file is proxied through this server
 * route (never a client-side signed-upload URL) and stored in the PRIVATE
 * `cleaning-photos` bucket via the service role; the route then appends
 * { path, uploaded_at } to cleaning_tasks.photos itself, so the photos column is
 * server-controlled (the cleaner can't inject arbitrary JSON). Returns a
 * short-lived signed URL for immediate display. Image-only + 10 MB cap as
 * defense-in-depth (the bucket enforces the same).
 */
export const runtime = "nodejs";

const BUCKET = "cleaning-photos";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 30; // P6.3 — per-task upload count cap (the photos array is unbounded otherwise).
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string; token: string } },
) {
  try {
    const supabase = createServiceClient();

    // P6.3 — throttle uploads per IP (spam + brute-force guard).
    const rl = await rateLimit(supabase, { key: `clean-photo:${clientIp(request)}`, limit: 20, windowSec: 60 });
    if (!rl.allowed) return rateLimited(rl);

    const auth = await verifyCleanerToken(supabase, params.taskId, params.token, "id, photos");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const task = auth.task;

    // P6.3 — count cap BEFORE the upload, so a rejected over-limit upload never
    // orphans an object in the bucket.
    const existing = Array.isArray(task.photos) ? task.photos : [];
    if (existing.length >= MAX_PHOTOS) {
      return NextResponse.json({ error: `Photo limit reached (max ${MAX_PHOTOS} per clean).` }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const blob = file as Blob;
    const ext = MIME_EXT[blob.type];
    if (!ext) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    if (blob.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 10 MB)" }, { status: 400 });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const path = `${params.taskId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: blob.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    }

    const uploaded_at = new Date().toISOString();
    const next = [...existing, { path, uploaded_at }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase.from("cleaning_tasks") as any)
      .update({ photos: next })
      .eq("id", task.id);
    if (updErr) {
      // Roll the orphaned object back so the bucket doesn't accrue dangling files.
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      return NextResponse.json({ error: `Save failed: ${updErr.message}` }, { status: 500 });
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return NextResponse.json({
      ok: true,
      photo: { path, url: signed?.signedUrl ?? null, uploaded_at },
      count: next.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

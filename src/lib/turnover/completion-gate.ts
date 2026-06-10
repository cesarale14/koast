/**
 * S3b — completion photo gate (pure rule, unit-tested independent of the route's
 * storage/IO). A turnover cannot be marked completed without at least one
 * confirmation photo when the property requires it (require_completion_photos,
 * default on). Only the completed transition is gated — start/issue are not.
 */
export function blockCompletionForMissingPhotos(
  nextStatus: string | undefined | null,
  requirePhotos: boolean,
  photoCount: number,
): boolean {
  return nextStatus === "completed" && requirePhotos === true && photoCount <= 0;
}

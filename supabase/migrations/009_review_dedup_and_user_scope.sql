-- Fix duplicate reviews: keep the most recently created review per booking_id, delete extras
DELETE FROM guest_reviews
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id) id
  FROM guest_reviews
  ORDER BY booking_id, created_at DESC
);

-- Ensure the unique constraint exists (safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_reviews_booking_id_key'
      AND conrelid = 'guest_reviews'::regclass
  ) THEN
    ALTER TABLE guest_reviews ADD CONSTRAINT guest_reviews_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

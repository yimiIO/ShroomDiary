BEGIN;

ALTER TABLE life_os_item_links
  DROP CONSTRAINT IF EXISTS life_os_item_links_status_check;

ALTER TABLE life_os_item_links
  ADD CONSTRAINT life_os_item_links_status_check
  CHECK (status IN ('PENDING', 'ACTIVE', 'REMOVED', 'INVALID_SOURCE'));

UPDATE life_os_item_links
   SET status = 'PENDING', updated_at = now()
 WHERE origin = 'AI' AND user_confirmed = false AND status = 'ACTIVE';

COMMIT;

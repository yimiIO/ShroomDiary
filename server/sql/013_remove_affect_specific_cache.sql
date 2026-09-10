BEGIN;

-- 011 was a short-lived, affect-specific cache. The generic semantic census in
-- 012 supersedes it; cached classifications are derived data and can be dropped.
DROP TABLE IF EXISTS diary_affect_assessments;

COMMIT;

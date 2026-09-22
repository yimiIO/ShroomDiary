'use strict';

const db = require('./db');

async function featureAccessForUser(userId, featureKey, platform = 'H5', client = db) {
  const result = await client.query(
    `SELECT r.feature_key, r.status, r.platforms, r.maintenance_message, r.runtime_config,
            g.id AS grant_id, g.access AS grant_access, g.expires_at AS grant_expires_at
       FROM feature_rollouts r
       LEFT JOIN LATERAL (
         SELECT id, access, expires_at
           FROM feature_access_grants
          WHERE feature_key = r.feature_key AND user_id = $1 AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY created_at DESC LIMIT 1
       ) g ON true
      WHERE r.feature_key = $2`,
    [userId, featureKey]
  );
  const row = result.rows[0];
  if (!row) return { allowed: false, reason: 'FEATURE_UNKNOWN', featureKey };
  if (row.status === 'PAUSED') {
    return {
      allowed: false,
      reason: 'FEATURE_PAUSED',
      featureKey,
      message: row.maintenance_message || '功能暂时停用，请稍后再试'
    };
  }
  const enabledPlatforms = Array.isArray(row.platforms) ? row.platforms : [];
  if (!enabledPlatforms.includes(platform)) {
    return { allowed: false, reason: 'FEATURE_PLATFORM_DISABLED', featureKey, platform };
  }
  if (row.grant_access === 'DENY') return { allowed: false, reason: 'FEATURE_DENIED', featureKey };
  if (row.grant_access === 'ALLOW') return { allowed: true, reason: 'ADMIN_GRANT', featureKey };
  if (row.status === 'BETA') return { allowed: false, reason: 'FEATURE_BETA', featureKey };
  return { allowed: true, reason: 'ROLLOUT_ACTIVE', featureKey };
}

module.exports = { featureAccessForUser };

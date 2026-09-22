'use strict';

const express = require('express');
const db = require('../db');
const { asyncRoute, ok, requireUser } = require('../http');
const { computeGroups, derivePreferences, MIN_GROUP_SIZE, MAX_CANDIDATES } = require('../todo-batching-engine');

const router = express.Router();
router.use(requireUser);

router.get('/smart-groups', asyncRoute(async (req, res) => {
  const [result, corrections] = await Promise.all([
    db.query(
    `SELECT t.id, t.content, t.description, t.tags, t.project_id, t.compound_item_id,
            t.scheduled_date, t.deadline, t.estimated_minutes,
            p.name AS project_name, li.name AS compound_item_name
       FROM todos t
       LEFT JOIN todo_projects p ON p.id = t.project_id AND p.user_id = t.user_id
       LEFT JOIN life_os_items li ON li.id = t.compound_item_id AND li.user_id = t.user_id
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.status IN ('pending', 'in_progress')
        AND t.bag_id IS NULL
      ORDER BY t.position, COALESCE(t.scheduled_date, t.deadline) NULLS LAST
      LIMIT $2`,
    [req.user.id, MAX_CANDIDATES]
    ),
    db.query(
      `SELECT event_type, original_state, new_state, created_at
         FROM correction_events
        WHERE user_id = $1 AND event_type = 'drag_reclassify'
        ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    )
  ]);
  const preferences = derivePreferences(corrections.rows);
  const groups = result.rowCount >= MIN_GROUP_SIZE ? computeGroups(result.rows, preferences) : [];
  return ok(res, {
    groups,
    totalTasks: result.rowCount,
    adjustmentCount: preferences.adjustmentCount,
    warning: result.rowCount > 8 ? '当前待办较多，建议先确认少量高优先级事项，再采纳统筹建议。' : null
  });
}));

module.exports = router;

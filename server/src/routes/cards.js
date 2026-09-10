'use strict';

const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const {
  asyncRoute,
  fail,
  ok,
  optionalUser,
  pageParams,
  requireUser,
  stringArray,
  text,
  visibility
} = require('../http');

const router = express.Router();

function mapCard(row, ownerOverride) {
  const isOwner = typeof ownerOverride === 'boolean' ? ownerOverride : Boolean(row.is_owner);
  return {
    id: row.id,
    seedSentence: row.seed_sentence,
    myUnderstanding: row.my_understanding,
    usageItems: row.usage_items || [],
    tags: row.tags || [],
    visibility: row.visibility,
    collectionSlug: row.collection_slug || null,
    editorialSource: row.editorial_source || null,
    copiedFromId: isOwner ? row.copied_from_id : undefined,
    sourceDiaryId: isOwner ? (row.source_diary_id || null) : undefined,
    sourceAnalysisId: isOwner ? (row.source_analysis_id || null) : undefined,
    lastReviewedAt: isOwner ? row.last_reviewed_at : undefined,
    practiceCases: isOwner ? (row.practice_cases || []) : [],
    isOwner,
    viewerState: {
      resonated: Boolean(row.viewer_resonated),
      favorited: Boolean(row.viewer_favorited),
      copiedCardId: row.viewer_copy_id || null
    },
    stats: {
      practiceCount: isOwner ? Number(row.practice_count || 0) : 0,
      resonanceCount: Number(row.resonance_count || 0),
      favoriteCount: Number(row.favorite_count || 0),
      quoteCount: Number(row.quote_count || 0)
    },
    author: row.visibility === 'PUBLIC_NAMED' ? {
      id: row.user_id,
      nickname: row.author_nickname,
      avatar: row.author_avatar_url || ''
    } : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function viewerStateSelect(parameter) {
  return `,
    (c.user_id = ${parameter}) AS is_owner,
    EXISTS (
      SELECT 1 FROM card_resonances viewer_resonance
      WHERE viewer_resonance.card_id = c.id AND viewer_resonance.user_id = ${parameter}
    ) AS viewer_resonated,
    EXISTS (
      SELECT 1 FROM card_favorites viewer_favorite
      WHERE viewer_favorite.card_id = c.id AND viewer_favorite.user_id = ${parameter}
    ) AS viewer_favorited,
    (
      SELECT viewer_copy.id FROM cards viewer_copy
      WHERE viewer_copy.copied_from_id = c.id AND viewer_copy.user_id = ${parameter}
      ORDER BY viewer_copy.created_at ASC LIMIT 1
    ) AS viewer_copy_id`;
}

const cardSelect = `
  c.id, c.user_id, c.seed_sentence, c.my_understanding, c.usage_items, c.tags,
  c.visibility, c.collection_slug, c.editorial_source,
  c.copied_from_id, c.source_diary_id, c.source_analysis_id,
  c.last_reviewed_at, c.created_at, c.updated_at,
  u.nickname AS author_nickname, u.avatar_url AS author_avatar_url,
  (SELECT count(*) FROM card_practices p WHERE p.card_id = c.id) AS practice_count,
  c.legacy_resonance_count +
    (SELECT count(*) FROM card_resonances r WHERE r.card_id = c.id) AS resonance_count,
  c.legacy_favorite_count +
    (SELECT count(*) FROM card_favorites f WHERE f.card_id = c.id) AS favorite_count,
  c.legacy_quote_count +
    (SELECT count(*) FROM cards copies WHERE copies.copied_from_id = c.id) AS quote_count`;

async function detailRow(cardId, userId) {
  const viewerId = userId || '00000000-0000-0000-0000-000000000000';
  const result = await db.query(
    `SELECT ${cardSelect}${viewerStateSelect('$2')},
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id,
          'context', p.context,
          'action', p.action,
          'feeling', p.feeling,
          'result', p.result,
          'reflection', p.reflection,
          'createdAt', p.created_at
        ) ORDER BY p.created_at DESC)
        FROM card_practices p
        WHERE p.card_id = c.id AND p.user_id = $2
      ), '[]'::jsonb) AS practice_cases
     FROM cards c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND (c.user_id = $2 OR c.visibility <> 'PRIVATE')`,
    [cardId, viewerId]
  );
  return result.rows[0] || null;
}

router.get('/discover', optionalUser, asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const tag = text(req.query.tags, 80) || null;
  const collection = text(req.query.collection, 120) || null;
  const person = text(req.query.person, 120) || null;
  const sort = req.query.sort === 'popular' ? 'popular' : 'latest';
  const order = sort === 'popular'
    ? 'resonance_count DESC, c.created_at DESC'
		: (collection
			? "COALESCE((c.editorial_source ->> 'position')::int, 999999) ASC"
			: `row_number() OVER (
				PARTITION BY (c.collection_slug IS NULL)
				ORDER BY c.created_at DESC, c.id DESC
			) ASC, (c.collection_slug IS NULL) DESC`);
  const viewerId = (req.user && req.user.id) || '00000000-0000-0000-0000-000000000000';
  const values = [viewerId];
  const conditions = ["c.visibility <> 'PRIVATE'"];
  if (tag) {
    values.push(tag);
    conditions.push(`c.tags ? $${values.length}`);
  }
  if (collection) {
    values.push(collection);
    conditions.push(`c.collection_slug = $${values.length}`);
  }
  if (person) {
    values.push(person);
    conditions.push(`c.editorial_source ->> 'personSlug' = $${values.length}`);
  }
  values.push(pageSize, offset);
  const result = await db.query(
    `SELECT ${cardSelect}${viewerStateSelect('$1')}, '[]'::jsonb AS practice_cases
       FROM cards c JOIN users u ON u.id = c.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return ok(res, { list: result.rows.map(mapCard), page, pageSize });
}));

router.get('/collections', optionalUser, asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT collection_slug,
            editorial_source ->> 'collectionTitle' AS collection_title,
            editorial_source ->> 'personSlug' AS person_slug,
            editorial_source ->> 'personName' AS person_name,
            editorial_source ->> 'personYears' AS person_years,
            editorial_source ->> 'theme' AS theme,
            count(*)::int AS card_count,
            min((editorial_source ->> 'position')::int) AS first_position
       FROM cards
      WHERE visibility <> 'PRIVATE'
        AND collection_slug IS NOT NULL
        AND editorial_source IS NOT NULL
      GROUP BY collection_slug, collection_title, person_slug, person_name, person_years, theme
      ORDER BY min((editorial_source ->> 'position')::int) ASC`
  );
  const collections = [];
  for (const row of result.rows) {
    let collection = collections.find(item => item.slug === row.collection_slug);
    if (!collection) {
      collection = { slug: row.collection_slug, title: row.collection_title, cardCount: 0, people: [] };
      collections.push(collection);
    }
    collection.cardCount += Number(row.card_count || 0);
    collection.people.push({
      slug: row.person_slug,
      name: row.person_name,
      years: row.person_years,
      theme: row.theme,
      cardCount: Number(row.card_count || 0)
    });
  }
  return ok(res, { list: collections });
}));

router.get('/view', optionalUser, asyncRoute(async (req, res) => {
  const card = await detailRow(req.query.id, req.user && req.user.id);
  if (!card) return fail(res, 404, '菇卡不存在');
  return ok(res, mapCard(card));
}));

router.use(requireUser);

router.get('/favorites', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${cardSelect}${viewerStateSelect('$1')}, '[]'::jsonb AS practice_cases
         FROM card_favorites viewer_favorites
         JOIN cards c ON c.id = viewer_favorites.card_id
         JOIN users u ON u.id = c.user_id
        WHERE viewer_favorites.user_id = $1
          AND (c.user_id = $1 OR c.visibility <> 'PRIVATE')
        ORDER BY viewer_favorites.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, offset]
    ),
    db.query(
      `SELECT count(*)::int AS total
         FROM card_favorites viewer_favorites
         JOIN cards c ON c.id = viewer_favorites.card_id
        WHERE viewer_favorites.user_id = $1
          AND (c.user_id = $1 OR c.visibility <> 'PRIVATE')`,
      [req.user.id]
    )
  ]);
  return ok(res, { list: items.rows.map(mapCard), total: total.rows[0].total, page, pageSize });
}));

router.get('/index', asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const [items, total] = await Promise.all([
    db.query(
      `SELECT ${cardSelect}, TRUE AS is_owner, FALSE AS viewer_resonated,
              FALSE AS viewer_favorited, NULL::uuid AS viewer_copy_id,
              '[]'::jsonb AS practice_cases
         FROM cards c JOIN users u ON u.id = c.user_id
        WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, offset]
    ),
    db.query('SELECT count(*)::int AS total FROM cards WHERE user_id = $1', [req.user.id])
  ]);
  return ok(res, { list: items.rows.map(mapCard), total: total.rows[0].total, page, pageSize });
}));

router.post('/create', asyncRoute(async (req, res) => {
  const seedSentence = text(req.body.seedSentence, 500);
  if (!seedSentence) return fail(res, 400, '觉察句不能为空');
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO cards
      (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      id, req.user.id, seedSentence, text(req.body.myUnderstanding, 5000),
      JSON.stringify(stringArray(req.body.usageItems, 10, 500)),
      JSON.stringify(stringArray(req.body.tags)), visibility(req.body.visibility)
    ]
  );
  return ok(res, mapCard(await detailRow(id, req.user.id)), '菇卡已保存');
}));

router.put('/update', asyncRoute(async (req, res) => {
  const seedSentence = text(req.body.seedSentence, 500);
  if (!seedSentence) return fail(res, 400, '觉察句不能为空');
  const result = await db.query(
    `UPDATE cards SET seed_sentence = $3, my_understanding = $4, usage_items = $5::jsonb,
       tags = $6::jsonb, visibility = $7, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [
      req.query.id, req.user.id, seedSentence, text(req.body.myUnderstanding, 5000),
      JSON.stringify(stringArray(req.body.usageItems, 10, 500)),
      JSON.stringify(stringArray(req.body.tags)), visibility(req.body.visibility)
    ]
  );
  if (!result.rowCount) return fail(res, 404, '菇卡不存在');
  return ok(res, mapCard(await detailRow(req.query.id, req.user.id)), '菇卡已更新');
}));

router.delete('/delete', asyncRoute(async (req, res) => {
  const result = await db.query('DELETE FROM cards WHERE id = $1 AND user_id = $2', [req.query.id, req.user.id]);
  if (!result.rowCount) return fail(res, 404, '菇卡不存在');
  return ok(res, null, '菇卡已删除');
}));

router.post('/practices', asyncRoute(async (req, res) => {
  const cardId = req.query.id || req.body.id;
  const context = text(req.body.context, 500);
  const action = text(req.body.action, 500);
  if (!context || !action) return fail(res, 400, '请填写情境和行动');
  const owned = await db.query('SELECT id FROM cards WHERE id = $1 AND user_id = $2', [cardId, req.user.id]);
  if (!owned.rowCount) return fail(res, 404, '菇卡不存在');
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO card_practices
      (id, card_id, user_id, context, action, feeling, result, reflection)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id, cardId, req.user.id, context, action, text(req.body.feeling, 500),
      text(req.body.result, 500), text(req.body.reflection, 1000)
    ]
  );
  return ok(res, { id }, '练习已记录');
}));

router.post('/review', asyncRoute(async (req, res) => {
  const id = req.query.id || req.body.id;
  const result = await db.query(
    'UPDATE cards SET last_reviewed_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '菇卡不存在');
  return ok(res, { reviewed: true });
}));

router.post('/resonate', asyncRoute(async (req, res) => {
  const cardId = req.query.id || req.body.id;
  const visible = await db.query(
    "SELECT id, user_id FROM cards WHERE id = $1 AND visibility <> 'PRIVATE'",
    [cardId]
  );
  if (!visible.rowCount) return fail(res, 404, '公开菇卡不存在');
  if (visible.rows[0].user_id === req.user.id) return fail(res, 400, '不能共鸣自己的菇卡');
  await db.query(
    `INSERT INTO card_resonances (card_id, user_id) VALUES ($1, $2)
     ON CONFLICT (card_id, user_id) DO NOTHING`,
    [cardId, req.user.id]
  );
  const count = await db.query(
    `SELECT legacy_resonance_count +
       (SELECT count(*) FROM card_resonances WHERE card_id = $1) AS count
       FROM cards WHERE id = $1`,
    [cardId]
  );
  return ok(res, { resonated: true, resonanceCount: Number(count.rows[0].count || 0) });
}));

router.post('/unresonate', asyncRoute(async (req, res) => {
  const cardId = req.query.id || req.body.id;
  await db.query('DELETE FROM card_resonances WHERE card_id = $1 AND user_id = $2', [cardId, req.user.id]);
  const count = await db.query(
    `SELECT legacy_resonance_count +
       (SELECT count(*) FROM card_resonances WHERE card_id = $1) AS count
       FROM cards WHERE id = $1`,
    [cardId]
  );
  return ok(res, {
    resonated: false,
    resonanceCount: count.rowCount ? Number(count.rows[0].count || 0) : 0
  });
}));

router.post('/favorite', asyncRoute(async (req, res) => {
  const cardId = req.query.id || req.body.id;
  const visible = await db.query("SELECT id FROM cards WHERE id = $1 AND (user_id = $2 OR visibility <> 'PRIVATE')", [cardId, req.user.id]);
  if (!visible.rowCount) return fail(res, 404, '菇卡不存在');
  await db.query(
    `INSERT INTO card_favorites (card_id, user_id) VALUES ($1, $2)
     ON CONFLICT (card_id, user_id) DO NOTHING`,
    [cardId, req.user.id]
  );
  const count = await db.query(
    `SELECT legacy_favorite_count +
       (SELECT count(*) FROM card_favorites WHERE card_id = $1) AS count
       FROM cards WHERE id = $1`,
    [cardId]
  );
  return ok(res, { favorited: true, favoriteCount: Number(count.rows[0].count || 0) });
}));

router.post('/unfavorite', asyncRoute(async (req, res) => {
  const cardId = req.query.id || req.body.id;
  await db.query('DELETE FROM card_favorites WHERE card_id = $1 AND user_id = $2', [cardId, req.user.id]);
  const count = await db.query(
    `SELECT legacy_favorite_count +
       (SELECT count(*) FROM card_favorites WHERE card_id = $1) AS count
       FROM cards WHERE id = $1`,
    [cardId]
  );
  return ok(res, {
    favorited: false,
    favoriteCount: count.rowCount ? Number(count.rows[0].count || 0) : 0
  });
}));

router.post('/copy', asyncRoute(async (req, res) => {
  const sourceId = req.query.id || req.body.id;
  const source = await db.query(
    `SELECT user_id, seed_sentence, my_understanding, usage_items, tags,
            collection_slug, editorial_source
       FROM cards WHERE id = $1 AND visibility <> 'PRIVATE'`,
    [sourceId]
  );
  if (!source.rowCount) return fail(res, 404, '公开菇卡不存在');
  if (source.rows[0].user_id === req.user.id) return fail(res, 400, '这是你自己的菇卡，无需重复引用');
  const existing = await db.query(
    `SELECT id FROM cards
      WHERE copied_from_id = $1 AND user_id = $2
      ORDER BY created_at ASC LIMIT 1`,
    [sourceId, req.user.id]
  );
  if (existing.rowCount) {
    return ok(res, mapCard(await detailRow(existing.rows[0].id, req.user.id)), '已经引用到你的菇卡');
  }
  const id = crypto.randomUUID();
  const card = source.rows[0];
  await db.query(
    `INSERT INTO cards
      (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility,
       copied_from_id, collection_slug, editorial_source)
     VALUES ($1, $2, $3, $4, $5, $6, 'PRIVATE', $7, $8, $9::jsonb)`,
    [
      id,
      req.user.id,
      card.seed_sentence,
      card.my_understanding,
      JSON.stringify(card.usage_items || []),
      JSON.stringify(card.tags || []),
      sourceId,
      card.collection_slug,
      card.editorial_source ? JSON.stringify(card.editorial_source) : null
    ]
  );
  return ok(res, mapCard(await detailRow(id, req.user.id)), '已引用到我的菇卡');
}));

module.exports = router;

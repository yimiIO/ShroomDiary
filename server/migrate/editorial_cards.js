'use strict';

const db = require('../src/db');
const {
  COLLECTION_SLUG,
  COLLECTION_TITLE,
  deterministicUuid,
  EDITORIAL_CARDS,
	historicalUserId,
	historicalUserMobile,
	OFFICIAL_USER_ID,
	PEOPLE
} = require('../src/editorial-cards');

async function seed() {
  const result = await db.transaction(async client => {
		for (const [personKey, person] of Object.entries(PEOPLE)) {
			await client.query(
				`INSERT INTO users (id, mobile, nickname, password_hash)
				 VALUES ($1, $2, $3, '!disabled-historical-profile!')
				 ON CONFLICT (id) DO UPDATE SET
				   mobile = EXCLUDED.mobile,
				   nickname = EXCLUDED.nickname,
				   updated_at = now()`,
				[historicalUserId(person.slug), historicalUserMobile(personKey), person.name]
			);
		}

    const ids = [];
    for (const [index, card] of EDITORIAL_CARDS.entries()) {
      const id = deterministicUuid(`shroom:${card.collectionSlug}:${card.slug}`);
      const editorialSource = { ...card.editorialSource, cardSlug: card.slug, position: index + 1 };
      const createdAt = new Date(Date.UTC(2026, 8, 9, 4, 0, index)).toISOString();
      await client.query(
        `INSERT INTO cards
          (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility,
           collection_slug, editorial_source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'PUBLIC_NAMED', $7, $8::jsonb, $9, $9)
				 ON CONFLICT (id) DO UPDATE SET
				   user_id = EXCLUDED.user_id,
				   seed_sentence = EXCLUDED.seed_sentence,
           my_understanding = EXCLUDED.my_understanding,
           usage_items = EXCLUDED.usage_items,
           tags = EXCLUDED.tags,
           visibility = 'PUBLIC_NAMED',
           collection_slug = EXCLUDED.collection_slug,
           editorial_source = EXCLUDED.editorial_source,
           updated_at = now()
				 WHERE cards.user_id = EXCLUDED.user_id OR cards.user_id = $10`,
        [
          id,
						card.ownerUserId,
          card.seedSentence,
          card.myUnderstanding,
          JSON.stringify(card.usageItems),
          JSON.stringify(card.tags),
          card.collectionSlug,
          JSON.stringify(editorialSource),
						createdAt,
						OFFICIAL_USER_ID
        ]
      );
      ids.push(id);
    }
		await client.query(
			`DELETE FROM users
			  WHERE id = $1
			    AND mobile = '__shroom_editorial__'
			    AND NOT EXISTS (SELECT 1 FROM cards WHERE user_id = $1)`,
			[OFFICIAL_USER_ID]
		);
    return ids;
  });

  console.log(JSON.stringify({
    ok: true,
    collectionSlug: COLLECTION_SLUG,
    collectionTitle: COLLECTION_TITLE,
    cards: result.length,
		people: new Set(EDITORIAL_CARDS.map(card => card.editorialSource.personSlug)).size,
		userProfiles: new Set(EDITORIAL_CARDS.map(card => card.ownerUserId)).size
  }));
}

if (require.main === module) {
  seed().catch(error => {
    console.error(error);
    process.exitCode = 1;
  }).finally(() => db.close());
}

module.exports = { deterministicUuid, seed };

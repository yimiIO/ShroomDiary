# Shroom storage boundary

Shroom has one runtime source of truth: its dedicated PostgreSQL database. The
H5, App, mini program and trusted personal-agent client all use the same Shroom
API and never select a user with a client-supplied `userId`.

## Runtime ownership

| Product data | PostgreSQL tables |
|---|---|
| Accounts and browser sessions | `users`, `refresh_tokens` |
| Scoped personal-agent access | `api_tokens` |
| Diaries and private media metadata | `diaries`, `media_assets` |
| Relationship assets | `friends`, `interactions`, `score_histories`, `friend_todos`, `friend_milestones`, `friend_asset_settings` |
| Life OS snapshots, clauses, evidence and review proposals | `life_os`, `life_os_versions`, `life_os_clauses`, `life_os_clause_evidence`, `life_os_review_proposals` |
| AI analysis, card suggestions and confirmed actions | `diary_analysis`, `todos` |
| Shroom cards, diary provenance and social actions | `cards`, `card_practices`, `card_resonances`, `card_favorites` |

Every private row is owned by `user_id`. The authenticated browser session or
API token is the only source of that identity.

Life OS is also private and per-user. A diary is the lived record; a Shroom card
is a concrete, reusable understanding for a situation, not an action or todo;
Life OS is the smaller, cross-context layer of decision criteria, boundaries and
review questions. AI review is user-triggered and creates a pending
`life_os_review_proposals` row without changing the active version. A proposal
becomes authoritative only after the user signs a new `life_os_versions`
snapshot and its `life_os_clauses`. Per-clause support/challenge links are stored
in `life_os_clause_evidence`. All source references are validated against the
same user's diaries/cards, so inspectable abstraction does not create another
runtime data source.

Image object bytes live in the private `shroom-1303825367` COS bucket under
`private/users/{userId}/diary/{YYYY}/{MM}/{mediaId}.{ext}`. PostgreSQL remains the
only source of ownership and object-key metadata. Images are served only through
expiring Shroom media links; the bucket is not a public gallery and does not reuse
the SURFPLUS `img.surfplus.xyz` CDN. Voice objects currently remain on Shroom's
private local disk and are recorded with `storage_provider = 'local'`.

## Migration-only inputs

The scripts under `server/migrate/` can import snapshots from the former
Surfplus diary database, Outline/Wiki exports and OpenClaw JSON/Markdown files.
Those files are one-time migration inputs, not runtime fallbacks. After an
import is verified, all reads and writes continue against PostgreSQL only.

Migration metadata such as `source_id` is retained solely for audit and
idempotency. It does not cause Shroom to read from another service.

## External processors

Voice transcription and five-view analysis are processors, not storage
systems. Only the recording or diary selected by the user is sent to the
configured provider. The source recording, editable transcript, analysis
result, card suggestion and confirmed todo remain in Shroom PostgreSQL. A diary
never becomes a card automatically: analysis may suggest a private card draft
or matching user-owned cards, but only a user confirmation creates or links it.

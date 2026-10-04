# Shroom cloud development rules

This repository powers the owner's personal Shroom test environment at `https://shroom.evox.run`.

- Read `docs/PRODUCT.md`, `docs/GROWTH_FLYWHEEL.md`, and task-relevant docs before changing product behavior.
- Preserve diary ownership, traceability, default privacy, user confirmation, and cross-user isolation.
- Work from `cloud-test`. Small, reviewed commits pushed to `cloud-test` deploy automatically after tests and builds pass.
- Run the narrowest relevant tests plus `npm --prefix server test` and `npm run build:h5` for cross-layer changes.
- Never commit credentials or production data. Configuration remains in GitHub Actions secrets and `/etc/shroom/*.env`.
- SQL changes must be additive, idempotent where practical, and added as a new numbered file under `server/sql/`.
- The current server is a personal test environment, so approved product/code changes may deploy directly. Still require explicit owner confirmation before deleting data, changing privacy defaults, raising ongoing third-party cost, or publishing private content.
- A successful task reports the commit, tests, deployed revision, health check, and visible URL. Never claim deployment from code output alone.

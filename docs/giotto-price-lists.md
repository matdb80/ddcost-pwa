# Giotto Plus: shared price lists

## Smeralda / bandelle a T

The same editor and percentage engine also serve `/bandelle-t/listini` through the independent `bandelleTPrice` API and `bandelle_t_price_revisions` table. Smeralda snapshots contain 131 published prices in integer thousandths of euro (3 decimals). The 30 unpublished cells remain null in the matrices, cannot be selected or created through percentage edits, and still require manual quotation. The initial workbook's 4.5% increase is already included and is never applied again automatically. Supplements and nearest-collar selection retain their existing rules.

For Collaudo, `DDCOST_STAGING_MIGRATE_BANDELLE_T_PRICES=1` enables the dedicated additive migration, including write/read/rollback checks and a check that the Giotto price history is unchanged. Both revision tables are included in logical backups. Before promotion, production must also have the Smeralda revision table and an agreed initial snapshot. Saving or restoring either family never writes to the other family's history.

The calculator reads the latest `bandelle_price_revisions` snapshot from the authenticated API. It does not silently fall back to bundled prices if the database is unavailable. The bundled tables supply the initial revision and the supported cell identities only.

Each revision stores the complete 931-cell price book in integer euro cents, the author, timestamp and operations. Revisions are append-only. Inserting `expectedRevision + 1` into the primary key rejects competing writers. Restoring a snapshot creates another revision. Supplements remain separate from these tables.

Administrators may save or restore; authenticated users may read and calculate. The logical backup includes `bandelle_price_revisions` and its DDL.

## Collaudo deployment

Set `DDCOST_STAGING_MIGRATE_BANDELLE_PRICES=1` only for the existing verified Collaudo service. Startup creates the table and inserts revision 1 only if absent. It checks the existing economic data before/after and verifies snapshot write/read, duplicate-revision rejection and rollback. Repeating startup preserves all saved revisions.

## Production promotion

Production is not migrated by the staging function. Before promoting this release, prepare the same table using an approved production migration, preserve an existing table and revisions, and seed an empty table with the agreed initial snapshot. Confirm whether to transfer the Collaudo price revisions or start from the original commercial tables. Back up and verify counts/digests before promotion. Do not deploy the calculator's new API dependency before its price table is ready.

## Price arithmetic

Percentages have at most two decimal places. Each operation applies to the current draft, using `round-half-up(currentCents * (10000 + basisPoints) / 10000)`. Duplicate selections are applied once per operation. The server independently applies the same operations to the expected saved revision; it never accepts arbitrary client-calculated amounts. Asymmetric Vicentine double bands continue to interpolate between the updated even-total rows.

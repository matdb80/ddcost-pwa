-- Manual migration after 0004. Run once, only when updatedAt is absent.
-- The original V3 rewrote 0004 to include this column: if that DDL was already
-- applied, verify the column definition and do not execute this ALTER again.
-- Preflight (read-only): SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
-- FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
-- AND TABLE_NAME='cycle_import_templates' AND COLUMN_NAME='updatedAt';
ALTER TABLE cycle_import_templates
 ADD COLUMN updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

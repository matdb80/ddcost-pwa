CREATE TABLE IF NOT EXISTS cycle_import_templates (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, rootId BIGINT UNSIGNED NULL, version BIGINT UNSIGNED NOT NULL,
 name VARCHAR(255) NOT NULL, family VARCHAR(64) NOT NULL, status ENUM('draft','tested','approved') NOT NULL DEFAULT 'draft',
 definitionJson MEDIUMTEXT NOT NULL, verifiedCasesJson MEDIUMTEXT NOT NULL, createdBy BIGINT UNSIGNED NOT NULL,
 validatedBy BIGINT UNSIGNED NULL, validatedAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY cycle_import_templates_root_version_uq(rootId,version),
 KEY cycle_import_templates_family_status_idx(family,status), KEY cycle_import_templates_createdBy_idx(createdBy)
);

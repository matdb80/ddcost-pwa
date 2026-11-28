-- Additive: files shared by the revisions of one quote, outside the economic JSON.
CREATE TABLE IF NOT EXISTS `quote_attachments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `rootId` bigint unsigned NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fileName` varchar(180) NOT NULL,
  `mimeType` varchar(100) NOT NULL,
  `sizeBytes` bigint unsigned NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `dataBase64` mediumtext NOT NULL,
  UNIQUE KEY `quote_attachment_content` (`rootId`, `sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Separate from DDC offer numbering. One counter shared by all product families.
CREATE TABLE IF NOT EXISTS `temporary_product_sequence` (
  `id` bigint unsigned NOT NULL PRIMARY KEY,
  `lastNumber` bigint unsigned NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `temporary_product_sequence` (`id`, `lastNumber`) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS `temporary_product_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sequence` bigint unsigned NOT NULL,
  `requestKey` varchar(36) NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `family` varchar(2) NOT NULL,
  `material` varchar(1) DEFAULT NULL,
  `color` varchar(4) DEFAULT NULL,
  `code` varchar(16) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `temporary_sequence` (`sequence`),
  UNIQUE KEY `temporary_request` (`requestKey`),
  UNIQUE KEY `temporary_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

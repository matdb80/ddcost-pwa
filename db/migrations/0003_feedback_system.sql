-- Migration: Feedback System (Registro Segnalazioni)
-- Additive only — does not modify existing economic tables
-- Apply on TiDB before deploying the new feedback features

-- Tickets table
CREATE TABLE IF NOT EXISTS `feedback_tickets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `userId` bigint unsigned NOT NULL,
  `userName` varchar(255) DEFAULT NULL,
  `userEmail` varchar(320) DEFAULT NULL,
  `ticketNumber` varchar(50) NOT NULL,
  `type` enum('bug','miglioramento','nuova_funzione') NOT NULL,
  `severity` enum('normale','bloccante') NOT NULL DEFAULT 'normale',
  `status` enum('nuova','da_pianificare','in_lavorazione','risolta_collaudo','rilasciata','duplicata','non_riproducibile') NOT NULL DEFAULT 'nuova',
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `pageRoute` varchar(255) DEFAULT NULL,
  `buildVersion` varchar(100) DEFAULT NULL,
  `cycleId` bigint unsigned DEFAULT NULL,
  `cycleRev` bigint unsigned DEFAULT NULL,
  `technicalNote` text DEFAULT NULL,
  `includeInReleaseCount` tinyint unsigned NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticketNumber` (`ticketNumber`),
  KEY `status` (`status`),
  KEY `type` (`type`),
  KEY `severity` (`severity`),
  KEY `createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attachments table (screenshots)
CREATE TABLE IF NOT EXISTS `feedback_attachments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ticketId` bigint unsigned NOT NULL,
  `mimeType` varchar(100) NOT NULL,
  `fileName` varchar(255) DEFAULT NULL,
  `sizeBytes` bigint unsigned DEFAULT NULL,
  `dataBase64` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ticketId` (`ticketId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings table (release threshold)
CREATE TABLE IF NOT EXISTS `feedback_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `releaseThreshold` bigint unsigned NOT NULL DEFAULT 10,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default threshold if table is empty
INSERT INTO `feedback_settings` (`releaseThreshold`)
SELECT 10
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `feedback_settings` LIMIT 1);

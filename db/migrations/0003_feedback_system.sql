-- DDCost feedback: additive schema, no modification of existing tables.
-- Run only on a verified staging TiDB branch before enabling API.
CREATE TABLE IF NOT EXISTS feedback_tickets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 userId BIGINT UNSIGNED NOT NULL,
 userName VARCHAR(255),
 userEmail VARCHAR(320),
 ticketNumber VARCHAR(50) NOT NULL UNIQUE,
 type ENUM('bug','miglioramento','nuova_funzione') NOT NULL,
 severity ENUM('normale','bloccante') NOT NULL DEFAULT 'normale',
 status ENUM('nuova','da_pianificare','in_lavorazione','risolta_collaudo','rilasciata','duplicata','non_riproducibile') NOT NULL DEFAULT 'nuova',
 title VARCHAR(255) NOT NULL,
 description TEXT NOT NULL,
 pageRoute VARCHAR(255),
 buildVersion VARCHAR(100),
 cycleId BIGINT UNSIGNED,
 cycleRev BIGINT UNSIGNED,
 technicalNote TEXT,
 includeInReleaseCount TINYINT UNSIGNED NOT NULL DEFAULT 1,
 KEY idx_feedback_status(status),
 KEY idx_feedback_createdAt(createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS feedback_attachments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ticketId BIGINT UNSIGNED NOT NULL,
 mimeType VARCHAR(100) NOT NULL,
 fileName VARCHAR(255),
 sizeBytes BIGINT UNSIGNED NOT NULL,
 dataBase64 MEDIUMTEXT NOT NULL,
 KEY idx_feedback_ticketId(ticketId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS feedback_settings (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 releaseThreshold BIGINT UNSIGNED NOT NULL DEFAULT 10
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO feedback_settings (releaseThreshold)
SELECT 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM feedback_settings LIMIT 1);

CREATE TABLE IF NOT EXISTS cycle_create_receipts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 userId BIGINT UNSIGNED NOT NULL,
 idempotencyKey VARCHAR(64) NOT NULL,
 payloadHash CHAR(64) NOT NULL,
 cycleId BIGINT UNSIGNED NULL,
 normalizedCode VARCHAR(255) NULL,
 status ENUM('claimed','completed') NOT NULL DEFAULT 'claimed',
 createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY cycle_create_receipts_user_key_uq(userId,idempotencyKey),
 UNIQUE KEY cycle_create_receipts_user_code_uq(userId,normalizedCode)
);

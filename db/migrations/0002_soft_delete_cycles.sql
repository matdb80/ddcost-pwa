-- Migration: Soft-delete columns on cycles table
-- Safe ALTER TABLE: adds columns with defaults, does not modify existing data
-- Apply this BEFORE using the new soft-delete features

ALTER TABLE `cycles`
  ADD COLUMN IF NOT EXISTS `deleted` tinyint unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `deletedAt` timestamp NULL DEFAULT NULL;

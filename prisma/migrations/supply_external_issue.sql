-- Strengthen the inventory ledger. Existing rows are retained as ADJUSTMENT.
ALTER TABLE `supply_adjustments`
  ADD COLUMN `movementType` VARCHAR(30) NOT NULL DEFAULT 'ADJUSTMENT' AFTER `delta`,
  ADD COLUMN `recipientName` VARCHAR(100) NULL AFTER `coordinatorName`,
  ADD COLUMN `recipientUnit` VARCHAR(150) NULL AFTER `recipientName`,
  ADD COLUMN `documentRef` VARCHAR(100) NULL AFTER `recipientUnit`,
  ADD INDEX `supply_adjustments_movementType_createdAt_idx` (`movementType`, `createdAt`);

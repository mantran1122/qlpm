-- Strengthen the inventory ledger. Existing rows are retained as ADJUSTMENT.
ALTER TABLE `supply_adjustments`
  ADD COLUMN `movementType` VARCHAR(30) NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN `recipientName` VARCHAR(100) NULL,
  ADD COLUMN `recipientUnit` VARCHAR(150) NULL,
  ADD COLUMN `documentRef` VARCHAR(100) NULL;

ALTER TABLE `supply_adjustments`
  ADD INDEX `supply_adjustments_movementType_createdAt_idx` (`movementType`, `createdAt`);

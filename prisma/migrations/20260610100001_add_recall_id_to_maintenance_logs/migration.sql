-- Migration 4: add_recall_id_to_maintenance_logs
-- Thêm cột nullable recall_record_id vào maintenance_logs

ALTER TABLE `maintenance_logs`
  ADD COLUMN `recallRecordId` INT NULL;

ALTER TABLE `maintenance_logs`
  ADD CONSTRAINT `maintenance_logs_recallRecordId_fkey`
    FOREIGN KEY (`recallRecordId`) REFERENCES `recall_records`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `maintenance_logs`
  ADD INDEX `maintenance_logs_recallRecordId_idx` (`recallRecordId`);

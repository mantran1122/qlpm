-- AlterTable
ALTER TABLE `maintenance_logs` ADD COLUMN `technicianId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

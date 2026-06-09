-- CreateTable
CREATE TABLE `technicians` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `department` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- DropForeignKey từ migration trước (trỏ sai vào users)
ALTER TABLE `maintenance_logs` DROP FOREIGN KEY `maintenance_logs_technicianId_fkey`;

-- AddForeignKey (technicianId -> technicians)
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_technicianId_fkey`
    FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

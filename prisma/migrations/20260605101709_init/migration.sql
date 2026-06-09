-- CreateTable
CREATE TABLE `floors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(10) NOT NULL,

    UNIQUE INDEX `floors_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `floorId` INTEGER NOT NULL,
    `roomCode` VARCHAR(10) NOT NULL,
    `totalMachines` INTEGER NOT NULL,
    `cpuSpec` VARCHAR(50) NULL,
    `ramSpec` VARCHAR(30) NULL,
    `diskSpec` VARCHAR(50) NULL,
    `monitorSpec` VARCHAR(30) NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `rooms_roomCode_key`(`roomCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `machineNo` INTEGER NOT NULL,
    `isTeacher` BOOLEAN NOT NULL DEFAULT false,
    `softwareError` TEXT NULL,
    `caseError` TEXT NULL,
    `cpuError` TEXT NULL,
    `ramError` TEXT NULL,
    `diskError` TEXT NULL,
    `powerError` TEXT NULL,
    `monitorError` TEXT NULL,
    `monitorCableError` TEXT NULL,
    `powerCableError` TEXT NULL,
    `mouseError` TEXT NULL,
    `networkError` TEXT NULL,
    `keyboardError` TEXT NULL,
    `extraNotes` TEXT NULL,
    `lastMaintainedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `machines_roomId_machineNo_key`(`roomId`, `machineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `software_list` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `category` ENUM('VAN_PHONG', 'DO_HOA', 'LAP_TRINH_CNTT', 'MANG', 'KE_TOAN_THONG_KE') NOT NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NULL,
    `isSupplyIntake` BOOLEAN NOT NULL DEFAULT false,
    `maintenanceDate` DATE NOT NULL,
    `caseQty` INTEGER NOT NULL DEFAULT 0,
    `cpuQty` INTEGER NOT NULL DEFAULT 0,
    `ramQty` INTEGER NOT NULL DEFAULT 0,
    `diskQty` INTEGER NOT NULL DEFAULT 0,
    `powerQty` INTEGER NOT NULL DEFAULT 0,
    `monitorQty` INTEGER NOT NULL DEFAULT 0,
    `monitorCableQty` INTEGER NOT NULL DEFAULT 0,
    `powerCableQty` INTEGER NOT NULL DEFAULT 0,
    `mouseQty` INTEGER NOT NULL DEFAULT 0,
    `networkQty` INTEGER NOT NULL DEFAULT 0,
    `keyboardQty` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `softwareErrorsBefore` INTEGER NOT NULL DEFAULT 0,
    `hardwareErrorsBefore` INTEGER NOT NULL DEFAULT 0,
    `softwareErrorsAfter` INTEGER NOT NULL DEFAULT 0,
    `hardwareErrorsAfter` INTEGER NOT NULL DEFAULT 0,
    `technician` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machines` ADD CONSTRAINT `machines_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Migration 1 (Phase A): Add device_pre_repair_status table
-- Immutable pre-repair condition records — INSERT only, no UPDATE/DELETE after creation

CREATE TABLE `device_pre_repair_status` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `machineId`     INT           NOT NULL,
  `roomId`        INT           NOT NULL,
  `machineNo`     INT           NOT NULL,
  `description`   LONGTEXT      NOT NULL,
  `reportedBy`    VARCHAR(100)  NULL,
  `reportedAt`    DATETIME(3)   NOT NULL,
  `imageUrls`     LONGTEXT      NULL,
  `technicianId`  INT           NULL,
  `createdById`   INT           NOT NULL,
  `createdAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `device_pre_repair_status_machineId_createdAt_idx` (`machineId`, `createdAt`),
  INDEX `device_pre_repair_status_roomId_createdAt_idx`    (`roomId`,    `createdAt`),
  INDEX `device_pre_repair_status_createdById_idx`         (`createdById`),

  CONSTRAINT `device_pre_repair_status_machineId_fkey`
    FOREIGN KEY (`machineId`)    REFERENCES `machines`     (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `device_pre_repair_status_roomId_fkey`
    FOREIGN KEY (`roomId`)       REFERENCES `rooms`        (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `device_pre_repair_status_technicianId_fkey`
    FOREIGN KEY (`technicianId`) REFERENCES `technicians`  (`id`) ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT `device_pre_repair_status_createdById_fkey`
    FOREIGN KEY (`createdById`)  REFERENCES `users`        (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migration 2: add_recall_records_and_alerts
-- RecallRecord và RecallAlert cho module Thu hồi – Sửa chữa

CREATE TABLE `recall_records` (
  `id`                      INT           NOT NULL AUTO_INCREMENT,
  `machineId`               INT           NOT NULL,
  `roomId`                  INT           NOT NULL,
  `machineNo`               INT           NOT NULL,
  `recallType`              ENUM('RECALL_FOR_REPAIR','RECALL_STILL_USABLE','RETURN_AFTER_REPAIR') NOT NULL,
  `complexity`              ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  `recalledById`            INT           NOT NULL,
  `recalledByTechnicianId`  INT           NULL,
  `recalledAt`              DATETIME(3)   NOT NULL,
  `repairedById`            INT           NULL,
  `repairedByTechnicianId`  INT           NULL,
  `repairStartedAt`         DATETIME(3)   NULL,
  `repairFinishedAt`        DATETIME(3)   NULL,
  `preRepairStatusId`       INT           NULL,
  `notes`                   TEXT          NULL,
  `createdAt`               DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`               DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `recall_records_machineId_createdAt_idx` (`machineId`, `createdAt`),
  INDEX `recall_records_recalledById_idx` (`recalledById`),
  INDEX `recall_records_repairedById_idx` (`repairedById`),
  INDEX `recall_records_recalledByTechnicianId_idx` (`recalledByTechnicianId`),
  INDEX `recall_records_repairedByTechnicianId_idx` (`repairedByTechnicianId`),
  INDEX `recall_records_recallType_repairFinishedAt_idx` (`recallType`, `repairFinishedAt`),
  CONSTRAINT `recall_records_machineId_fkey`              FOREIGN KEY (`machineId`)              REFERENCES `machines`(`id`)                    ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_roomId_fkey`                 FOREIGN KEY (`roomId`)                 REFERENCES `rooms`(`id`)                       ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_recalledById_fkey`           FOREIGN KEY (`recalledById`)            REFERENCES `users`(`id`)                       ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_recalledByTechnicianId_fkey` FOREIGN KEY (`recalledByTechnicianId`)  REFERENCES `technicians`(`id`)                 ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_repairedById_fkey`           FOREIGN KEY (`repairedById`)            REFERENCES `users`(`id`)                       ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_repairedByTechnicianId_fkey` FOREIGN KEY (`repairedByTechnicianId`)  REFERENCES `technicians`(`id`)                 ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT `recall_records_preRepairStatusId_fkey`      FOREIGN KEY (`preRepairStatusId`)       REFERENCES `device_pre_repair_status`(`id`)    ON DELETE SET NULL  ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recall_alerts` (
  `id`              INT         NOT NULL AUTO_INCREMENT,
  `recallRecordId`  INT         NOT NULL,
  `daysOverdue`     INT         NOT NULL,
  `sentAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dismissedAt`     DATETIME(3) NULL,
  `dismissedById`   INT         NULL,
  PRIMARY KEY (`id`),
  INDEX `recall_alerts_recallRecordId_sentAt_idx` (`recallRecordId`, `sentAt`),
  INDEX `recall_alerts_dismissedAt_idx` (`dismissedAt`),
  CONSTRAINT `recall_alerts_recallRecordId_fkey` FOREIGN KEY (`recallRecordId`) REFERENCES `recall_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `recall_alerts_dismissedById_fkey`  FOREIGN KEY (`dismissedById`)  REFERENCES `users`(`id`)          ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

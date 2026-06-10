-- Migration 3: add_tickets_and_replies
-- Hệ thống Ticker cho GUEST/KTV báo lỗi máy tính

CREATE TABLE `tickets` (
  `id`           INT           NOT NULL AUTO_INCREMENT,
  `roomId`       INT           NULL,
  `machineNo`    INT           NULL,
  `title`        VARCHAR(200)  NOT NULL,
  `description`  TEXT          NOT NULL,
  `severity`     ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `status`       ENUM('PENDING','APPROVED','REJECTED','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'PENDING',
  `isUrgent`     TINYINT(1)    NOT NULL DEFAULT 0,
  `urgentReason` TEXT          NULL,
  `imageUrls`    TEXT          NULL,
  `createdById`  INT           NOT NULL,
  `assignedToId` INT           NULL,
  `guestReadAt`  DATETIME(3)   NULL,
  `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tickets_createdById_status_idx` (`createdById`, `status`),
  INDEX `tickets_roomId_status_idx` (`roomId`, `status`),
  INDEX `tickets_status_isUrgent_createdAt_idx` (`status`, `isUrgent`, `createdAt`),
  CONSTRAINT `tickets_roomId_fkey`       FOREIGN KEY (`roomId`)       REFERENCES `rooms`(`id`)        ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT `tickets_createdById_fkey`  FOREIGN KEY (`createdById`)  REFERENCES `users`(`id`)        ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT `tickets_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL  ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ticket_replies` (
  `id`           INT           NOT NULL AUTO_INCREMENT,
  `ticketId`     INT           NOT NULL,
  `content`      TEXT          NOT NULL,
  `statusChange` ENUM('PENDING','APPROVED','REJECTED','IN_PROGRESS','RESOLVED') NULL,
  `createdById`  INT           NOT NULL,
  `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ticket_replies_ticketId_createdAt_idx` (`ticketId`, `createdAt`),
  CONSTRAINT `ticket_replies_ticketId_fkey`    FOREIGN KEY (`ticketId`)    REFERENCES `tickets`(`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `ticket_replies_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`)   ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

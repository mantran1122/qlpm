-- Migration 5: add_user_id_to_technician
-- Liên kết Technician ↔ User để resolve KTV khi login

ALTER TABLE `technicians`
  ADD COLUMN `userId` INT NULL,
  ADD UNIQUE INDEX `technicians_userId_key` (`userId`),
  ADD CONSTRAINT `technicians_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

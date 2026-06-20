-- Supply Management: SupplyItem + SupplyAdjustment tables + seed built-in items

CREATE TABLE `supply_items` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30) NOT NULL,
  `label`      VARCHAR(100) NOT NULL,
  `icon`       VARCHAR(30) NULL,
  `isBuiltin`  BOOLEAN NOT NULL DEFAULT false,
  `isActive`   BOOLEAN NOT NULL DEFAULT true,
  `sortOrder`  INT NOT NULL DEFAULT 0,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `supply_items_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `supply_adjustments` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `supplyItemId`    INT NOT NULL,
  `delta`           INT NOT NULL,
  `reason`          VARCHAR(255) NOT NULL,
  `coordinatorName` VARCHAR(80) NOT NULL,
  `note`            TEXT NULL,
  `createdById`     INT NOT NULL,
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `supply_adjustments_supplyItemId_createdAt_idx` (`supplyItemId`, `createdAt`),
  INDEX `supply_adjustments_createdById_idx` (`createdById`),
  CONSTRAINT `supply_adjustments_supplyItemId_fkey` FOREIGN KEY (`supplyItemId`) REFERENCES `supply_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `supply_adjustments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed built-in supply items (khớp với các field trong maintenance_logs)
INSERT INTO `supply_items` (`code`, `label`, `icon`, `isBuiltin`, `isActive`, `sortOrder`) VALUES
  ('caseQty',         'Vỏ máy (Case)',   'case',     true, true, 1),
  ('cpuQty',          'CPU',             'cpu',      true, true, 2),
  ('ramQty',          'RAM',             'ram',      true, true, 3),
  ('diskQty',         'Ổ cứng',          'disk',     true, true, 4),
  ('powerQty',        'Nguồn điện',      'power',    true, true, 5),
  ('monitorQty',      'Màn hình',        'screen',   true, true, 6),
  ('monitorCableQty', 'Dây màn hình',    'cable',    true, true, 7),
  ('powerCableQty',   'Dây nguồn',       'cable',    true, true, 8),
  ('mouseQty',        'Chuột',           'mouse',    true, true, 9),
  ('networkQty',      'Mạng',            'network',  true, true, 10),
  ('keyboardQty',     'Bàn phím',        'keyboard', true, true, 11);

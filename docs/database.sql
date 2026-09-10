-- ============================================
-- Shroom App 数据库结构
-- 数据库: shroom_app
-- 字符集: utf8mb4
-- 排序规则: utf8mb4_unicode_ci
-- ============================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS `shroom_app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `shroom_app`;

-- ============================================
-- 日记表 (diaries)
-- ============================================
CREATE TABLE IF NOT EXISTS `diaries` (
  `id` VARCHAR(64) NOT NULL COMMENT '日记ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `content` TEXT NOT NULL COMMENT '日记内容',
  `images` JSON COMMENT '图片URL数组，最多9张',
  `voice_url` VARCHAR(512) COMMENT '语音URL',
  `voice_duration` INT COMMENT '语音时长（秒）',
  `hour` INT COMMENT '小时（0-23），null表示整篇日记',
  `minute` INT COMMENT '分钟（0-59），null表示整篇日记',
  `type` VARCHAR(32) DEFAULT 'default' COMMENT '日记类型',
  `visibility` ENUM('PRIVATE', 'PUBLIC_ANON', 'PUBLIC_NAMED') DEFAULT 'PRIVATE' COMMENT '隐私设置',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '删除时间（软删除）',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_visibility` (`visibility`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日记表';

-- ============================================
-- 日记关联菇卡表 (diary_linked_cards)
-- ============================================
CREATE TABLE IF NOT EXISTS `diary_linked_cards` (
  `id` VARCHAR(64) NOT NULL COMMENT '关联ID',
  `diary_id` VARCHAR(64) NOT NULL COMMENT '日记ID',
  `card_id` VARCHAR(64) NOT NULL COMMENT '菇卡ID',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_diary_card` (`diary_id`, `card_id`),
  KEY `idx_diary_id` (`diary_id`),
  KEY `idx_card_id` (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日记关联菇卡表';

-- ============================================
-- 菇卡表 (shroom_cards)
-- ============================================
CREATE TABLE IF NOT EXISTS `shroom_cards` (
  `id` VARCHAR(64) NOT NULL COMMENT '菇卡ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `seed_sentence` VARCHAR(500) NOT NULL COMMENT '觉察句',
  `my_understanding` TEXT COMMENT '我的理解',
  `usage_items` JSON COMMENT '使用方法数组',
  `tags` JSON COMMENT '标签数组',
  `visibility` ENUM('PRIVATE', 'PUBLIC_ANON', 'PUBLIC_NAMED') DEFAULT 'PRIVATE' COMMENT '隐私设置',
  `practice_count` INT DEFAULT 0 COMMENT '练习次数',
  `resonance_count` INT DEFAULT 0 COMMENT '共鸣次数',
  `favorite_count` INT DEFAULT 0 COMMENT '收藏次数',
  `quote_count` INT DEFAULT 0 COMMENT '引用次数（被复制次数）',
  `last_practice_time` DATETIME NULL COMMENT '最后练习时间',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '删除时间（软删除）',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_visibility` (`visibility`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  FULLTEXT KEY `ft_seed_sentence` (`seed_sentence`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菇卡表';

-- ============================================
-- 菇卡练习记录表 (shroom_practices)
-- ============================================
CREATE TABLE IF NOT EXISTS `shroom_practices` (
  `id` VARCHAR(64) NOT NULL COMMENT '练习记录ID',
  `card_id` VARCHAR(64) NOT NULL COMMENT '菇卡ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `context` TEXT NOT NULL COMMENT '情境描述',
  `action` TEXT NOT NULL COMMENT '做了什么',
  `feeling` TEXT COMMENT '感受如何',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_card_id` (`card_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_card_created` (`card_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菇卡练习记录表';

-- ============================================
-- 菇卡共鸣表 (shroom_resonances)
-- ============================================
CREATE TABLE IF NOT EXISTS `shroom_resonances` (
  `id` VARCHAR(64) NOT NULL COMMENT '共鸣ID',
  `card_id` VARCHAR(64) NOT NULL COMMENT '菇卡ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_card_user` (`card_id`, `user_id`),
  KEY `idx_card_id` (`card_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菇卡共鸣表';

-- ============================================
-- 菇卡收藏表 (shroom_favorites)
-- ============================================
CREATE TABLE IF NOT EXISTS `shroom_favorites` (
  `id` VARCHAR(64) NOT NULL COMMENT '收藏ID',
  `card_id` VARCHAR(64) NOT NULL COMMENT '菇卡ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_card_user` (`card_id`, `user_id`),
  KEY `idx_card_id` (`card_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菇卡收藏表';

-- ============================================
-- 菇卡引用表 (shroom_quotes)
-- ============================================
CREATE TABLE IF NOT EXISTS `shroom_quotes` (
  `id` VARCHAR(64) NOT NULL COMMENT '引用ID',
  `source_card_id` VARCHAR(64) NOT NULL COMMENT '源菇卡ID（被复制的菇卡）',
  `target_card_id` VARCHAR(64) NOT NULL COMMENT '目标菇卡ID（复制后的菇卡）',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_source_card_id` (`source_card_id`),
  KEY `idx_target_card_id` (`target_card_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菇卡引用表';

-- ============================================
-- 初始化数据示例（可选）
-- ============================================

-- 注意：实际使用时需要先创建用户表，这里假设用户ID已存在

-- 示例：创建一张菇卡
-- INSERT INTO `shroom_cards` (
--   `id`, `user_id`, `seed_sentence`, `my_understanding`, 
--   `usage_items`, `tags`, `visibility`, `created_at`, `updated_at`
-- ) VALUES (
--   'card-1', 'user-1', 
--   '当别人误解我时，我其实不是在生气，而是害怕自己被抹掉。',
--   '我意识到自己很多时候的愤怒其实源于内心的恐惧，害怕自己的存在被忽视或否定。',
--   '["当感到被误解时，先深呼吸，问自己：我真正害怕的是什么？", "尝试用\\"我感到...\\"的句式表达自己的感受"]',
--   '["情绪", "关系"]',
--   'PRIVATE',
--   NOW(), NOW()
-- );

-- ============================================
-- 索引优化说明
-- ============================================
-- 1. diaries 表：
--    - idx_user_id: 按用户查询日记
--    - idx_created_at: 按时间排序
--    - idx_user_created: 按用户和时间联合查询
--    - idx_visibility: 按隐私设置筛选
--
-- 2. shroom_cards 表：
--    - idx_user_id: 按用户查询菇卡
--    - idx_created_at: 按时间排序
--    - idx_visibility: 按隐私设置筛选（用于发现广场）
--    - idx_user_created: 按用户和时间联合查询
--    - ft_seed_sentence: 全文索引，用于搜索觉察句
--
-- 3. shroom_practices 表：
--    - idx_card_id: 按菇卡查询练习记录
--    - idx_user_id: 按用户查询练习记录
--    - idx_card_created: 按菇卡和时间联合查询
--
-- 4. 关联表（resonances, favorites, quotes）：
--    - 使用唯一索引防止重复操作
--    - 使用联合索引优化查询性能

-- ============================================
-- 触发器：自动更新菇卡统计信息
-- ============================================

-- 更新练习次数和最后练习时间
DELIMITER $$
CREATE TRIGGER `trg_update_card_stats_on_practice`
AFTER INSERT ON `shroom_practices`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `practice_count` = `practice_count` + 1,
      `last_practice_time` = NEW.created_at,
      `updated_at` = NOW()
  WHERE `id` = NEW.card_id;
END$$
DELIMITER ;

-- 更新共鸣次数
DELIMITER $$
CREATE TRIGGER `trg_update_resonance_count`
AFTER INSERT ON `shroom_resonances`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `resonance_count` = `resonance_count` + 1,
      `updated_at` = NOW()
  WHERE `id` = NEW.card_id;
END$$
DELIMITER ;

-- 删除共鸣时减少计数
DELIMITER $$
CREATE TRIGGER `trg_decrease_resonance_count`
AFTER DELETE ON `shroom_resonances`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `resonance_count` = GREATEST(`resonance_count` - 1, 0),
      `updated_at` = NOW()
  WHERE `id` = OLD.card_id;
END$$
DELIMITER ;

-- 更新收藏次数
DELIMITER $$
CREATE TRIGGER `trg_update_favorite_count`
AFTER INSERT ON `shroom_favorites`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `favorite_count` = `favorite_count` + 1,
      `updated_at` = NOW()
  WHERE `id` = NEW.card_id;
END$$
DELIMITER ;

-- 删除收藏时减少计数
DELIMITER $$
CREATE TRIGGER `trg_decrease_favorite_count`
AFTER DELETE ON `shroom_favorites`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `favorite_count` = GREATEST(`favorite_count` - 1, 0),
      `updated_at` = NOW()
  WHERE `id` = OLD.card_id;
END$$
DELIMITER ;

-- 更新引用次数
DELIMITER $$
CREATE TRIGGER `trg_update_quote_count`
AFTER INSERT ON `shroom_quotes`
FOR EACH ROW
BEGIN
  UPDATE `shroom_cards`
  SET `quote_count` = `quote_count` + 1,
      `updated_at` = NOW()
  WHERE `id` = NEW.source_card_id;
END$$
DELIMITER ;



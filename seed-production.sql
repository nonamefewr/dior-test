-- ============================================
-- DIOR PLATFORM - PRODUCTION SEED SCRIPT
-- Run: mysql -h <host> -P <port> -u <user> -p dior_platform < seed-production.sql
-- ============================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ===== CLEAN =====
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE chat_messages;
TRUNCATE TABLE rate_limits;
TRUNCATE TABLE referral_codes;
TRUNCATE TABLE withdrawals;
TRUNCATE TABLE package_products;
TRUNCATE TABLE transactions;
TRUNCATE TABLE orders;
TRUNCATE TABLE user_package_progress;
TRUNCATE TABLE products;
TRUNCATE TABLE packages;
-- Keep admin (id=1), delete other users
DELETE FROM users WHERE id != 1;
SET FOREIGN_KEY_CHECKS=1;

-- ===== PACKAGES =====
INSERT INTO packages (id, name, slug, image, tier_level, min_deposit, max_orders, daily_order_limit, commission_rate, description, is_active, is_default, sort_order) VALUES
(1, 'Gian Bạc', 'bac', '', 1, 200.00, 60, 60, 0.60, 'Gian hàng Bạc - Đơn hàng giá trị thấp', 1, 1, 1),
(2, 'Gian Vàng', 'vang', '', 2, 1000.00, 80, 80, 1.20, 'Gian hàng Vàng - Đơn hàng giá trị trung bình', 1, 0, 2),
(3, 'Gian Bạch Kim', 'bach-kim', '', 3, 3000.00, 120, 120, 2.00, 'Gian hàng Bạch Kim - Đơn hàng giá trị cao', 1, 0, 3),
(4, 'Gian Kim Cương', 'kim-cuong', '', 4, 5000.00, 160, 160, 2.50, 'Gian hàng Kim Cương - Đơn hàng giá trị cao nhất', 1, 0, 4);

-- ===== PRODUCTS (26 items with Unsplash images) =====
INSERT INTO products (id, name, description, image, price, is_active, sort_order) VALUES
(1,  'Dior Sauvage EDT 60ml',       'Nước hoa nam',  'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80',  115.00,  1, 1),
(2,  'Dior Sauvage EDP 60ml',       'Nước hoa nam',  'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80',  155.00,  1, 2),
(3,  'Dior Sauvage Parfum 60ml',    'Nước hoa nam',  'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80',  185.00,  1, 3),
(4,  'J''Adore EDP 50ml',           'Nước hoa nữ',   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',   165.00,  1, 4),
(5,  'J''Adore Parfum d''Eau 50ml', 'Nước hoa nữ',   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',   175.00,  1, 5),
(6,  'Miss Dior Blooming Bouquet 50ml', 'Nước hoa nữ', 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&q=80', 145.00,  1, 6),
(7,  'Miss Dior EDP 50ml',          'Nước hoa nữ',   'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&q=80', 155.00,  1, 7),
(8,  'Dior Addict EDP 50ml',        'Nước hoa nữ',   'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80',  135.00,  1, 8),
(9,  'Dior Homme Intense 100ml',    'Nước hoa nam',  'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80',  125.00,  1, 9),
(10, 'Fahrenheit EDT 100ml',        'Nước hoa nam',  'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80',  110.00,  1, 10),
(11, 'Dior Prestige La Crème 50ml', 'Kem dưỡng da cao cấp', 'https://images.unsplash.com/photo-1617499452251-3f07bfb8d538?w=400&q=80', 350.00, 1, 11),
(12, 'Dior Prestige Le Nectar 30ml','Serum cao cấp', 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80',     420.00, 1, 12),
(13, 'Dior Capture Totale Cream 50ml','Kem dưỡng da','https://images.unsplash.com/photo-1617499452251-3f07bfb8d538?w=400&q=80',       280.00, 1, 13),
(14, 'Dior Lip Glow 001',           'Son dưỡng môi',  'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80',   42.00,   1, 14),
(15, 'Dior Rouge Dior 999',         'Son môi',        'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&q=80',   48.00,   1, 15),
(16, 'Diorshow Mascara',            'Mascara',        'https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?w=400&q=80',   38.00,   1, 16),
(17, 'Dior Backpack Canvas',        'Túi xách',       'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',   890.00,  1, 17),
(18, 'Dior Book Tote Medium',       'Túi xách',       'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&q=80', 3100.00,  1, 18),
(19, 'Dior Saddle Bag',             'Túi xách',       'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&q=80', 3900.00,  1, 19),
(20, 'Lady Dior Medium',            'Túi xách',       'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80', 6800.00,  1, 20),
(21, 'Diorama Bag',                 'Túi xách',       'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400&q=80',   4200.00,  1, 21),
(22, 'Dior Scarf Cashmere',         'Khăn quàng cashmere', 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400&q=80', 680.00, 1, 22),
(23, 'Dior Sunglasses So Straight', 'Kính mát',       'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&q=80',  520.00,  1, 23),
(24, 'Dior Monsieur Bag',           'Túi xách',       'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',   3500.00,  1, 24),
(25, 'Dior Couture Gown',           'Váy haute couture','https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80', 12000.00, 1, 25),
(26, 'Dior Haute Joaillerie Ring',  'Trang sức cao cấp','https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&q=80', 15000.00, 1, 26);

-- ===== USERS =====
-- Admin: admin / admin123
-- Test users: user1/user2/user3 / user123
UPDATE users SET email='admin@dior.vn', full_name='Admin', phone='', role='admin', balance=0.00, ref_code='00000000', is_active=1 WHERE id=1;

INSERT INTO users (id, username, email, full_name, phone, role, password_hash, balance, ref_code, is_active) VALUES
(2, 'user1', 'user1@test.vn', 'Nguyễn Văn A', '0900000001', 'user', '$2b$10$w.nC0zk1P5jkL/et9ocUnepDhp7nXsQeKOHoGmxaqOp1XV01PZ2xm', 500.00, '10000001', 1),
(3, 'user2', 'user2@test.vn', 'Trần Thị B', '0900000002', 'user', '$2b$10$w.nC0zk1P5jkL/et9ocUnepDhp7nXsQeKOHoGmxaqOp1XV01PZ2xm', 2500.00, '20000002', 1),
(4, 'user3', 'user3@test.vn', 'Lê Minh C', '0900000003', 'user', '$2b$10$w.nC0zk1P5jkL/et9ocUnepDhp7nXsQeKOHoGmxaqOp1XV01PZ2xm', 8000.00, '30000003', 1);

-- ===== USER PACKAGE PROGRESS (user2 has active Gian Bạc) =====
INSERT INTO user_package_progress (user_id, package_id, completed_orders, total_spent, status) VALUES
(3, 1, 15, 4500.00, 'active');

-- ===== SETTINGS =====
INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES
('exchange_rate', '27000', 'string', 'Tỷ giá USD/VND'),
('livechat_license', '19928399', 'string', 'LiveChat license key'),
('site_name', 'DIOR Platform', 'string', 'Tên website')
ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value);

-- ===== RESET AUTO INCREMENT =====
ALTER TABLE users AUTO_INCREMENT = 5;
ALTER TABLE packages AUTO_INCREMENT = 5;
ALTER TABLE products AUTO_INCREMENT = 27;

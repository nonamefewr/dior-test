const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Namzee@10112002',
  database: process.env.DB_NAME || 'dior_platform',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
  multipleStatements: true
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    // ===== USERS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(100) DEFAULT '',
      phone VARCHAR(20) DEFAULT '',
      role ENUM('user','admin') DEFAULT 'user',
      balance DECIMAL(12,2) DEFAULT 0.00,
      total_commission DECIMAL(12,2) DEFAULT 0.00,
      total_deposit DECIMAL(12,2) DEFAULT 0.00,
      ref_code VARCHAR(20) UNIQUE NOT NULL,
      referred_by INT DEFAULT NULL,
      active_package_id INT DEFAULT NULL,
      daily_spins_today INT DEFAULT 0,
      daily_spins_date DATE DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== PACKAGES =====
    await conn.query(`CREATE TABLE IF NOT EXISTS packages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(50) UNIQUE NOT NULL,
      image VARCHAR(500) DEFAULT '',
      tier_level INT DEFAULT 0,
      min_deposit DECIMAL(12,2) DEFAULT 0.00,
      max_orders INT DEFAULT 0,
      daily_order_limit INT DEFAULT 0,
      commission_rate DECIMAL(5,2) DEFAULT 0.00,
      description VARCHAR(1000) DEFAULT '',
      is_active TINYINT(1) DEFAULT 1,
      is_default TINYINT(1) DEFAULT 0,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== PRODUCTS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      package_id INT DEFAULT NULL,
      name VARCHAR(200) NOT NULL,
      description VARCHAR(1000) DEFAULT '',
      image VARCHAR(500) DEFAULT '',
      price DECIMAL(12,2) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== USER PACKAGE PROGRESS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS user_package_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      package_id INT NOT NULL,
      completed_orders INT DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0.00,
      status ENUM('active','completed','abandoned') DEFAULT 'active',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_active (user_id, package_id, status),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== ORDERS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_code VARCHAR(30) UNIQUE NOT NULL,
      user_id INT NOT NULL,
      package_id INT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(200) NOT NULL,
      product_image VARCHAR(500) DEFAULT '',
      product_price DECIMAL(12,2) NOT NULL,
      commission_rate DECIMAL(5,2) DEFAULT 0.00,
      commission_amount DECIMAL(12,2) DEFAULT 0.00,
      refund_amount DECIMAL(12,2) DEFAULT 0.00,
      status ENUM('pending','completed','cancelled','frozen') DEFAULT 'pending',
      balance_before DECIMAL(12,2) DEFAULT 0.00,
      balance_after DECIMAL(12,2) DEFAULT 0.00,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES packages(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== TRANSACTIONS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('deposit','withdraw','order_deduct','order_refund','commission','admin_adjust','referral_bonus','order_lock','lock_topup') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      balance_before DECIMAL(12,2) DEFAULT 0.00,
      balance_after DECIMAL(12,2) DEFAULT 0.00,
      description VARCHAR(1000) DEFAULT '',
      reference_id INT DEFAULT NULL,
      reference_type VARCHAR(30) DEFAULT '',
      status ENUM('pending','completed','failed') DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== CHAT MESSAGES =====
    await conn.query(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      sender ENUM('user','admin','system') DEFAULT 'user',
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== SETTINGS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value VARCHAR(1000) DEFAULT '',
      setting_type VARCHAR(20) DEFAULT 'string',
      description VARCHAR(1000) DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== RATE LIMITS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS rate_limits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip_address VARCHAR(45) NOT NULL,
      endpoint VARCHAR(100) NOT NULL,
      request_count INT DEFAULT 1,
      window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ip_endpoint (ip_address, endpoint),
      INDEX idx_window (window_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== MIGRATE: Add columns if missing (for existing DBs) =====
    const addColumnIfMissing = async (table, column, def) => {
      try {
        await conn.query(`SELECT ${column} FROM ${table} LIMIT 1`);
      } catch(e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
          console.log(`[DB] Added ${table}.${column}`);
        }
      }
    };

    await addColumnIfMissing('packages', 'max_orders', "INT DEFAULT 0 AFTER min_deposit");
    await addColumnIfMissing('users', 'active_package_id', "INT DEFAULT NULL AFTER referred_by");
    await addColumnIfMissing('users', 'daily_spins_today', "INT DEFAULT 0 AFTER active_package_id");
    await addColumnIfMissing('users', 'daily_spins_date', "DATE DEFAULT NULL AFTER daily_spins_today");
    await addColumnIfMissing('users', 'locked_amount', "DECIMAL(12,2) DEFAULT 0.00 AFTER balance");

    // Migrate: make products.package_id nullable (products now use junction table)
    try {
      const [col] = await conn.query("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='package_id'");
      if (col.length > 0 && col[0].IS_NULLABLE === 'NO') {
        await conn.query("ALTER TABLE products MODIFY COLUMN package_id INT DEFAULT NULL");
        console.log('[DB] Made products.package_id nullable');
      }
    } catch(e) { /* ignore */ }

    // Migrate: add new transaction types to ENUM
    try {
      await conn.query("ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit','withdraw','order_deduct','order_refund','commission','admin_adjust','referral_bonus','order_lock','lock_topup') NOT NULL");
      console.log('[DB] Updated transactions.type ENUM');
    } catch(e) { /* ignore if already updated */ }

    // ===== PACKAGE_PRODUCTS junction table (multi-package products) =====
    await conn.query(`CREATE TABLE IF NOT EXISTS package_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      package_id INT NOT NULL,
      product_id INT NOT NULL,
      sort_order INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_pkg_prod (package_id, product_id),
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ===== WITHDRAWALS =====
    await conn.query(`CREATE TABLE IF NOT EXISTS withdrawals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      method ENUM('bank','momo') NOT NULL,
      bank_name VARCHAR(100) DEFAULT '',
      account_number VARCHAR(50) DEFAULT '',
      beneficiary_name VARCHAR(100) DEFAULT '',
      momo_phone VARCHAR(20) DEFAULT '',
      amount DECIMAL(12,2) NOT NULL,
      status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
      admin_note VARCHAR(500) DEFAULT '',
      processed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    console.log('[DB] Tables initialized successfully');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };

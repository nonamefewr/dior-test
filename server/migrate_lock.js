const { pool, initDB } = require('./db');

async function migrate() {
  await initDB();
  const conn = await pool.getConnection();
  try {
    console.log('[MIGRATION] Starting lock-based gameplay migration...');

    // Check if locked_amount exists
    try {
      await conn.query('SELECT locked_amount FROM users LIMIT 1');
      console.log('[MIGRATION] locked_amount column already exists');
    } catch(e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await conn.query('ALTER TABLE users ADD COLUMN locked_amount DECIMAL(12,2) DEFAULT 0.00 AFTER balance');
        console.log('[MIGRATION] Added locked_amount to users');
      } else throw e;
    }

    // Check if package_products exists
    const [tables] = await conn.query("SHOW TABLES LIKE 'package_products'");
    if (tables.length === 0) {
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
      console.log('[MIGRATION] Created package_products table');
    } else {
      console.log('[MIGRATION] package_products table already exists');
    }

    // Migrate existing associations
    const [migrated] = await conn.query(`
      INSERT IGNORE INTO package_products (package_id, product_id, sort_order, is_active)
      SELECT package_id, id, sort_order, is_active FROM products WHERE package_id IS NOT NULL
    `);
    console.log('[MIGRATION] Migrated ' + migrated.affectedRows + ' product associations');

    // Verify
    const [count] = await conn.query('SELECT COUNT(*) as cnt FROM package_products');
    console.log('[MIGRATION] Total package_products entries: ' + count[0].cnt);
    console.log('[MIGRATION] Done!');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error('[MIGRATION ERROR]', e.message); process.exit(1); });

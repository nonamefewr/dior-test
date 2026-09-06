const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./db');

async function seed() {
  // Skip initDB if server is running (ALTER TABLE can deadlock)
  try { await initDB(); } catch(e) { console.log('[SEED] initDB skipped:', e.message); }
  const conn = await pool.getConnection();

  try {
    // ===== CLEAN DATA (order matters for foreign keys) =====
    await conn.query('DELETE FROM orders');
    await conn.query('DELETE FROM transactions');
    await conn.query('DELETE FROM user_package_progress');
    await conn.query('DELETE FROM package_products');
    await conn.query('DELETE FROM products');
    await conn.query('DELETE FROM packages');

    // ===== PACKAGES =====
    const packages = [
      { name: 'Gian hàng Bạc', slug: 'silver', image: 'https://media.christiandior.com/cdn-cgi/image/width=400,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', tier_level: 1, min_deposit: 500, max_orders: 60, daily_order_limit: 15, commission_rate: 0.6, description: 'Gian hàng Bạc - 60 đơn tổng, quay 15 lần/ngày, hoa hồng 0.6%' },
      { name: 'Gian hàng Vàng', slug: 'gold', image: 'https://media.christiandior.com/cdn-cgi/image/width=400,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', tier_level: 2, min_deposit: 1300, max_orders: 80, daily_order_limit: 20, commission_rate: 1.2, description: 'Gian hàng Vàng - 80 đơn tổng, quay 20 lần/ngày, hoa hồng 1.2%' },
      { name: 'Gian hàng Bạch Kim', slug: 'platinum', image: 'https://media.christiandior.com/cdn-cgi/image/width=400,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', tier_level: 3, min_deposit: 3000, max_orders: 120, daily_order_limit: 30, commission_rate: 2.0, description: 'Gian hàng Bạch Kim - 120 đơn tổng, quay 30 lần/ngày, hoa hồng 2%' },
      { name: 'Gian hàng Kim Cương', slug: 'diamond', image: 'https://media.christiandior.com/cdn-cgi/image/width=400,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', tier_level: 4, min_deposit: 5000, max_orders: 160, daily_order_limit: 40, commission_rate: 2.5, description: 'Gian hàng Kim Cương - 160 đơn tổng, quay 40 lần/ngày, hoa hồng 2.5%' }
    ];

    for (const p of packages) {
      await conn.query(
        `INSERT INTO packages (name,slug,image,tier_level,min_deposit,max_orders,daily_order_limit,commission_rate,description,is_active,is_default,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE max_orders=VALUES(max_orders),daily_order_limit=VALUES(daily_order_limit)`,
        [p.name, p.slug, p.image, p.tier_level, p.min_deposit, p.max_orders, p.daily_order_limit, p.commission_rate, p.description, 1, p.tier_level===1?1:0, p.tier_level]
      );
    }
    console.log('[SEED] Packages inserted');

    const [pkgs] = await conn.query('SELECT id, slug FROM packages ORDER BY tier_level');
    const pkgMap = {};
    pkgs.forEach(p => pkgMap[p.slug] = p.id);

    // ===== PRODUCTS — All prices MUST be < package min_deposit =====
    // Silver: 500, Gold: 1300, Platinum: 3000, Diamond: 5000
    // Shared products appear across tiers — their price must be < LOWEST tier's min_deposit (500)
    const allProducts = {
      silver: [
        { name: 'Petit CD Earrings', description: 'Bông tai Petit CD mạ vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 120 },
        { name: 'Dior Oblique Wallet', description: 'Ví gập Dior Oblique canvas', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 180 },
        { name: 'Dior Camp Box Bag', description: 'Túi xách Dior Camp Box mini', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 220 },
        { name: 'Dior-ID Loafer', description: 'Giày lười Dior-ID da bê', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 260 },
        { name: 'CD Navy Belt', description: 'Thắt lưng CD Navy', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 350 },
        { name: 'Dior Pocket Square', description: 'Khăng pocket square lụa', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 280 },
        { name: 'CD Charm Bracelet', description: 'Vòng tay charm CD', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 300 },
        { name: 'Dior Canvas Tote', description: 'Túi tote canvas Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 250 },
      ],
      gold: [
        { name: 'B30 Sneaker', description: 'Giày thể thao B30 futuristic', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 450 },
        { name: 'Lady Dior Medium', description: 'Túi Lady Dior da lộn', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 850 },
        { name: 'Diorcamp Backpack', description: 'Ba lô Diorcamp Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 780 },
        { name: 'CD Icon Bracelet', description: 'Vòng tay CD Icon vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 650 },
        { name: 'Saddle Bag', description: 'Túi Saddle Bag da bê', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 950 },
        { name: 'Dior ID Sneaker Low', description: 'Giày thể thao ID Low', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 580 },
        { name: 'CD Diamond Ring', description: 'Nhẫn CD Diamond mạ vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 1100 },
        { name: 'Dior Visor Hat', description: 'Mũ visor Dior Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 420 },
      ],
      platinum: [
        { name: 'Aristo-Punk Collection', description: 'BST Aristo-Punk Limited', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 1800 },
        { name: 'Lady Dior Medium Bag', description: 'Túi Lady Dior da cao cấp', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 2200 },
        { name: 'Book Tote Embroidered', description: 'Túi Book Tote thêu tay', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 2000 },
        { name: 'Dior Couture Jacket', description: 'Áo khoác couture Dior', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 2500 },
        { name: 'Rose des Vents Necklace', description: 'Dây chuyền Rose des Vents', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 1950 },
        { name: 'Dior Camp Trench', description: 'Áo trench Dior Camp', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 2800 },
        { name: 'CD High-Top Sneaker', description: 'Giày cao cổ CD Premium', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 1600 },
        { name: 'Dior Oblique Belt Bag', description: 'Túi đeo eo Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 1400 },
      ],
      diamond: [
        { name: 'Lady Dior Ultra-Matte', description: 'Túi Lady Dior Ultra-Matte Limited', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 3200 },
        { name: 'Dior Haute Joaillerie', description: 'Trang sức Haute Joaillerie', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 4200 },
        { name: 'Aristo-Punk VIP Set', description: 'BST VIP Aristo-Punk full set', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 3800 },
        { name: 'Dior Couture Gown', description: 'Váy couture Dior handmade', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 4800 },
        { name: 'Book Tote Large Oblique', description: 'Túi Book Tote Large premium', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 3500 },
        { name: 'CD Diamond Earrings', description: 'Bông tai CD Diamond 18K', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 4500 },
        { name: 'Dior Pearl Clutch', description: 'Clutch Dior ngọc trai', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 2800 },
        { name: 'Rose des Vents Tiara', description: 'Vương miện Rose des Vents', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 4600 },
      ]
    };

    // Insert all products (independent, no package_id FK)
    const allProductRows = {};
    for (const [slug, products] of Object.entries(allProducts)) {
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const [result] = await conn.query(
          'INSERT INTO products (name,description,image,price,is_active,sort_order) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),price=VALUES(price),image=VALUES(image)',
          [p.name, p.description, p.image, p.price, 1, i+1]
        );
        if (!allProductRows[p.name]) allProductRows[p.name] = result.insertId;
      }
    }
    console.log('[SEED] Products inserted (' + Object.keys(allProductRows).length + ' unique)');

    // Junction table: map products to packages (some products shared across packages)
    const sharedProducts = ['Dior Oblique Wallet', 'CD Charm Bracelet', 'Dior Canvas Tote', 'B30 Sneaker', 'Saddle Bag'];
    const pkgProductMap = {};
    for (const [slug, products] of Object.entries(allProducts)) {
      const pkgId = pkgMap[slug];
      if (!pkgId) continue;
      pkgProductMap[pkgId] = [];
      for (let i = 0; i < products.length; i++) {
        const pid = allProductRows[products[i].name];
        if (pid) pkgProductMap[pkgId].push({ pid, sort: i+1 });
      }
    }
    // Add shared products to higher-tier packages if not already present
    for (const spName of sharedProducts) {
      const spId = allProductRows[spName];
      if (!spId) continue;
      const currentPkgs = Object.entries(pkgProductMap).filter(([,prods]) => prods.some(p => p.pid === spId)).map(([pid]) => parseInt(pid));
      const allPkgIds = Object.keys(pkgMap).map(k => pkgMap[k]);
      for (const pkgId of allPkgIds) {
        if (!currentPkgs.includes(pkgId) && currentPkgs.length > 0 && pkgId > Math.min(...currentPkgs)) {
          const maxSort = Math.max(...(pkgProductMap[pkgId] || []).map(p => p.sort), 0);
          if (!pkgProductMap[pkgId]) pkgProductMap[pkgId] = [];
          pkgProductMap[pkgId].push({ pid: spId, sort: maxSort + 1 });
        }
      }
    }
    // Write junction table
    for (const [pkgId, prods] of Object.entries(pkgProductMap)) {
      for (const { pid, sort } of prods) {
        await conn.query(
          'INSERT INTO package_products (package_id, product_id, sort_order, is_active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)',
          [pkgId, pid, sort]
        );
      }
    }
    console.log('[SEED] Package-products junction table populated');

    // ===== ADMIN USER =====
    const adminHash = await bcrypt.hash('admin123', 12);
    await conn.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, ref_code, balance)
       VALUES ('admin','admin@dior.com',?,'Admin Dior','admin','DIOR000000',0)
       ON DUPLICATE KEY UPDATE role='admin'`,
      [adminHash]
    );
    console.log('[SEED] Admin user: admin / admin123');

    // ===== SEED USERS (DELETE first to ensure fresh passwords) =====
    const userHash = await bcrypt.hash('user123', 12);
    const seedUsernames = ['dior_member1', 'dior_member2', 'dior_member3'];
    // Delete old seed users and their data
    for (const uname of seedUsernames) {
      const [existing] = await conn.query('SELECT id FROM users WHERE username=?', [uname]);
      if (existing.length > 0) {
        const uid = existing[0].id;
        await conn.query('DELETE FROM orders WHERE user_id=?', [uid]);
        await conn.query('DELETE FROM user_package_progress WHERE user_id=?', [uid]);
        await conn.query('DELETE FROM transactions WHERE user_id=?', [uid]);
        await conn.query('DELETE FROM users WHERE id=?', [uid]);
      }
    }
    const seedUsers = [
      { username: 'dior_member1', email: 'member1@dior.com', full_name: 'Nguyễn Văn A', phone: '0357545147', balance: 600 },
      { username: 'dior_member2', email: 'member2@dior.com', full_name: 'Trần Thị B', phone: '0901234567', balance: 1500 },
      { username: 'dior_member3', email: 'member3@dior.com', full_name: 'Lê Hoàng C', phone: '0912345678', balance: 3500 },
    ];
    for (const u of seedUsers) {
      const ref = 'DIOR' + Math.random().toString(36).substring(2,8).toUpperCase();
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, phone, role, ref_code, balance, active_package_id, total_deposit)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [u.username, u.email, userHash, u.full_name, u.phone, 'user', ref, u.balance, null, u.balance]
      );
    }
    console.log('[SEED] Users seeded (password: user123 for all)');

    // ===== SETTINGS =====
    const settings = [
      { key: 'site_name', value: 'DIOR Distribution', desc: 'Tên website' },
      { key: 'min_deposit', value: '500', desc: 'Số tiền nạp tối thiểu' },
      { key: 'referral_bonus_rate', value: '1', desc: '% hoa hồng giới thiệu' },
      { key: 'maintenance_mode', value: '0', desc: 'Chế độ bảo trì' },
      { key: 'support_hours', value: '09:00-21:00', desc: 'Giờ hỗ trợ' },
    ];
    for (const s of settings) {
      await conn.query('INSERT INTO settings (setting_key,setting_value,description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [s.key, s.value, s.desc]);
    }
    console.log('[SEED] Settings inserted');

    console.log('\n[SEED] Done!');
    console.log('  Admin: admin / admin123');
    console.log('  Users: dior_member1, dior_member2, dior_member3 / user123');
    console.log('  Packages: Bạc(60đơn,15/ngày,deposit≥500), Vàng(80,20,≥1300), Bạch Kim(120,30,≥3000), Kim Cương(160,40,≥5000)');
    console.log('  All product prices are under their package min_deposit');
  } catch(e) {
    console.error('[SEED ERROR]', e.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();

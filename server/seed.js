const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./db');

async function seed() {
  await initDB();
  const conn = await pool.getConnection();

  try {
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

    // ===== PRODUCTS (more per package for variety) =====
    const allProducts = {
      silver: [
        { name: 'Petit CD Earrings', description: 'Bông tai Petit CD mạ vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 520 },
        { name: 'Dior Oblique Wallet', description: 'Ví gập Dior Oblique canvas', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 850 },
        { name: 'Dior Camp Box Bag', description: 'Túi xách Dior Camp Box mini', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 780 },
        { name: 'Dior-ID Loafer', description: 'Giày lười Dior-ID da bê', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 920 },
        { name: 'CD Navy Belt', description: 'Thắt lưng CD Navy', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 680 },
        { name: 'Dior Pocket Square', description: 'Khăng pocket square lụa', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 280 },
        { name: 'CD Charm Bracelet', description: 'Vòng tay charm CD', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 450 },
        { name: 'Dior Canvas Tote', description: 'Túi tote canvas Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 1200 },
      ],
      gold: [
        { name: 'B30 Sneaker', description: 'Giày thể thao B30 futuristic', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 1190 },
        { name: 'Lady Dior Medium', description: 'Túi Lady Dior da lộn', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 1650 },
        { name: 'Diorcamp Backpack', description: 'Ba lô Diorcamp Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 1480 },
        { name: 'CD Icon Bracelet', description: 'Vòng tay CD Icon vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 1350 },
        { name: 'Saddle Bag', description: 'Túi Saddle Bag da bê', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 1520 },
        { name: 'Dior ID Sneaker Low', description: 'Giày thể thao ID Low', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 1050 },
        { name: 'CD Diamond Ring', description: 'Nhẫn CD Diamond mạ vàng', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 1800 },
        { name: 'Dior Visor Hat', description: 'Mũ visor Dior Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 680 },
      ],
      platinum: [
        { name: 'Aristo-Punk Collection', description: 'BST Aristo-Punk Limited', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 2400 },
        { name: 'Lady Dior Medium Bag', description: 'Túi Lady Dior da cao cấp', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 3200 },
        { name: 'Book Tote Embroidered', description: 'Túi Book Tote thêu tay', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 2800 },
        { name: 'Dior Couture Jacket', description: 'Áo khoác couture Dior', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 3500 },
        { name: 'Rose des Vents Necklace', description: 'Dây chuyền Rose des Vents', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 2900 },
        { name: 'Dior Camp Trench', description: 'Áo trench Dior Camp', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 4200 },
        { name: 'CD High-Top Sneaker', description: 'Giày cao cổ CD Premium', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 1950 },
        { name: 'Dior Oblique Belt Bag', description: 'Túi đeo eo Oblique', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 2100 },
      ],
      diamond: [
        { name: 'Lady Dior Ultra-Matte', description: 'Túi Lady Dior Ultra-Matte Limited', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 5200 },
        { name: 'Dior Haute Joaillerie', description: 'Trang sức Haute Joaillerie', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 8500 },
        { name: 'Aristo-Punk VIP Set', description: 'BST VIP Aristo-Punk full set', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 6800 },
        { name: 'Dior Couture Gown', description: 'Váy couture Dior handmade', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1512_1512252-g2i4ddehcf-whr.jpg', price: 9500 },
        { name: 'Book Tote Large Oblique', description: 'Túi Book Tote Large premium', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1466_1466064-s4a1n2ckvm-whr.jpg', price: 5800 },
        { name: 'CD Diamond Earrings', description: 'Bông tai CD Diamond 18K', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1514_1514418-6jt6rewwyu-whr.jpg', price: 7200 },
        { name: 'Dior Pearl Clutch', description: 'Clutch Dior ngọc trai', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1482_1482012-2gcasr37p4-whr.jpg', price: 4800 },
        { name: 'Rose des Vents Tiara', description: 'Vương miện Rose des Vents', image: 'https://media.christiandior.com/cdn-cgi/image/width=300,format=auto,quality=80/pm_11872_1513_1513971-bqrgyq54xy-whr.jpg', price: 12000 },
      ]
    };

    // Clear catalog assignments and products before rebuilding the deterministic sample catalog.
    await conn.query('DELETE FROM package_products');
    await conn.query('DELETE FROM products');

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
      // Find which package(s) this product belongs to
      const currentPkgs = Object.entries(pkgProductMap).filter(([,prods]) => prods.some(p => p.pid === spId)).map(([pid]) => parseInt(pid));
      const allPkgIds = Object.keys(pkgMap).map(k => pkgMap[k]);
      // Add to next tier up if not already there
      for (const pkgId of allPkgIds) {
        if (!currentPkgs.includes(pkgId) && currentPkgs.length > 0 && pkgId > Math.min(...currentPkgs)) {
          const maxSort = Math.max(...pkgProductMap[pkgId].map(p => p.sort), 0);
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

    // ===== SEED USERS =====
    const userHash = await bcrypt.hash('user123', 12);
    const seedUsers = [
      { username: 'dior_member1', email: 'member1@dior.com', full_name: 'Nguyễn Văn A', phone: '0357545147', balance: 600, package_slug: 'silver' },
      { username: 'dior_member2', email: 'member2@dior.com', full_name: 'Trần Thị B', phone: '0901234567', balance: 1500, package_slug: 'gold' },
      { username: 'dior_member3', email: 'member3@dior.com', full_name: 'Lê Hoàng C', phone: '0912345678', balance: 3500, package_slug: 'platinum' },
    ];

    for (const u of seedUsers) {
      const ref = 'DIOR' + Math.random().toString(36).substring(2,8).toUpperCase();
      const pkgId = pkgMap[u.package_slug] || null;
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, phone, role, ref_code, balance, active_package_id, total_deposit)
         VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE balance=VALUES(balance),total_deposit=VALUES(total_deposit)`,
        [u.username, u.email, userHash, u.full_name, u.phone, 'user', ref, u.balance, null, u.balance]
      );
      // Wipe dữ liệu game cũ để seed luôn cho state sạch (chơi lại từ đầu)
      const [existing] = await conn.query('SELECT id FROM users WHERE username=?', [u.username]);
      if (existing.length > 0) {
        const uid = existing[0].id;
        await conn.query('DELETE FROM orders WHERE user_id=?', [uid]);
        await conn.query('DELETE FROM user_package_progress WHERE user_id=?', [uid]);
        await conn.query('DELETE FROM transactions WHERE user_id=?', [uid]);
        await conn.query('UPDATE users SET active_package_id=NULL, daily_spins_today=0, daily_spins_date=NULL WHERE id=?', [uid]);
      }
    }
    console.log('[SEED] Users seeded (password: user123 for all) — dữ liệu game cũ đã được xóa');

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
    console.log('  Packages: Bạc(60đơn,15/ngày), Vàng(80,20), Bạch Kim(120,30), Kim Cương(160,40)');
  } catch(e) {
    console.error('[SEED ERROR]', e.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();

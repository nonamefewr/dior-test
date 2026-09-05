const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
// Trust proxy (required for rate-limit behind Render/Nginx)
app.set('trust proxy', 1);
const JWT_SECRET = process.env.JWT_SECRET || 'dior_platform_secret_2026_deploy';
const JWT_EXPIRES = '7d';
// Chế độ test: chỉ bật khi TEST_MODE=1 (VD: TEST_MODE=1 node server.js). Production phải để trống.
const TEST_MODE = process.env.TEST_MODE === '1';

// Simple in-memory cache (TTL-based)
const memCache = new Map();
function cacheGet(key) {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { memCache.delete(key); return null; }
  return e.val;
}
function cacheSet(key, val, ttlMs = 30000) {
  memCache.set(key, { val, exp: Date.now() + ttlMs });
}

// ==================== SECURITY ====================
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

const ipLimiter = rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 900000, max: 20, message: { error: 'Quá nhiều lần đăng nhập' } });
const apiLimiter = rateLimit({ windowMs: 60000, max: 30, message: { error: 'API rate limit exceeded' } });
app.use('/api/', ipLimiter);

// ==================== AUTH MIDDLEWARE ====================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ success: false, error: 'Token không hợp lệ' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Không có quyền' });
  next();
}

// ==================== HELPERS ====================
function generateRefCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'DIOR';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateOrderCode() {
  const d = new Date();
  const ds = d.getFullYear().toString() + (d.getMonth()+1).toString().padStart(2,'0') + d.getDate().toString().padStart(2,'0');
  return 'UB' + ds + Math.floor(Math.random() * 9000 + 1000);
}

function success(data = null, msg = '') {
  const r = { success: true };
  if (data !== null) r.data = data;
  if (msg) r.message = msg;
  return r;
}
function fail(msg = 'Lỗi') { return { success: false, error: msg }; }
function capLimit(val, max = 100) { return Math.min(Math.max(parseInt(val) || 20, 1), max); }

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, full_name, phone, ref_code } = req.body;
    if (!username || !email || !password) return res.status(400).json(fail('Thiếu thông tin bắt buộc'));
    if (username.length < 3 || username.length > 50) return res.status(400).json(fail('Tên đăng nhập 3-50 ký tự'));
    if (password.length < 6) return res.status(400).json(fail('Mật khẩu tối thiểu 6 ký tự'));

    const [existing] = await pool.query('SELECT id FROM users WHERE username=? OR email=?', [sanitize(username), sanitize(email)]);
    if (existing.length > 0) return res.status(400).json(fail('Tên đăng nhập hoặc email đã tồn tại'));

    const hash = await bcrypt.hash(password, 10);
    const ref = generateRefCode();
    let referredBy = null;
    if (ref_code) {
      const [referrer] = await pool.query('SELECT id FROM users WHERE ref_code=?', [sanitize(ref_code)]);
      if (referrer.length > 0) referredBy = referrer[0].id;
    }

    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name, phone, ref_code, referred_by) VALUES (?,?,?,?,?,?,?)',
      [sanitize(username), sanitize(email), hash, sanitize(full_name||''), sanitize(phone||''), ref, referredBy]
    );

    const token = jwt.sign({ id: result.insertId, username: sanitize(username), role: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json(success({ token, user: { id: result.insertId, username: sanitize(username), email: sanitize(email), role: 'user', ref_code: ref, balance: 0 } }));
  } catch(e) {
    console.error('[REGISTER]', e.message);
    res.status(500).json(fail('Lỗi server'));
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json(fail('Thiếu thông tin đăng nhập'));

    const [rows] = await pool.query('SELECT * FROM users WHERE username=? OR email=?', [sanitize(login), sanitize(login)]);
    if (rows.length === 0) return res.status(401).json(fail('Sai tài khoản hoặc mật khẩu'));

    const user = rows[0];
    if (!user.is_active) return res.status(403).json(fail('Tài khoản đã bị khóa'));

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json(fail('Sai tài khoản hoặc mật khẩu'));

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json(success({
      token,
      user: {
        id: user.id, username: user.username, email: user.email,
        full_name: user.full_name, phone: user.phone, role: user.role,
        balance: user.balance, total_commission: user.total_commission,
        ref_code: user.ref_code, active_package_id: user.active_package_id,
        daily_spins_today: user.daily_spins_today, test_mode: TEST_MODE
      }
    }));
  } catch(e) {
    console.error('[LOGIN]', e.message);
    res.status(500).json(fail('Lỗi server'));
  }
});

// Public settings endpoint (exchange rate)
app.get('/api/settings/public', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, setting_value FROM settings WHERE setting_key='exchange_rate'");
    res.json(success({ exchange_rate: rows.length > 0 ? parseFloat(rows[0].setting_value) : 27000 }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id,username,email,full_name,phone,role,balance,locked_amount,total_commission,
      total_deposit,ref_code,active_package_id,daily_spins_today,daily_spins_date,is_active,created_at
      FROM users WHERE id=?`, [req.user.id]);
    if (rows.length === 0) return res.status(404).json(fail('Không tìm thấy'));
    const user = rows[0];
    // Get active package progress
    let progress = null;
    if (user.active_package_id) {
      const [prog] = await pool.query('SELECT * FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active"', [user.id, user.active_package_id]);
      if (prog.length > 0) progress = prog[0];
    }
    res.json(success({ ...user, test_mode: TEST_MODE, package_progress: progress }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== USER PROFILE ====================
app.put('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const { full_name, phone, email } = req.body;
    const updates = [];
    const params = [];
    if (full_name !== undefined) { updates.push('full_name=?'); params.push(sanitize(full_name)); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(sanitize(phone)); }
    if (email !== undefined) {
      // Check email uniqueness
      const [existing] = await pool.query('SELECT id FROM users WHERE email=? AND id!=?', [sanitize(email), req.user.id]);
      if (existing.length > 0) return res.status(400).json(fail('Email đã được sử dụng'));
      updates.push('email=?'); params.push(sanitize(email));
    }
    if (updates.length === 0) return res.status(400).json(fail('Không có gì để cập nhật'));
    params.push(req.user.id);
    await pool.query('UPDATE users SET ' + updates.join(',') + ' WHERE id=?', params);
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/user/password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json(fail('Thiếu mật khẩu'));
    if (new_password.length < 6) return res.status(400).json(fail('Mật khẩu mới tối thiểu 6 ký tự'));

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json(fail('Mật khẩu hiện tại không đúng'));

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    res.json(success(null, 'Đã đổi mật khẩu'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== PACKAGES ====================
app.get('/api/packages', authMiddleware, async (req, res) => {
  try {
    const cached = cacheGet('packages_list');
    if (cached) return res.json(success(cached));
    const [packages] = await pool.query(
      `SELECT p.*, COUNT(DISTINCT pp.product_id) as product_count
       FROM packages p
       LEFT JOIN package_products pp ON p.id = pp.package_id AND pp.is_active=1
       LEFT JOIN products pr ON pp.product_id = pr.id AND pr.is_active=1
       WHERE p.is_active=1
       GROUP BY p.id ORDER BY p.tier_level ASC`
    );
    cacheSet('packages_list', packages, 60000);
    res.json(success(packages));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.get('/api/packages/:id/products', authMiddleware, async (req, res) => {
  try {
    const [products] = await pool.query('SELECT pr.* FROM products pr JOIN package_products pp ON pr.id=pp.product_id WHERE pp.package_id=? AND pp.is_active=1 AND pr.is_active=1 ORDER BY pp.sort_order ASC', [req.params.id]);
    res.json(success(products));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.get('/api/user/packages', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool.query('SELECT active_package_id, total_deposit, balance, locked_amount FROM users WHERE id=?', [req.user.id]);
    if (user.length === 0) return res.status(404).json(fail('Không tìm thấy'));

    // Single query: packages + product counts + user progress
    const [packages] = await pool.query(
      `SELECT p.*,
        COUNT(DISTINCT pp.product_id) as product_count,
        upp.completed_orders as prog_completed, upp.total_spent as prog_spent, upp.status as prog_status
       FROM packages p
       LEFT JOIN package_products pp ON p.id = pp.package_id AND pp.is_active=1
       LEFT JOIN products pr ON pp.product_id = pr.id AND pr.is_active=1
       LEFT JOIN user_package_progress upp ON upp.package_id = p.id AND upp.user_id = ?
       WHERE p.is_active=1
       GROUP BY p.id ORDER BY p.tier_level ASC`, [req.user.id]
    );

    const result = packages.map(p => ({
      ...p,
      is_unlocked: parseFloat(user[0].total_deposit) >= parseFloat(p.min_deposit),
      is_current: user[0].active_package_id === p.id,
      locked_amount: parseFloat(user[0].locked_amount || 0),
      progress: p.prog_status ? {
        completed_orders: p.prog_completed,
        total_spent: p.prog_spent,
        status: p.prog_status
      } : null
    }));
    res.json(success(result));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.post('/api/user/select-package', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { package_id } = req.body;
    const [pkg] = await conn.query('SELECT * FROM packages WHERE id=? AND is_active=1', [package_id]);
    if (pkg.length === 0) return res.status(404).json(fail('Gian hàng không tồn tại'));

    const [user] = await conn.query('SELECT * FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    if (parseFloat(user[0].total_deposit) < parseFloat(pkg[0].min_deposit)) {
      return res.status(400).json(fail('Chưa đủ điều kiện nạp tối thiểu $' + pkg[0].min_deposit));
    }

    // Check if user already has an active (incomplete) package
    if (user[0].active_package_id && user[0].active_package_id !== parseInt(package_id)) {
      const [activeProg] = await conn.query(
        'SELECT * FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active"',
        [req.user.id, user[0].active_package_id]
      );
      if (activeProg.length > 0) {
        const [pkg2] = await conn.query('SELECT name,max_orders FROM packages WHERE id=?', [user[0].active_package_id]);
        return res.status(400).json(fail('Bạn chưa hoàn thành gian hàng ' + (pkg2[0]?.name||'') + ' (' + activeProg[0].completed_orders + '/' + pkg2[0]?.max_orders + ' đơn)'));
      }
    }

    // Check if already completed this package
    const [completedProg] = await conn.query(
      'SELECT id FROM user_package_progress WHERE user_id=? AND package_id=? AND status="completed"',
      [req.user.id, package_id]
    );
    if (completedProg.length > 0) {
      // Production: mỗi gian hàng chỉ chơi 1 lần. TEST_MODE: cho chơi lại từ đầu.
      if (!TEST_MODE) return res.status(400).json(fail('Bạn đã hoàn thành gian hàng này rồi'));
      await conn.query('DELETE FROM user_package_progress WHERE user_id=? AND package_id=?', [req.user.id, package_id]);
      await conn.query('DELETE FROM orders WHERE user_id=? AND package_id=?', [req.user.id, package_id]);
      await conn.query('DELETE FROM transactions WHERE user_id=? AND reference_type=\'package\' AND reference_id=?', [req.user.id, completedProg[0].id]);
    }
    // TEST_MODE: dọn progress cũ bị bỏ (abandoned) để không dính UNIQUE KEY khi insert lại
    if (TEST_MODE) {
      await conn.query('DELETE FROM user_package_progress WHERE user_id=? AND package_id=? AND status="abandoned"', [req.user.id, package_id]);
    }

    // Create or reactivate progress
    await conn.query(
      `INSERT INTO user_package_progress (user_id, package_id, completed_orders, status)
       VALUES (?, ?, 0, 'active')
       ON DUPLICATE KEY UPDATE status='active', completed_orders=0, total_spent=0`,
      [req.user.id, package_id]
    );

    // Move the package minimum from available balance into the lock.
    // Total balance stays unchanged; only the available portion decreases.
    const currentBalance = parseFloat(user[0].balance || 0);
    const currentLock = Math.max(0, parseFloat(user[0].locked_amount || 0));
    const availableBalance = Math.max(0, currentBalance - currentLock);
    const requiredLock = parseFloat(pkg[0].min_deposit || 0);
    if (availableBalance < requiredLock) {
      return res.status(400).json(fail('Số dư khả dụng không đủ để khóa tối thiểu $' + requiredLock.toFixed(2)));
    }
    const initialLock = currentLock + requiredLock;
    await conn.query('UPDATE users SET active_package_id=?, daily_spins_today=0, locked_amount=? WHERE id=?', [package_id, initialLock, req.user.id]);
    if (requiredLock > 0) {
      await conn.query('INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description,reference_type) VALUES (?,?,?,?,?,?,?)', [req.user.id,'lock_topup',requiredLock,currentBalance,currentBalance,'Khóa tiền tối thiểu gian hàng','package']);
    }
    await conn.commit();
    res.json(success(null, 'Đã chọn gian hàng ' + pkg[0].name));
  } catch(e) {
    await conn.rollback();
    console.error('[SELECT-PKG]', e.message);
    res.status(500).json(fail('Lỗi server'));
  } finally { conn.release(); }
});

// ==================== ORDER ROUTES (NEW SPIN LOGIC) ====================
app.get('/api/user/orders', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    let query = 'SELECT * FROM orders WHERE user_id=?';
    const params = [req.user.id];
    if (status && status !== 'all') { query += ' AND status=?'; params.push(status); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [orders] = await pool.query(query, params);
    const [countQ] = await pool.query('SELECT COUNT(*) as total FROM orders WHERE user_id=?' + (status && status!=='all' ? ' AND status=?' : ''),
      status && status!=='all' ? [req.user.id, status] : [req.user.id]);
    res.json(success({ orders, total: countQ[0].total, page: parseInt(page), limit: safeLimit }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// SPIN — reveal a pending order; financial/progress updates happen on distribution
app.post('/api/orders/spin', authMiddleware, apiLimiter, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query('SELECT * FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const user = users[0];
    if (!user.active_package_id) return res.status(400).json(fail('Chưa chọn gian hàng'));
    const [pkg] = await conn.query('SELECT * FROM packages WHERE id=? AND is_active=1', [user.active_package_id]);
    if (!pkg.length) return res.status(400).json(fail('Gian hàng không tồn tại'));
    const [progressRows] = await conn.query('SELECT * FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active" FOR UPDATE', [req.user.id, user.active_package_id]);
    if (!progressRows.length) return res.status(400).json(fail('Không có tiến trình gian hàng'));
    const progress = progressRows[0];
    const [pending] = await conn.query('SELECT id FROM orders WHERE user_id=? AND package_id=? AND status="pending" LIMIT 1 FOR UPDATE', [req.user.id, user.active_package_id]);
    if (pending.length) return res.status(400).json(fail('Vui lòng phân phối đơn hiện tại trước khi quay tiếp'));
    if (progress.completed_orders >= pkg[0].max_orders) return res.status(400).json(fail('Đã hoàn thành gian hàng này'));
    // Use MySQL CURDATE() for daily spin check to avoid UTC/local timezone mismatch
    const [[mysqlToday]] = await conn.query('SELECT CURDATE() as today');
    const todayMySQL = mysqlToday.today instanceof Date ? mysqlToday.today.toISOString().slice(0,10) : String(mysqlToday.today);
    const dailySpins = user.daily_spins_date === todayMySQL ? user.daily_spins_today : 0;
    if (dailySpins >= pkg[0].daily_order_limit) return res.status(400).json(fail('Đã hết lượt quay hôm nay (' + pkg[0].daily_order_limit + ' lần/ngày)'));
    const [products] = await conn.query('SELECT pr.* FROM products pr JOIN package_products pp ON pr.id=pp.product_id WHERE pp.package_id=? AND pp.is_active=1 AND pr.is_active=1 ORDER BY pp.sort_order ASC', [user.active_package_id]);
    if (!products.length) return res.status(400).json(fail('Gian hàng chưa có sản phẩm'));
    const product = products[progress.completed_orders % products.length];
    const price = parseFloat(product.price);
    const locked = Math.max(0, parseFloat(user.locked_amount || 0));
    const available = Math.max(0, parseFloat(user.balance || 0) - locked);
    // The lock covers the order. Only a shortfall may be funded from available balance.
    if (locked < price) {
      const needed = price - locked;
      if (!req.body?.auto_topup || available < needed) {
        return res.status(400).json({ success:false, error:'Số dư khả dụng không đủ cho đơn hàng này', need_topup:true, topup_amount:needed, locked_amount:locked, price_required:price, available_balance:available });
      }
      // The order shortfall increases the reserved amount, but does not
      // deduct the account's total balance. The available balance is derived
      // as balance - locked_amount, so it decreases by the shortfall only.
      const newBalance = parseFloat(user.balance);
      const newLocked = locked + needed;
      await conn.query('UPDATE users SET locked_amount=? WHERE id=?', [newLocked, req.user.id]);
      await conn.query('INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description,reference_type) VALUES (?,?,?,?,?,?,?)', [req.user.id,'lock_topup',needed,newBalance,newBalance,'Bổ sung tiền khóa cho đơn hàng','lock']);
      user.balance = newBalance;
      user.locked_amount = newLocked;
    }
    const code = generateOrderCode();
    const rate = parseFloat(pkg[0].commission_rate);
    const commission = price * rate / 100;
    const [order] = await conn.query(`INSERT INTO orders (order_code,user_id,package_id,product_id,product_name,product_image,product_price,commission_rate,commission_amount,refund_amount,status,balance_before,balance_after) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [code,req.user.id,user.active_package_id,product.id,product.name,product.image,price,rate,commission,price,'pending',user.balance,user.balance]);
    await conn.commit();
    const currentLocked = Math.max(0, parseFloat(user.locked_amount || 0));
    res.json(success({order_id:order.insertId,order_code:code,product:{id:product.id,name:product.name,image:product.image,price:product.price,description:product.description},balance:parseFloat(user.balance),balance_after:Math.max(0,parseFloat(user.balance)-currentLocked),locked_amount:currentLocked,commission_added:0,daily_spins_remaining:pkg[0].daily_order_limit-dailySpins,progress:{completed:progress.completed_orders,total:pkg[0].max_orders,percent:Math.round(progress.completed_orders/pkg[0].max_orders*100)},is_package_complete:false,distribution_pending:true}));
  } catch(e) { await conn.rollback(); console.error('[SPIN]',e.message); res.status(500).json(fail('Lỗi server')); }
  finally { conn.release(); }
});

// DISTRIBUTE — commit one pending order and update lock, commission, progress, and spin count
app.post('/api/orders/:id/distribute', authMiddleware, apiLimiter, async (req,res) => {
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users]=await conn.query('SELECT * FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    const [orders]=await conn.query('SELECT * FROM orders WHERE id=? AND user_id=? AND status="pending" FOR UPDATE',[req.params.id,req.user.id]);
    if(!orders.length) return res.status(404).json(fail('Không tìm thấy đơn chờ phân phối'));
    const order=orders[0];
    const [progRows]=await conn.query('SELECT * FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active" FOR UPDATE',[req.user.id,order.package_id]);
    if(!progRows.length) return res.status(400).json(fail('Không có tiến trình gian hàng'));
    const progress=progRows[0];
    const [pkg]=await conn.query('SELECT * FROM packages WHERE id=?',[order.package_id]);
    const beforeLock=Math.max(0,parseFloat(users[0].locked_amount||0));
    // Tính lại hoa hồng nếu đơn cũ có commission_amount = 0
    let commissionAmount=parseFloat(order.commission_amount || 0);
    if (commissionAmount === 0 && pkg.length > 0) {
      const rate = parseFloat(pkg[0].commission_rate || 0);
      commissionAmount = parseFloat(order.product_price || 0) * rate / 100;
      // Cập nhật lại commission_amount trong order
      await conn.query('UPDATE orders SET commission_amount=?, commission_rate=? WHERE id=?', [commissionAmount, rate, order.id]);
    }
    const newLock=beforeLock+commissionAmount;
    // Commission is paid by the platform: increase total balance and lock by
    // the same amount, so the user's available balance remains unchanged.
    const beforeBalance=parseFloat(users[0].balance || 0);
    const newBalance=beforeBalance+commissionAmount;
    const [[mysqlToday2]] = await conn.query('SELECT CURDATE() as today');
    const todayMySQL2 = mysqlToday2.today instanceof Date ? mysqlToday2.today.toISOString().slice(0,10) : String(mysqlToday2.today);
    const used=users[0].daily_spins_date===todayMySQL2?users[0].daily_spins_today:0;
    const completed=progress.completed_orders+1;
    await conn.query('UPDATE users SET balance=?,locked_amount=?,daily_spins_today=?,daily_spins_date=? WHERE id=?',[newBalance,newLock,used+1,todayMySQL2,req.user.id]);
    await conn.query('UPDATE user_package_progress SET completed_orders=?,total_spent=total_spent+? WHERE id=?',[completed,order.product_price,progress.id]);
    await conn.query('UPDATE orders SET status="completed",completed_at=NOW(),balance_before=?,balance_after=? WHERE id=?',[beforeBalance,newBalance,order.id]);
    await conn.query('INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description,reference_id,reference_type) VALUES (?,?,?,?,?,?,?,?)',[req.user.id,'commission',commissionAmount,beforeBalance,newBalance,'Cộng hoa hồng đơn: '+order.product_name,order.id,'order']);
    await conn.commit();
    res.json(success({order_code:order.order_code,balance:newBalance,balance_after:Math.max(0,newBalance-newLock),locked_amount:newLock,commission_added:commissionAmount,daily_spins_remaining:pkg[0].daily_order_limit-(used+1),progress:{completed,total:pkg[0].max_orders,percent:Math.round(completed/pkg[0].max_orders*100)},is_package_complete:completed>=pkg[0].max_orders}));
  } catch(e){await conn.rollback();console.error('[DISTRIBUTE]',e.message);res.status(500).json(fail('Lỗi server'));} finally{conn.release();}
});

// COMPLETE PACKAGE — release locked money + commission to balance
app.post('/api/orders/complete-package', authMiddleware, apiLimiter, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query('SELECT * FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const user = users[0];
    if (!user.active_package_id) return res.status(400).json(fail('Chưa chọn gian hàng'));

    const [pkg] = await conn.query('SELECT * FROM packages WHERE id=?', [user.active_package_id]);
    if (pkg.length === 0) return res.status(400).json(fail('Gian hàng không tồn tại'));

    const [progRows] = await conn.query(
      'SELECT * FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active" FOR UPDATE',
      [req.user.id, user.active_package_id]
    );
    if (progRows.length === 0) return res.status(400).json(fail('Không có tiến trình'));
    const progress = progRows[0];

    if (progress.completed_orders < pkg[0].max_orders) {
      return res.status(400).json(fail('Chưa hoàn thành đủ đơn (' + progress.completed_orders + '/' + pkg[0].max_orders + ')'));
    }

    // Calculate total commission from completed orders in this package
    const [orderStats] = await conn.query(
      `SELECT COALESCE(SUM(product_price),0) as total_spent, COALESCE(SUM(commission_amount),0) as total_commission
       FROM orders WHERE user_id=? AND package_id=? AND status='completed'`,
      [req.user.id, user.active_package_id]
    );
    const totalSpent = parseFloat(orderStats[0].total_spent);
    const totalCommission = parseFloat(orderStats[0].total_commission);
    const lockedAmount = parseFloat(user.locked_amount || 0);
    const currentBalance = parseFloat(user.balance || 0);

    // Lock chỉ là "reservation" — tiền đã nằm trong balance từ distribute.
    // Complete-package chỉ cần clear lock, balance KHÔNG thay đổi.
    const newLocked = 0;
    await conn.query(
      `UPDATE users SET locked_amount=0, total_commission=total_commission+? WHERE id=?`,
      [totalCommission, req.user.id]
    );

    // Mark progress as completed
    await conn.query("UPDATE user_package_progress SET status='completed', completed_at=NOW() WHERE id=?", [progress.id]);

    // Log transactions
    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id, reference_type) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, 'unlock', lockedAmount, currentBalance, currentBalance, 'Giải phóng khóa gian hàng ' + pkg[0].name, progress.id, 'package']
    );

    // Referral bonus
    if (user.referred_by) {
      const refBonus = totalCommission * 0.01;
      if (refBonus > 0) {
        await conn.query('UPDATE users SET balance=balance+? WHERE id=?', [refBonus, user.referred_by]);
      }
    }

    // Clear active package
    await conn.query('UPDATE users SET active_package_id=NULL WHERE id=?', [req.user.id]);

    await conn.commit();
    res.json(success({
      package_name: pkg[0].name,
      total_spent: totalSpent,
      commission_earned: totalCommission,
      released_locked: lockedAmount,
      balance_after: currentBalance,
      locked_amount: newLocked,
      available_balance: currentBalance
    }));
  } catch(e) {
    await conn.rollback();
    console.error('[COMPLETE-PKG]', e.message);
    res.status(500).json(fail('Lỗi server'));
  } finally { conn.release(); }
});


// TOPUP LOCK — add funds to locked amount when insufficient for next spin
app.post('/api/user/topup-lock', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { amount } = req.body;
    const topupAmount = parseFloat(amount);
    if (!topupAmount || topupAmount <= 0) return res.status(400).json(fail('Số tiền không hợp lệ'));

    const [users] = await conn.query('SELECT * FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const user = users[0];
    const availableBalance = parseFloat(user.balance) - parseFloat(user.locked_amount || 0);

    if (availableBalance < topupAmount) {
      return res.status(400).json(fail('Số dư khả dụng không đủ ($' + availableBalance.toFixed(2) + ')'));
    }

    // Move money from available balance into locked_amount; total balance is unchanged.
    const newBalance = parseFloat(user.balance);
    const newLocked = parseFloat(user.locked_amount || 0) + topupAmount;

    await conn.query('UPDATE users SET locked_amount=? WHERE id=?', [newLocked, req.user.id]);

    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id, reference_type) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, 'lock_topup', topupAmount, user.balance, newBalance, 'Nạp thêm vào khóa gian hàng', null, 'lock']
    );

    await conn.commit();
    res.json(success({
      locked_amount: newLocked,
      available_balance: newBalance - newLocked,
      message: 'Đã nạp thêm $' + topupAmount.toFixed(2) + ' vào tiền khóa'
    }));
  } catch(e) {
    await conn.rollback();
    console.error('[TOPUP-LOCK]', e.message);
    res.status(500).json(fail('Lỗi server'));
  } finally { conn.release(); }
});

// ==================== TEST RESET (chỉ hoạt động khi TEST_MODE=1) ====================
app.post('/api/user/reset-test', authMiddleware, (req, res, next) => {
  if (!TEST_MODE) return res.status(404).json(fail('Không tìm thấy tài nguyên'));
  next();
}, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Reset tiến trình + lượt quay, KHÔI PHỤC số dư về total_deposit để test lại từ đầu
      await conn.query('UPDATE users SET active_package_id=NULL, daily_spins_today=0, daily_spins_date=NULL, balance=total_deposit, locked_amount=0 WHERE id=?', [req.user.id]);
      await conn.query('DELETE FROM user_package_progress WHERE user_id=?', [req.user.id]);
      await conn.query('DELETE FROM orders WHERE user_id=?', [req.user.id]);
      await conn.query('DELETE FROM transactions WHERE user_id=? AND type=\'order_deduct\'', [req.user.id]);
      await conn.query('DELETE FROM withdrawals WHERE user_id=? AND status=\'pending\'', [req.user.id]);
      const [after] = await conn.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
      await conn.commit();
      res.json(success({ message: 'Đã reset dữ liệu test', balance: after[0].balance }));
    } catch(e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== WITHDRAWAL ROUTES ====================

// User: tạo lệnh rút tiền
app.post('/api/user/withdraw', authMiddleware, async (req, res) => {
  try {
    const { method, bank_name, account_number, beneficiary_name, momo_phone, amount, amount_vnd } = req.body;
    if (!method || !['bank','momo'].includes(method)) return res.status(400).json(fail('Phương thức không hợp lệ'));

    // Support both $ and VNĐ input — always store as $
    let withdrawAmount;
    if (amount_vnd && !amount) {
      // VNĐ input — convert to $
      const [rateRows] = await pool.query("SELECT setting_value FROM settings WHERE setting_key='exchange_rate'");
      const rate = rateRows.length > 0 ? parseFloat(rateRows[0].setting_value) : 27000;
      withdrawAmount = parseFloat(amount_vnd) / rate;
    } else {
      withdrawAmount = parseFloat(amount);
    }
    if (!withdrawAmount || withdrawAmount <= 0) return res.status(400).json(fail('Số tiền phải lớn hơn 0'));

    // Validate required fields per method
    if (method === 'bank') {
      if (!bank_name || !account_number || !beneficiary_name) {
        return res.status(400).json(fail('Vui lòng nhập đầy đủ: tên ngân hàng, số tài khoản, tên thụ hưởng'));
      }
    }
    if (method === 'momo') {
      if (!momo_phone) return res.status(400).json(fail('Vui lòng nhập số điện thoại MoMo'));
    }

    // Check available balance
    const [users] = await pool.query('SELECT balance, locked_amount, is_active FROM users WHERE id=?', [req.user.id]);
    if (!users.length) return res.status(404).json(fail('Không tìm thấy tài khoản'));
    if (!users[0].is_active) return res.status(403).json(fail('Tài khoản đang bị khóa'));
    const avail = Math.max(0, parseFloat(users[0].balance) - parseFloat(users[0].locked_amount || 0));
    if (withdrawAmount > avail) return res.status(400).json(fail('Số dư không đủ. Khả dụng: $' + avail.toFixed(2)));

    // Check pending withdrawals
    const [pending] = await pool.query('SELECT id FROM withdrawals WHERE user_id=? AND status=\'pending\'', [req.user.id]);
    if (pending.length > 0) return res.status(400).json(fail('Bạn đã có lệnh rút đang chờ xử lý'));

    const [result] = await pool.query(
      'INSERT INTO withdrawals (user_id, method, bank_name, account_number, beneficiary_name, momo_phone, amount) VALUES (?,?,?,?,?,?,?)',
      [req.user.id, method, bank_name||'', account_number||'', beneficiary_name||'', momo_phone||'', withdrawAmount]
    );

    res.json(success({ id: result.insertId, message: 'Lệnh rút đã được gửi, chờ admin phê duyệt' }));
  } catch(e) { res.status(500).json(fail('Lỗi server: ' + e.message)); }
});

// User: lịch sử rút tiền
app.get('/api/user/withdrawals', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    const [rows] = await pool.query(
      'SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, safeLimit, (parseInt(page)-1)*safeLimit]
    );
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM withdrawals WHERE user_id=?', [req.user.id]);
    res.json(success({ withdrawals: rows, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// User: hủy lệnh rút (chỉ khi đang pending)
app.post('/api/user/withdrawals/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM withdrawals WHERE id=? AND user_id=? AND status=\'pending\'', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json(fail('Không tìm thấy lệnh rút hoặc đã xử lý'));
    await pool.query('UPDATE withdrawals SET status=\'cancelled\' WHERE id=?', [req.params.id]);
    res.json(success({ message: 'Đã hủy lệnh rút' }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== USER ROUTES ====================
app.get('/api/user/transactions', authMiddleware, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    let query = 'SELECT * FROM transactions WHERE user_id=?';
    const params = [req.user.id];
    if (type) { query += ' AND type=?'; params.push(type); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [txns] = await pool.query(query, params);
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM transactions WHERE user_id=?' + (type ? ' AND type=?' : ''), type ? [req.user.id, type] : [req.user.id]);
    res.json(success({ transactions: txns, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.get('/api/user/stats', authMiddleware, async (req, res) => {
  try {
    // Parallel independent queries
    const [todayStats, totalStats, user, vip] = await Promise.all([
      pool.query(`SELECT COUNT(*) as orders, COALESCE(SUM(commission_amount),0) as commission FROM orders WHERE user_id=? AND DATE(created_at)=CURDATE()`, [req.user.id]),
      pool.query(`SELECT COUNT(*) as orders, COALESCE(SUM(commission_amount),0) as commission FROM orders WHERE user_id=? AND status='completed'`, [req.user.id]),
      pool.query('SELECT active_package_id, daily_spins_today, daily_spins_date, balance, locked_amount FROM users WHERE id=?', [req.user.id]),
      pool.query('SELECT MAX(p.tier_level) as max_tier FROM user_package_progress upp JOIN packages p ON upp.package_id=p.id WHERE upp.user_id=? AND upp.status="completed"', [req.user.id])
    ]);

    let dailyLimit = 0, dailyRemaining = 0, packageName = '', completedInPkg = 0, totalInPkg = 0, pkgCompleted = false;
    if (user[0][0].active_package_id) {
      const [[pkg]] = await pool.query('SELECT name, daily_order_limit, max_orders FROM packages WHERE id=?', [user[0][0].active_package_id]);
      if (pkg) {
        dailyLimit = pkg.daily_order_limit;
        packageName = pkg.name;
        totalInPkg = pkg.max_orders;
        const dailyUsed = user[0][0].daily_spins_date === new Date().toISOString().slice(0,10) ? user[0][0].daily_spins_today : 0;
        dailyRemaining = dailyLimit - dailyUsed;
        const [prog] = await pool.query('SELECT completed_orders, status FROM user_package_progress WHERE user_id=? AND package_id=? AND status="active"', [req.user.id, user[0][0].active_package_id]);
        if (prog.length > 0) {
          completedInPkg = prog[0].completed_orders;
          pkgCompleted = prog[0].completed_orders >= pkg.max_orders;
        }
      }
    }

    const u = user[0][0];
    res.json(success({
      today_orders: todayStats[0][0].orders,
      today_commission: todayStats[0][0].commission,
      total_orders: totalStats[0][0].orders,
      total_commission: totalStats[0][0].commission,
      daily_limit: dailyLimit,
      daily_remaining: dailyRemaining,
      active_package: packageName,
      completed_in_package: completedInPkg,
      total_in_package: totalInPkg,
      package_completed: pkgCompleted,
      highest_vip: vip[0][0].max_tier || 0,
      balance: parseFloat(u.balance || 0),
      locked_amount: parseFloat(u.locked_amount || 0),
      available_balance: Math.max(0, parseFloat(u.balance || 0) - parseFloat(u.locked_amount || 0))
    }));
  } catch(e) { console.error('[STATS]', e.message); res.status(500).json(fail('Lỗi server')); }
});

// ==================== USER CHAT ====================
app.get('/api/user/chat', authMiddleware, async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;
    let query = 'SELECT * FROM chat_messages WHERE user_id=?';
    const params = [req.user.id];
    if (before) { query += ' AND id<?'; params.push(parseInt(before)); }
    query += ' ORDER BY id DESC LIMIT ?';
    params.push(parseInt(limit));
    const [msgs] = await pool.query(query, params);
    res.json(success(msgs.reverse()));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const cached = cacheGet('admin_stats');
    if (cached) return res.json(success(cached));
    const [[users],[orders],[completedOrders],[totalDeposit],[packages],[todayOrders],[todayCommission],[pendingOrders]] = await Promise.all([
      pool.query('SELECT COUNT(*) as cnt FROM users WHERE role="user"'),
      pool.query('SELECT COUNT(*) as cnt FROM orders'),
      pool.query('SELECT COUNT(*) as cnt, COALESCE(SUM(commission_amount),0) as comm FROM orders WHERE status="completed"'),
      pool.query('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type="deposit" AND status="completed"'),
      pool.query('SELECT COUNT(*) as cnt FROM packages WHERE is_active=1'),
      pool.query('SELECT COUNT(*) as cnt FROM orders WHERE DATE(created_at)=CURDATE()'),
      pool.query('SELECT COALESCE(SUM(commission_amount),0) as total FROM orders WHERE status="completed" AND DATE(completed_at)=CURDATE()'),
      pool.query('SELECT COUNT(*) as cnt FROM orders WHERE status="pending"')
    ]);
    const result = {
      total_users: users[0].cnt, total_orders: orders[0].cnt,
      completed_orders: completedOrders[0].cnt, total_commission: completedOrders[0].comm,
      total_deposits: totalDeposit[0].total, active_packages: packages[0].cnt,
      today_orders: todayOrders[0].cnt, today_commission: todayCommission[0].total,
      pending_orders: pendingOrders[0].cnt
    };
    cacheSet('admin_stats', result, 15000);
    res.json(success(result));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin profile
app.get('/api/admin/profile', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,username,email,full_name,phone,role FROM users WHERE id=?', [req.user.id]);
    res.json(success(rows[0]));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/profile', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { full_name, phone, email, current_password, new_password, username } = req.body;
    const updates = [];
    const params = [];
    if (full_name !== undefined) { updates.push('full_name=?'); params.push(sanitize(full_name)); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(sanitize(phone)); }
    if (username !== undefined) {
      const [existing] = await pool.query('SELECT id FROM users WHERE username=? AND id!=?', [sanitize(username), req.user.id]);
      if (existing.length > 0) return res.status(400).json(fail('Username đã tồn tại'));
      updates.push('username=?'); params.push(sanitize(username));
    }
    if (email !== undefined) {
      const [existing] = await pool.query('SELECT id FROM users WHERE email=? AND id!=?', [sanitize(email), req.user.id]);
      if (existing.length > 0) return res.status(400).json(fail('Email đã tồn tại'));
      updates.push('email=?'); params.push(sanitize(email));
    }
    if (new_password) {
      if (!current_password) return res.status(400).json(fail('Nhập mật khẩu hiện tại'));
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
      const valid = await bcrypt.compare(current_password, rows[0].password_hash);
      if (!valid) return res.status(400).json(fail('Mật khẩu hiện tại không đúng'));
      const hash = await bcrypt.hash(new_password, 12);
      updates.push('password_hash=?'); params.push(hash);
    }
    if (updates.length === 0) return res.status(400).json(fail('Không có gì để cập nhật'));
    params.push(req.user.id);
    await pool.query('UPDATE users SET ' + updates.join(',') + ' WHERE id=?', params);
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: change own password
app.put('/api/admin/change-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json(fail('Thiếu thông tin'));
    if (new_password.length < 6) return res.status(400).json(fail('Mật khẩu mới tối thiểu 6 ký tự'));
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json(fail('Mật khẩu hiện tại không đúng'));
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    res.json(success(null, 'Đã đổi mật khẩu'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: deposit to user
app.post('/api/admin/users/:id/deposit', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json(fail('Số tiền không hợp lệ'));
    const targetId = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT balance FROM users WHERE id=? AND role="user"', [targetId]);
    if (!rows.length) return res.status(404).json(fail('Không tìm thấy người dùng'));
    const before = parseFloat(rows[0].balance);
    const after = before + amt;
    await pool.query('UPDATE users SET balance=?, total_deposit=total_deposit+? WHERE id=?', [after, amt, targetId]);
    await pool.query(
      'INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description) VALUES (?,\'admin_adjust\',?,?,?,?)',
      [targetId, amt, before, after, description || 'Admin nạp tiền']
    );
    res.json(success({ balance: after }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: withdraw from user
app.post('/api/admin/users/:id/withdraw', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json(fail('Số tiền không hợp lệ'));
    const targetId = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT balance, locked_amount FROM users WHERE id=? AND role="user"', [targetId]);
    if (!rows.length) return res.status(404).json(fail('Không tìm thấy người dùng'));
    const balance = parseFloat(rows[0].balance);
    const locked = parseFloat(rows[0].locked_amount || 0);
    const available = Math.max(0, balance - locked);
    if (amt > available) return res.status(400).json(fail('Số dư khả dụng không đủ ($' + available.toFixed(2) + ')'));
    const after = balance - amt;
    await pool.query('UPDATE users SET balance=? WHERE id=?', [after, targetId]);
    await pool.query(
      'INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description) VALUES (?,\'admin_adjust\',?,?,?,?)',
      [targetId, -amt, balance, after, description || 'Admin trừ tiền']
    );
    res.json(success({ balance: after }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: get user transactions
app.get('/api/admin/users/:id/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    let query = 'SELECT * FROM transactions WHERE user_id=?';
    const params = [req.params.id];
    if (type && type !== 'all') { query += ' AND type=?'; params.push(type); }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const [txns] = await pool.query(query, params);
    res.json(success(txns));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: get user orders
app.get('/api/admin/users/:id/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const [orders] = await pool.query('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ?', [req.params.id, parseInt(limit)]);
    res.json(success(orders));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Users (exclude admin role from list)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    let query = `SELECT u.*, p.name as package_name FROM users u LEFT JOIN packages p ON u.active_package_id=p.id WHERE u.role='user'`;
    const params = [];
    if (search) { query += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)'; const s = '%'+sanitize(search)+'%'; params.push(s,s,s); }
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [users] = await pool.query(query, params);
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM users WHERE role="user"' + (search ? ' AND (username LIKE ? OR email LIKE ? OR full_name LIKE ?)' : ''),
      search ? ['%'+sanitize(search)+'%','%'+sanitize(search)+'%','%'+sanitize(search)+'%'] : []);
    const safe = users.map(u => { const {password_hash, ...rest} = u; return rest; });
    res.json(success({ users: safe, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email, full_name, phone, password, balance } = req.body;
    if (!username || !email || !password) return res.status(400).json(fail('Thiếu thông tin bắt buộc'));
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (username,email,password_hash,full_name,phone,role,ref_code,balance,total_deposit,is_active) VALUES (?,?,?,?,?,'user',?,?,?,?,1)`,
      [sanitize(username), sanitize(email), hash, sanitize(full_name||''), sanitize(phone||''), 'DIOR'+Math.random().toString(36).substring(2,8).toUpperCase(), parseFloat(balance)||0, parseFloat(balance)||0]
    );
    if (parseFloat(balance) > 0) {
      await pool.query(
        'INSERT INTO transactions (user_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,\'Admin tạo tài khoản\')',
        [result.insertId, 'admin_adjust', parseFloat(balance), 0, parseFloat(balance)]
      );
    }
    res.json(success({ id: result.insertId }, 'Đã tạo người dùng'));
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json(fail('Username hoặc email đã tồn tại'));
    res.status(500).json(fail('Lỗi server'));
  }
});

app.get('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query(`SELECT u.*, p.name as package_name FROM users u LEFT JOIN packages p ON u.active_package_id=p.id WHERE u.id=?`, [req.params.id]);
    if (users.length === 0) return res.status(404).json(fail('Không tìm thấy'));
    const {password_hash, ...safe} = users[0];
    res.json(success(safe));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { full_name, phone, email, balance, is_active, active_package_id } = req.body;
    const updates = [];
    const params = [];
    if (full_name !== undefined) { updates.push('full_name=?'); params.push(sanitize(full_name)); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(sanitize(phone)); }
    if (email !== undefined) { updates.push('email=?'); params.push(sanitize(email)); }
    if (is_active !== undefined) { updates.push('is_active=?'); params.push(is_active ? 1 : 0); }
    if (active_package_id !== undefined) { updates.push('active_package_id=?'); params.push(active_package_id || null); }
    if (balance !== undefined) {
      const targetId = parseInt(req.params.id, 10);
      if (targetId === req.user.id) return res.status(400).json(fail('Không thể tự chỉnh sửa số dư tài khoản của mình'));
      const [current] = await pool.query('SELECT balance FROM users WHERE id=?', [targetId]);
      const beforeBalance = current.length ? parseFloat(current[0].balance || 0) : 0;
      const afterBalance = parseFloat(balance);
      updates.push('balance=?');
      params.push(afterBalance);
      if (afterBalance !== beforeBalance) {
        await pool.query(
          'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) VALUES (?,\'admin_adjust\',?,?,?,\'Admin cập nhật số dư\')',
          [targetId, afterBalance - beforeBalance, beforeBalance, afterBalance]
        );
      }
    }
    if (updates.length === 0) return res.status(400).json(fail('Không có gì để cập nhật'));
    params.push(req.params.id);
    await pool.query('UPDATE users SET ' + updates.join(',') + ' WHERE id=?', params);
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Packages CRUD
app.get('/api/admin/packages', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [pkgs] = await pool.query(
      `SELECT p.*,
        COUNT(DISTINCT pp.product_id) as product_count,
        COUNT(DISTINCT u.id) as user_count
       FROM packages p
       LEFT JOIN package_products pp ON p.id = pp.package_id AND pp.is_active=1
       LEFT JOIN products pr ON pp.product_id = pr.id AND pr.is_active=1
       LEFT JOIN users u ON u.active_package_id = p.id
       GROUP BY p.id ORDER BY p.tier_level ASC`
    );
    res.json(success(pkgs));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.post('/api/admin/packages', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, slug, image, tier_level, min_deposit, max_orders, daily_order_limit, commission_rate, description, is_active, is_default, sort_order } = req.body;
    if (!name || !slug) return res.status(400).json(fail('Thiếu tên hoặc slug'));
    const [result] = await pool.query(
      `INSERT INTO packages (name,slug,image,tier_level,min_deposit,max_orders,daily_order_limit,commission_rate,description,is_active,is_default,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sanitize(name), sanitize(slug), sanitize(image||''), tier_level||0, min_deposit||0, max_orders||0, daily_order_limit||0, commission_rate||0,
       sanitize(description||''), is_active!==undefined?(is_active?1:0):1, is_default?1:0, sort_order||0]
    );
    res.json(success({ id: result.insertId }, 'Đã tạo gói'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, slug, image, tier_level, min_deposit, max_orders, daily_order_limit, commission_rate, description, is_active, is_default, sort_order } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name=?'); params.push(sanitize(name)); }
    if (slug !== undefined) { updates.push('slug=?'); params.push(sanitize(slug)); }
    if (image !== undefined) { updates.push('image=?'); params.push(sanitize(image)); }
    if (tier_level !== undefined) { updates.push('tier_level=?'); params.push(tier_level); }
    if (min_deposit !== undefined) { updates.push('min_deposit=?'); params.push(parseFloat(min_deposit)); }
    if (max_orders !== undefined) { updates.push('max_orders=?'); params.push(parseInt(max_orders)); }
    if (daily_order_limit !== undefined) { updates.push('daily_order_limit=?'); params.push(parseInt(daily_order_limit)); }
    if (commission_rate !== undefined) { updates.push('commission_rate=?'); params.push(parseFloat(commission_rate)); }
    if (description !== undefined) { updates.push('description=?'); params.push(sanitize(description)); }
    if (is_active !== undefined) { updates.push('is_active=?'); params.push(is_active ? 1 : 0); }
    if (is_default !== undefined) { updates.push('is_default=?'); params.push(is_default ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order=?'); params.push(sort_order); }
    if (updates.length === 0) return res.status(400).json(fail('Không có gì để cập nhật'));
    params.push(req.params.id);
    await pool.query('UPDATE packages SET ' + updates.join(',') + ' WHERE id=?', params);
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.delete('/api/admin/packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE packages SET is_active=0 WHERE id=?', [req.params.id]);
    res.json(success(null, 'Đã ẩn gói'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Products CRUD
// ===== ADMIN PRODUCTS (junction table based) =====
app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { package_id } = req.query;
    let query, params = [];
    if (package_id) {
      query = 'SELECT pr.*, pp.sort_order as pkg_sort, pp.is_active as pkg_active, pk.name as package_name FROM products pr JOIN package_products pp ON pr.id=pp.product_id JOIN packages pk ON pp.package_id=pk.id WHERE pp.package_id=? ORDER BY pp.sort_order ASC';
      params = [package_id];
    } else {
      query = 'SELECT pr.*, GROUP_CONCAT(DISTINCT pk.name SEPARATOR ", ") as package_names, GROUP_CONCAT(DISTINCT pp.package_id) as package_ids FROM products pr LEFT JOIN package_products pp ON pr.id=pp.product_id LEFT JOIN packages pk ON pp.package_id=pk.id GROUP BY pr.id ORDER BY pr.sort_order ASC';
    }
    const [products] = await pool.query(query, params);
    res.json(success(products));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, image, price, sort_order, package_ids } = req.body;
    if (!name || !price) return res.status(400).json(fail('Thiếu thông tin bắt buộc'));
    const [result] = await pool.query(
      'INSERT INTO products (name,description,image,price,sort_order,is_active) VALUES (?,?,?,?,?,1)',
      [sanitize(name), sanitize(description||''), sanitize(image||''), parseFloat(price), sort_order||0]
    );
    const productId = result.insertId;
    if (Array.isArray(package_ids) && package_ids.length > 0) {
      for (const pid of package_ids) {
        await pool.query(
          'INSERT INTO package_products (package_id, product_id, sort_order, is_active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)',
          [pid, productId, sort_order || 0]
        );
      }
    }
    res.json(success({ id: productId }, 'Đã thêm sản phẩm'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, image, price, is_active, sort_order, package_ids } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name=?'); params.push(sanitize(name)); }
    if (description !== undefined) { updates.push('description=?'); params.push(sanitize(description)); }
    if (image !== undefined) { updates.push('image=?'); params.push(sanitize(image)); }
    if (price !== undefined) { updates.push('price=?'); params.push(parseFloat(price)); }
    if (is_active !== undefined) { updates.push('is_active=?'); params.push(is_active ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order=?'); params.push(sort_order); }
    if (updates.length > 0) {
      params.push(req.params.id);
      await pool.query('UPDATE products SET ' + updates.join(',') + ' WHERE id=?', params);
    }
    if (Array.isArray(package_ids)) {
      await pool.query('DELETE FROM package_products WHERE product_id=?', [req.params.id]);
      for (let i = 0; i < package_ids.length; i++) {
        await pool.query(
          'INSERT INTO package_products (package_id, product_id, sort_order, is_active) VALUES (?,?,?,1)',
          [package_ids[i], req.params.id, sort_order || i + 1]
        );
      }
    }
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
    await pool.query('UPDATE package_products SET is_active=0 WHERE product_id=?', [req.params.id]);
    res.json(success(null, 'Đã ẩn sản phẩm'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ===== ADMIN: Sort products within a package =====
app.put('/api/admin/products-sort', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { package_id, product_orders } = req.body;
    if (!package_id || !Array.isArray(product_orders)) return res.status(400).json(fail('Thiếu thông tin'));
    for (const item of product_orders) {
      await pool.query('UPDATE package_products SET sort_order=? WHERE package_id=? AND product_id=?',
        [item.sort_order, package_id, item.product_id]);
    }
    res.json(success(null, 'Đã cập nhật thứ tự'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ===== ADMIN: Assign product to multiple packages =====
app.post('/api/admin/products/:id/assign', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { package_ids } = req.body;
    if (!Array.isArray(package_ids)) return res.status(400).json(fail('Thiếu danh sách gian hàng'));
    await pool.query('DELETE FROM package_products WHERE product_id=?', [req.params.id]);
    for (let i = 0; i < package_ids.length; i++) {
      await pool.query(
        'INSERT INTO package_products (package_id, product_id, sort_order, is_active) VALUES (?,?,?,1)',
        [package_ids[i], req.params.id, i + 1]
      );
    }
    res.json(success(null, 'Đã gắn sản phẩm vào gian hàng'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ADMIN: Batch assign products to a package
app.post('/api/admin/products/assign-batch', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { package_id, product_ids } = req.body;
    if (!package_id || !Array.isArray(product_ids)) return res.status(400).json(fail('Thiếu thông tin'));
    const [existing] = await pool.query('SELECT product_id FROM package_products WHERE package_id=?', [package_id]);
    const existingIds = new Set(existing.map(r => r.product_id));
    let count = 0;
    for (const pid of product_ids) {
      if (existingIds.has(pid)) continue;
      const [maxRow] = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 as nextSort FROM package_products WHERE package_id=?', [package_id]);
      await pool.query(
        'INSERT INTO package_products (package_id, product_id, sort_order, is_active) VALUES (?,?,?,1)',
        [package_id, pid, maxRow[0].nextSort + count]
      );
      count++;
    }
    res.json(success({ added: count }, 'Đã thêm ' + count + ' sản phẩm'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.get('/api/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, user_id, page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    let query = `SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id=u.id`;
    const conditions = [];
    const params = [];
    if (status && status !== 'all') { conditions.push('o.status=?'); params.push(status); }
    if (user_id) { conditions.push('o.user_id=?'); params.push(user_id); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [orders] = await pool.query(query, params);
    const cntQuery = `SELECT COUNT(*) as total FROM orders o ${conditions.length ? 'WHERE '+conditions.join(' AND ') : ''}`;
    const [cnt] = await pool.query(cntQuery, params.slice(0, conditions.length));
    res.json(success({ orders, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','completed','cancelled','frozen'].includes(status)) return res.status(400).json(fail('Trạng thái không hợp lệ'));
    await pool.query('UPDATE orders SET status=? WHERE id=?', [status, req.params.id]);
    res.json(success(null, 'Đã cập nhật'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Transactions
app.get('/api/admin/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, user_id, page = 1, limit = 20 } = req.query;
    const safeLimit = capLimit(limit);
    let query = `SELECT t.*, u.username FROM transactions t JOIN users u ON t.user_id=u.id`;
    const conditions = [];
    const params = [];
    if (type) { conditions.push('t.type=?'); params.push(type); }
    if (user_id) { conditions.push('t.user_id=?'); params.push(user_id); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [txns] = await pool.query(query, params);
    const cntQuery = `SELECT COUNT(*) as total FROM transactions t ${conditions.length ? 'WHERE '+conditions.join(' AND ') : ''}`;
    const [cnt] = await pool.query(cntQuery, params.slice(0, conditions.length));
    res.json(success({ transactions: txns, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Chat
app.get('/api/admin/chat', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { user_id, page = 1, limit = 50 } = req.query;
    const safeLimit = capLimit(limit, 100);
    let query = `SELECT cm.*, u.username FROM chat_messages cm JOIN users u ON cm.user_id=u.id`;
    const params = [];
    if (user_id) { query += ' WHERE cm.user_id=?'; params.push(user_id); }
    query += ' ORDER BY cm.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [msgs] = await pool.query(query, params);
    res.json(success(msgs));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.post('/api/admin/chat/reply', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { user_id, message } = req.body;
    if (!user_id || !message) return res.status(400).json(fail('Thiếu thông tin'));
    await pool.query('INSERT INTO chat_messages (user_id, sender, message) VALUES (?,\'admin\',?)', [user_id, sanitize(message)]);
    broadcastToUser(user_id, { type: 'chat', sender: 'admin', message: sanitize(message), time: new Date().toISOString() });
    res.json(success(null, 'Đã gửi'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: mark messages as read
app.post('/api/admin/chat/mark_read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json(fail('Thiếu user_id'));
    await pool.query('UPDATE chat_messages SET is_read=1 WHERE user_id=? AND sender="user"', [user_id]);
    res.json(success(null, 'Đã đánh dấu đã đọc'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin Settings
app.get('/api/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [settings] = await pool.query('SELECT * FROM settings ORDER BY id ASC');
    res.json(success(settings));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

app.put('/api/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return res.status(400).json(fail('Dữ liệu không hợp lệ'));
    for (const s of settings) {
      await pool.query('INSERT INTO settings (setting_key,setting_value,description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=?',
        [s.key, s.value, s.description||'', s.value]);
    }
    res.json(success(null, 'Đã lưu cài đặt'));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// ==================== STATIC FILES ====================
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: '1d', etag: true }));
// ==================== ADMIN WITHDRAWAL MANAGEMENT ====================

// Admin: danh sách lệnh rút
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const safeLimit = capLimit(limit, 100);
    let query = 'SELECT w.*, u.username, u.email, u.full_name FROM withdrawals w JOIN users u ON w.user_id=u.id';
    const params = [];
    if (status) { query += ' WHERE w.status=?'; params.push(status); }
    query += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, (parseInt(page)-1)*safeLimit);
    const [rows] = await pool.query(query, params);
    const countQ = 'SELECT COUNT(*) as total FROM withdrawals' + (status ? ' WHERE status=?' : '');
    const [cnt] = await pool.query(countQ, status ? [status] : []);
    res.json(success({ withdrawals: rows, total: cnt[0].total }));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: chi tiết lệnh rút
app.get('/api/admin/withdrawals/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT w.*, u.username, u.email, u.full_name, u.phone, u.balance, u.locked_amount FROM withdrawals w JOIN users u ON w.user_id=u.id WHERE w.id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json(fail('Không tìm thấy'));
    res.json(success(rows[0]));
  } catch(e) { res.status(500).json(fail('Lỗi server')); }
});

// Admin: duyệt / từ chối lệnh rút
app.put('/api/admin/withdrawals/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved','rejected'].includes(status)) return res.status(400).json(fail('Trạng thái không hợp lệ'));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT w.*, u.balance, u.locked_amount FROM withdrawals w JOIN users u ON w.user_id=u.id WHERE w.id=? FOR UPDATE', [req.params.id]);
      if (!rows.length) { await conn.rollback(); return res.status(404).json(fail('Không tìm thấy')); }
      const w = rows[0];
      if (w.status !== 'pending') { await conn.rollback(); return res.status(400).json(fail('Lệnh đã được xử lý')); }

      if (status === 'approved') {
        console.log('[WITHDRAW-APPROVE] id=' + req.params.id + ' user_id=' + w.user_id + ' amount=' + w.amount + ' balance=' + w.balance + ' locked=' + w.locked_amount);
        // Check balance still sufficient
        const avail = Math.max(0, parseFloat(w.balance) - parseFloat(w.locked_amount || 0));
        if (parseFloat(w.amount) > avail) {
          await conn.rollback();
          return res.status(400).json(fail('Số dư không đủ để duyệt (khả dụng: $' + avail.toFixed(2) + ')'));
        }
        const newBalance = parseFloat(w.balance) - parseFloat(w.amount);
        // Only deduct from balance (available), keep locked_amount untouched
        await conn.query('UPDATE users SET balance=? WHERE id=?', [newBalance, w.user_id]);
        console.log('[WITHDRAW-APPROVE] UPDATED balance=' + newBalance);
        // Record transaction
        await conn.query(
          'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id, reference_type) VALUES (?,\'withdraw\',?,?,?,?,?,?)',
          [w.user_id, -parseFloat(w.amount), w.balance, newBalance, 'Rút tiền ' + (w.method === 'bank' ? 'ngân hàng' : 'MoMo') + ' - Đã duyệt', w.id, 'withdrawal']
        );
      }

      await conn.query('UPDATE withdrawals SET status=?, admin_note=?, processed_at=NOW() WHERE id=?', [status, admin_note||'', req.params.id]);
      await conn.commit();
      console.log('[WITHDRAW-APPROVE] COMMIT id=' + req.params.id);
      res.json(success({ message: status === 'approved' ? 'Đã duyệt lệnh rút' : 'Đã từ chối lệnh rút' }));
    } catch(e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch(e) { res.status(500).json(fail('Lỗi server: ' + e.message)); }
});

app.use('/admin', express.static(path.join(publicDir, 'admin'), { maxAge: '1h', etag: true }));

app.get('/', (req, res) => res.sendFile(path.join(publicDir, '..', '..', 'dior-fashion.html'), { maxAge: '1h' }));
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, '..', '..', 'dior-login.html'), { maxAge: '1h' }));
app.get('/register', (req, res) => res.sendFile(path.join(publicDir, '..', '..', 'dior-register.html'), { maxAge: '1h' }));
app.get('/app', (req, res) => res.sendFile(path.join(publicDir, '..', '..', 'dior-platform.html'), { maxAge: '1h' }));

// ==================== WEBSOCKET CHAT ====================
const wss = new WebSocketServer({ server, path: '/ws/chat' });
const wsClients = new Map();
// Cache admin IDs (rarely change)
let cachedAdminIds = null;
async function getAdminIds() {
  if (!cachedAdminIds || Date.now() - cachedAdminIds.ts > 300000) {
    const [admins] = await pool.query('SELECT id FROM users WHERE role="admin"');
    cachedAdminIds = { ids: admins.map(a => a.id), ts: Date.now() };
  }
  return cachedAdminIds.ids;
}

// WebSocket heartbeat (ping every 30s, terminate stale connections)
const wsHeartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(wsHeartbeat));

function broadcastToUser(userId, data) {
  const clients = wsClients.get(userId);
  if (clients) {
    const msg = JSON.stringify(data);
    clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
  }
}

wss.on('connection', (ws, req) => {
  let userId = null;
  let userRole = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET);
          userId = decoded.id;
          userRole = decoded.role;
          if (!wsClients.has(userId)) wsClients.set(userId, new Set());
          wsClients.get(userId).add(ws);
          ws.send(JSON.stringify({ type: 'auth_ok', user_id: userId }));
        } catch(e) {
          ws.send(JSON.stringify({ type: 'auth_fail', error: 'Token không hợp lệ' }));
        }
        return;
      }

      if (!userId) { ws.send(JSON.stringify({ type: 'error', error: 'Chưa xác thực' })); return; }

      if (msg.type === 'chat') {
        const clean = sanitize(msg.message);
        if (!clean || clean.length > 1000) return;
        await pool.query('INSERT INTO chat_messages (user_id, sender, message) VALUES (?,\'user\',?)', [userId, clean]);
        // Send confirmation back to sender ONLY (not broadcast to avoid duplicates)
        ws.send(JSON.stringify({ type: 'chat_sent', sender: 'user', message: clean, time: new Date().toISOString() }));
        // Forward to all admins (cached)
        const adminIds = await getAdminIds();
        for (const adminId of adminIds) {
          broadcastToUser(adminId, { type: 'chat_msg', user_id: userId, sender: 'user', message: clean, time: new Date().toISOString() });
        }
      }

      if (msg.type === 'mark_read' && userRole === 'admin') {
        await pool.query('UPDATE chat_messages SET is_read=1 WHERE user_id=? AND sender="user"', [msg.user_id]);
      }
    } catch(e) { console.error('[WS]', e.message); }
  });

  ws.on('close', () => {
    if (userId && wsClients.has(userId)) {
      wsClients.get(userId).delete(ws);
      if (wsClients.get(userId).size === 0) wsClients.delete(userId);
    }
  });
});

// ==================== START ====================
async function start() {
  try {
    await initDB();
    // Seed default exchange rate if not exists
    await pool.query("INSERT INTO settings (setting_key,setting_value,description) VALUES ('exchange_rate','27000','Tỷ giá USD/VND') ON DUPLICATE KEY UPDATE setting_value=setting_value");
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Running on http://localhost:${PORT}`);
      console.log(`[SERVER] Admin: http://localhost:${PORT}/admin`);
    });
  } catch(e) {
    console.error('[FATAL]', e.message);
    process.exit(1);
  }
}

start();

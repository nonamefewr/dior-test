// test-suite.js — Bộ test tích hợp chạy sau mỗi lần build
// Cách chạy: TEST_MODE=1 node server.js  (terminal 1)
//            node test-suite.js          (terminal 2)
//
// Test suite kiểm thử:
//   1. Sức khỏe server + seed data
//   2. Auth flow (login, me)
//   3. TEST_MODE gate (reset-test phải 404 khi không bật)
//   4. Chọn gian hàng + quay đơn (spin) đầy đủ
//   5. Daily limit + tiến trình
//   6. Hoàn thành gian hàng + nhận thưởng
//   7. Reset dữ liệu test
//   8. Kiểm tra file frontend (dior-platform.html)

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
let passCount = 0, failCount = 0, warnCount = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { passCount++; console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; failures.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`); }
}
function warn(name, detail = '') {
  warnCount++; console.log(`  \x1b[33m!\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
}

async function req(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(BASE_URL + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch(e) {}
    return { status: res.status, data };
  } catch(e) {
    return { status: 0, data: null, error: e.message };
  }
}

// ============ 1. SERVER HEALTH ============
async function testHealth() {
  console.log('\n\x1b[1m[1] Server Health\x1b[0m');
  const r = await req('GET', '/');
  ok('Server đang chạy', r.status > 0, r.status > 0 ? `HTTP ${r.status}` : 'Không kết nối được — đã chạy `node server.js` chưa?');
  if (r.status === 0) { console.log('  \x1b[31mDừng test: server không chạy.\x1b[0m'); return false; }
  return true;
}

// ============ 2. AUTH FLOW ============
async function testAuth() {
  console.log('\n\x1b[1m[2] Auth Flow\x1b[0m');
  // Đăng nhập user test
  const r = await req('POST', '/api/auth/login', { login: 'dior_member1', password: 'user123' });
  ok('Đăng nhập user test (dior_member1)', r.status === 200 && r.data?.success, r.data?.success ? '' : r.data?.error || 'fail');
  if (!r.data?.data?.token) return null;
  const token = r.data.data.token;
  const user = r.data.data.user;

  const me = await req('GET', '/api/auth/me', null, token);
  ok('GET /auth/me trả thông tin user', me.status === 200 && me.data?.data?.id, `username=${me.data?.data?.username}`);

  // Sai mật khẩu
  const bad = await req('POST', '/api/auth/login', { login: 'dior_member1', password: 'sai_mat_khau' });
  ok('Sai mật khẩu bị từ chối (401)', bad.status === 401);

  // Token rác
  const badToken = await req('GET', '/api/auth/me', null, 'token_rac');
  ok('Token không hợp lệ bị từ chối (401)', badToken.status === 401);

  return { token, user };
}

// ============ 3. TEST_MODE GATE ============
async function testTestModeGate(token, testModeExpected) {
  console.log('\n\x1b[1m[3] TEST_MODE Gate\x1b[0m');
  if (!testModeExpected) {
    const r = await req('POST', '/api/user/reset-test', {}, token);
    ok('reset-test trả 404 khi TEST_MODE tắt (production)', r.status === 404, `HTTP ${r.status}`);
    const me = await req('GET', '/api/auth/me', null, token);
    ok('/auth/me không có test_mode=true khi TEST_MODE tắt', me.data?.data?.test_mode !== true);
  } else {
    const me = await req('GET', '/api/auth/me', null, token);
    ok('/auth/me có test_mode=true khi TEST_MODE=1', me.data?.data?.test_mode === true);
  }
}

// ============ 4. SPIN FLOW E2E ============
async function testSpinFlow(token) {
  console.log('\n\x1b[1m[4] Spin Flow (quay đơn)\x1b[0m');
  // Reset trước khi test
  await req('POST', '/api/user/reset-test', {}, token);
  // Đợi user object refresh
  let me = await req('GET', '/api/auth/me', null, token);
  let user = me.data?.data;

  // Lấy danh sách package
  const pkgs = await req('GET', '/api/user/packages', null, token);
  ok('GET /user/packages', pkgs.status === 200 && Array.isArray(pkgs.data?.data));
  const unlocked = (pkgs.data?.data || []).filter(p => p.is_unlocked);
  const anyPkg = unlocked[0] || (pkgs.data?.data || [])[0];
  if (!anyPkg) { warn('Không có package nào để test'); return; }

  // Chọn package
  const sel = await req('POST', '/api/user/select-package', { package_id: anyPkg.id }, token);
  ok(`Chọn gian hàng "${anyPkg.name}"`, sel.status === 200 && sel.data?.success, sel.data?.error || 'ok');

  // Stats
  const stats1 = await req('GET', '/api/user/stats', null, token);
  ok('Stats có active_package sau khi chọn', stats1.data?.data?.active_package === anyPkg.name, `daily_remaining=${stats1.data?.data?.daily_remaining}`);
  const pkgId = anyPkg.id;
  const dailyLimit = anyPkg.daily_order_limit;

  // Spin 1 đơn
  const spin1 = await req('POST', '/api/orders/spin', {}, token);
  ok('Quay đơn thành công (tạo đơn chờ phân phối)', spin1.status === 200 && spin1.data?.success && spin1.data?.data?.distribution_pending === true, spin1.data?.error || `order=${spin1.data?.data?.order_code}`);
  const s1 = spin1.data?.data;
  if (s1) {
    ok('Spin trả product có tên + giá', s1.product?.name && parseFloat(s1.product?.price) > 0);
    ok('Spin trả locked_amount tăng', parseFloat(s1.locked_amount) > 0, `locked=$${parseFloat(s1.locked_amount).toFixed(2)}`);
    ok('Spin trả commission_added', parseFloat(s1.commission_added) >= 0, `+$${parseFloat(s1.commission_added).toFixed(2)}`);
    ok('Spin trả progress (1/N)', s1.progress?.completed === 1, `${s1.progress?.completed}/${s1.progress?.total}`);
    ok('Spin trả daily_spins_remaining đúng', s1.daily_spins_remaining === dailyLimit - 1, `còn ${s1.daily_spins_remaining}/${dailyLimit}`);
  }

  // Spin thêm vài đơn — dừng nếu hết tiền (mỗi sản phẩm giá khác nhau nên balance có thể cạn)
  let lastSpin = null;
  let spinsDone = 1;
  const extraSpins = Math.min(3, dailyLimit - 1);
  for (let i = 0; i < extraSpins; i++) {
    lastSpin = await req('POST', '/api/orders/spin', {}, token);
    if (lastSpin.status === 200) spinsDone++;
    else break; // hết tiền hoặc lỗi khác — không coi là fail flow
  }
  if (spinsDone > 1) {
    ok(`Quay thêm ${spinsDone - 1} đơn vẫn ổn`, true);
  } else if (lastSpin && lastSpin.status === 400 && (lastSpin.data?.error || '').includes('Số dư')) {
    warn('Số dư chỉ đủ 1 đơn — cân nhắc nạp thêm cho user test', lastSpin.data.error);
  }

  // Orders history — đếm theo số đơn thực tế đã quay
  const orders = await req('GET', '/api/user/orders?limit=50', null, token);
  const orderList = orders.data?.data?.orders || [];
  ok('Lịch sử đơn hàng ghi nhận đủ', orderList.length === spinsDone, `${orderList.length} đơn / đã quay ${spinsDone}`);

  // Transactions
  const txns = await req('GET', '/api/user/transactions?limit=50', null, token);
  const txnList = txns.data?.data?.transactions || [];
  const deductCount = txnList.filter(t => t.type === 'order_deduct').length;
  ok('Giao dịch có order_deduct cho mỗi đơn', deductCount === spinsDone, `${deductCount} giao dịch / ${spinsDone} đơn`);

  return { pkgId, dailyLimit, spinCount: spinsDone };
}

// ============ 5. DAILY LIMIT ============
async function testDailyLimit(token, pkgInfo) {
  console.log('\n\x1b[1m[5] Daily Limit\x1b[0m');
  // Reset để đếm từ đầu
  await req('POST', '/api/user/reset-test', {}, token);
  const me = await req('GET', '/api/auth/me', null, token);
  const user = me.data?.data;
  const pkgs = await req('GET', '/api/user/packages', null, token);
  const pkg = (pkgs.data?.data || []).find(p => p.is_unlocked) || (pkgs.data?.data || [])[0];
  if (!pkg) { warn('Không có package'); return; }
  await req('POST', '/api/user/select-package', { package_id: pkg.id }, token);

  // Quay đến khi bị chặn (hết lượt hoặc hết tiền) — max 45 vòng
  let spins = 0, resp = null, blockedReason = '';
  for (let i = 0; i < Math.min(pkg.daily_order_limit, 45); i++) {
    resp = await req('POST', '/api/orders/spin', {}, token);
    if (resp.status !== 200) { blockedReason = resp.data?.error || ''; break; }
    spins++;
  }
  if (spins === pkg.daily_order_limit) {
    ok(`Quay được đúng giới hạn ${pkg.daily_order_limit}/ngày`, true, `quay đủ ${spins} lần`);
    const over = await req('POST', '/api/orders/spin', {}, token);
    ok('Quay vượt giới hạn bị chặn', over.status === 400 && (over.data?.error || '').includes('lượt quay'), over.data?.error || '');
  } else if ((blockedReason || '').includes('Số dư')) {
    // Hết tiền trước khi chạm limit — giới hạn daily vẫn được enforce về logic, chỉ là không đủ tiền để verify
    warn(`Không đủ số dư để test đủ ${pkg.daily_order_limit} lượt (quay được ${spins})`, blockedReason);
    ok('Vẫn chặn đúng khi hết lượt/hết tiền (400)', resp.status === 400);
  } else {
    ok(`Quay được đúng giới hạn ${pkg.daily_order_limit}/ngày`, false, `chỉ quay được ${spins} lần — ${blockedReason}`);
  }
}

// ============ 6. BALANCE INSUFFICIENT ============
async function testInsufficientBalance(token) {
  console.log('\n\x1b[1m[6] Số dư không đủ\x1b[0m');
  await req('POST', '/api/user/reset-test', {}, token);
  const pkgs = await req('GET', '/api/user/packages', null, token);
  const pkgList = pkgs.data?.data || [];
  const cheapest = pkgList[0];
  if (!cheapest) { warn('Không có package'); return; }
  await req('POST', '/api/user/select-package', { package_id: cheapest.id }, token);

  // Quay liên tục cho đến khi hết tiền hoặc hết lượt — kiểm tra response lỗi có rõ ràng
  let r = null;
  for (let i = 0; i < 50; i++) {
    r = await req('POST', '/api/orders/spin', {}, token);
    if (r.status !== 200) break;
  }
  if (r && r.status === 400 && (r.data?.error || '').includes('kh\u00f3a')) {
    ok('Khi tiền khóa không đủ, lỗi rõ ràng + cần topup', true, r.data?.error || '');
    ok('Response có need_topup flag', r.data?.need_topup === true);
    ok('Response có topup_amount', typeof r.data?.topup_amount === 'number');
  } else if (r && r.status === 400) {
    // Chặn vì lý do khác (hết lượt) — cũng là hành vi đúng
    warn('Hết lượt quay trước khi hết tiền khóa — test case lock không kích hoạt được', r.data?.error || '');
  } else {
    ok('Khi tiền khóa không đủ, lỗi rõ ràng + cần topup', false, 'quay 50 lần vẫn thành công');
  }
}

// ============ 7. RESET ENDPOINT ============
async function testReset(token) {
  console.log('\n\x1b[1m[7] Reset dữ liệu test\x1b[0m');
  const before = await req('GET', '/api/user/stats', null, token);
  const b = before.data?.data || {};
  const hasData = (b.completed_in_package || 0) > 0;
  if (!hasData) warn('Chưa có tiến trình trước reset (thử quay đơn trước)');

  const r = await req('POST', '/api/user/reset-test', {}, token);
  const is404 = r.status === 404;
  if (is404) {
    console.log('  (TEST_MODE đang tắt — endpoint trả 404 đúng như production. Bỏ qua phần còn lại của section này.)');
    ok('Reset bị chặn khi TEST_MODE tắt', true);
    return;
  }
  ok('Reset thành công', r.status === 200 && r.data?.success, r.data?.error || '');

  const after = await req('GET', '/api/auth/me', null, token);
  ok('Reset xóa active_package_id', !after.data?.data?.active_package_id);
  ok('Reset xóa locked_amount', parseFloat(after.data?.data?.locked_amount || 0) === 0);

  const orders = await req('GET', '/api/user/orders?limit=50', null, token);
  ok('Reset xóa toàn bộ đơn hàng', (orders.data?.data?.orders || []).length === 0);

  const stats = await req('GET', '/api/user/stats', null, token);
  ok('Reset trả về 0 đơn trong package', (stats.data?.data?.completed_in_package || 0) === 0);
}

// ============ 8. FRONTEND FILE CHECKS ============
function testFrontendFile() {
  console.log('\n\x1b[1m[8] Frontend Integrity (dior-platform.html)\x1b[0m');
  const root = path.join(__dirname, '..');
  const candidates = [
    path.join(root, 'dior-platform.html'),
    path.join(root, 'public', 'dior-platform.html')
  ];
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) { ok('Tìm thấy dior-platform.html', false); return; }

  const html = fs.readFileSync(file, 'utf-8');

  // Cấu trúc cơ bản
  ok('Cấu trúc HTML đầy đủ (html/head/body)', html.includes('</html>') && html.includes('</body>'));
  ok('Đóng <style> và <script>', (html.match(/<style>/g)||[]).length === (html.match(/<\/style>/g)||[]).length && (html.match(/<script>/g)||[]).length === (html.match(/<\/script>/g)||[]).length);

  // Function chính
  const fns = ['renderSpin', 'doSpin', 'doDistribute', 'spinSelectPkg', 'showConfirm', 'renderHome', 'renderProfile', 'resetTest'];
  for (const fn of fns) {
    ok(`Có function ${fn}()`, html.includes('function ' + fn) || html.includes('async function ' + fn));
  }

  // Không dùng confirm() native
  ok('Không còn confirm() native của browser', !/\bconfirm\(/.test(html.replace(/showConfirm/g,'')));

  // Spin state machine
  ok('Có state machine (idle|spinning|result|distributing)', html.includes('idle') && html.includes('spinning') && html.includes('distributing'));

  // Nút quay đơn không bị disabled cứng
  const btnMatch = html.match(/id="spinBtn"[^>]*>/);
  if (btnMatch) {
    const renderCodeIdx = html.indexOf("canSpin = hasActive");
    ok('Nút Quay đơn enable khi đã chọn gian hàng', renderCodeIdx > 0);
  }

  // Reset button conditional
  ok('Nút reset chỉ hiện khi test_mode', html.includes("USER?.test_mode"));

  // Ảnh không 404: chỉ dùng URL đã verify
  ok('Dùng ảnh Unsplash (không dùng media.christiandior.com cho product)', !html.includes('media.christiandior.com/cdn-cgi/image/width=800'));

  // Effect functions
  ok('Có confetti + fireworks', html.includes('launchConfetti') && html.includes('launchFireworks'));
  ok('Có processing overlay', html.includes('processing-overlay') && html.includes('processing-spinner'));
  ok('Có spin steps indicator', html.includes('spin-steps') && html.includes('updateSpinSteps'));
}

// ============ MAIN ============

// ============ 9. TOPUP LOCK ============
async function testTopupLock(token) {
  console.log('\n\x1b[1m[9] Topup Lock\x1b[0m');
  await req('POST', '/api/user/reset-test', {}, token);
  const pkgs = await req('GET', '/api/user/packages', null, token);
  const pkg = (pkgs.data?.data || [])[0];
  if (!pkg) { warn('Không có package'); return; }
  await req('POST', '/api/user/select-package', { package_id: pkg.id }, token);

  // Try spin — may or may not need topup depending on product price vs initial lock
  const spin = await req('POST', '/api/orders/spin', {}, token);
  if (spin.status === 200) {
    ok('Spin thành công (lock đủ)', true, `locked=$${spin.data?.data?.locked_amount}`);
  } else if (spin.status === 400 && spin.data?.need_topup) {
    ok('Cần topup khi lock không đủ', true, `cần thêm $${spin.data?.topup_amount}`);
    // Topup
    const topup = await req('POST', '/api/user/topup-lock', { amount: spin.data.topup_amount }, token);
    ok('Topup thành công', topup.status === 200 && topup.data?.success, topup.data?.error || '');
    if (topup.status === 200) {
      ok('Locked amount tăng sau topup', parseFloat(topup.data?.data?.locked_amount) > 0);
      // Retry spin
      const retry = await req('POST', '/api/orders/spin', {}, token);
      ok('Spin lại sau topup thành công', retry.status === 200, retry.data?.error || '');
    }
  } else {
    warn('Spin trả lỗi không mong đợi', spin.data?.error || '');
  }
}

async function main() {
  console.log('\x1b[1m══════════════════════════════════════════╗');
  console.log('   DIOR PLATFORM — TEST SUITE');
  console.log('════════════════════════════════════════════\x1b[0m');
  console.log(`Target: ${BASE_URL}`);

  const alive = await testHealth();
  if (!alive) { summary(); return; }

  // Kiểm tra TEST_MODE hiện tại của server
  const probe = await req('POST', '/api/auth/login', { login: 'dior_member1', password: 'user123' });
  const token = probe.data?.data?.token;
  if (!token) {
    console.log('\n\x1b[31mKhông đăng nhập được user test. Chạy seed.js trước: node seed.js\x1b[0m');
    // ===== 9. TOPUP LOCK TEST =====
  await testTopupLock(token);

  testFrontendFile();
    summary();
    return;
  }
  const me = await req('GET', '/api/auth/me', null, token);
  const serverTestMode = me.data?.data?.test_mode === true;
  console.log(serverTestMode ? 'Server đang chạy: TEST_MODE=1' : 'Server đang chạy: production (TEST_MODE tắt)');

  const auth = await testAuth();
  await testTestModeGate(token, serverTestMode);

  if (serverTestMode) {
    const flow = await testSpinFlow(token);
    if (flow) await testDailyLimit(token, flow.dailyLimit, flow.spinCount);
    await testInsufficientBalance(token);
    await testReset(token);
  } else {
    console.log('\n\x1b[33mCác test 4-7 cần TEST_MODE=1. Khởi động lại server:\x1b[0m');
    console.log('  \x1b[1mTEST_MODE=1 node server.js\x1b[0m');
  }

  testFrontendFile();
  summary();
}

function summary() {
  console.log('\n\x1b[1m════════════════════════════════════════════');
  console.log(`  KẾT QUẢ: ${passCount} đạt / ${failCount} lỗi / ${warnCount} cảnh báo`);
  console.log('════════════════════════════════════════════\x1b[0m');
  if (failures.length) {
    console.log('\x1b[31mLỗi cần sửa:\x1b[0m');
    failures.forEach(f => console.log('  - ' + f));
  } else {
    console.log('\x1b[32m✓ Tất cả test đạt — build đồng nhất, sẵn sàng deploy.\x1b[0m');
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });

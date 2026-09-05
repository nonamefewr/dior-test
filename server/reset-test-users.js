// reset-test-users.js — Reset lượt quay + tiến trình của các user test
// Chạy: node reset-test-users.js
const { pool, initDB } = require('./db');

async function resetTestUsers() {
  await initDB();
  const conn = await pool.getConnection();
  try {
    // Lấy danh sách user test (trừ admin)
    const [users] = await conn.query("SELECT id, username, full_name, balance, active_package_id FROM users WHERE role='user' AND username IN ('dior_member1','dior_member2','dior_member3')");
    if (users.length === 0) { console.log('Không tìm thấy user test nào.'); return; }

    console.log('=== RESET LƯỢT QUAY & TIẾN TRÌNH USER TEST ===\n');
    for (const u of users) {
      console.log(`[${u.username}] ${u.full_name}`);
      console.log(`  Số dư hiện tại: $${u.balance}`);

      await conn.beginTransaction();
      try {
        // Xóa orders + transactions liên quan
        const [orderCount] = await conn.query('SELECT COUNT(*) as c FROM orders WHERE user_id=?', [u.id]);
        console.log(`  Đơn hàng bị xóa: ${orderCount[0].c}`);

        await conn.query('DELETE FROM orders WHERE user_id=?', [u.id]);
        await conn.query('DELETE FROM transactions WHERE user_id=?', [u.id]);
        await conn.query('DELETE FROM user_package_progress WHERE user_id=?', [u.id]);

        // Reset spins + package + KHÔI PHỤC số dư về mức nạp ban đầu (total_deposit)
        // để user test luôn quay được tiếp, không bị kẹt vì hết tiền
        await conn.query(
          'UPDATE users SET daily_spins_today=0, daily_spins_date=NULL, active_package_id=NULL, balance=total_deposit, locked_amount=0 WHERE id=?',
          [u.id]
        );
        const [after] = await conn.query('SELECT balance, total_deposit, locked_amount FROM users WHERE id=?', [u.id]);

        await conn.commit();
        console.log(`  -> Đã reset lượt quay + tiến trình + số dư: $${after[0].balance}\n`);
      } catch(e) {
        await conn.rollback();
        console.error(`  -> Lỗi: ${e.message}\n`);
      }
    }
    console.log('=== HOÀN TẤT ===');
  } finally {
    conn.release();
    await pool.end();
  }
}

resetTestUsers();

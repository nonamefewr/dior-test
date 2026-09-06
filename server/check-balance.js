const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '4ZaQ8BnwjCuh7r3.root',
    password: 'BkcsCCQQY845lLoF',
    database: 'dior_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  const [users] = await conn.query("SELECT id, username, balance, locked_amount, active_package_id FROM users WHERE role='user'");
  console.log('\n=== USERS ===');
  console.table(users);

  const [withdrawals] = await conn.query("SELECT id, user_id, amount, status, method, created_at, processed_at FROM withdrawals ORDER BY id DESC LIMIT 5");
  console.log('\n=== RECENT WITHDRAWALS ===');
  console.table(withdrawals);

  const [txns] = await conn.query("SELECT id, user_id, type, amount, balance_before, balance_after, description, created_at FROM transactions WHERE type='withdraw' ORDER BY id DESC LIMIT 5");
  console.log('\n=== WITHDRAW TRANSACTIONS ===');
  console.table(txns);

  await conn.end();
}

check();

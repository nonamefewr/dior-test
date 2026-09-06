const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '4ZaQ8BnwjCuh7r3.root',
    password: 'BkcsCCQQY845lLoF',
    database: 'dior_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  // Check withdrawals table
  const [w] = await conn.query('SELECT id,user_id,amount,status FROM withdrawals ORDER BY id DESC LIMIT 5');
  console.log('=== WITHDRAWALS ===');
  console.table(w);

  // Check balance
  const [u] = await conn.query("SELECT id,username,balance,locked_amount FROM users WHERE role='user'");
  console.log('=== USERS ===');
  console.table(u);

  // Check withdraw transactions
  const [t] = await conn.query("SELECT id,user_id,type,amount,balance_before,balance_after,description FROM transactions WHERE type='withdraw' ORDER BY id DESC LIMIT 5");
  console.log('=== WITHDRAW TXNS ===');
  console.table(t);

  await conn.end();
}
test();

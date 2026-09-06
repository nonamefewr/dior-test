const mysql = require('mysql2/promise');

async function checkDB() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.DB_PORT || '4000'),
    user: process.env.DB_USER || '4ZaQ8BnwjCuh7r3.root',
    password: process.env.DB_PASS || 'BkcsCCQQY845lLoF',
    database: process.env.DB_NAME || 'dior_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
    charset: 'utf8mb4'
  });

  try {
    const tables = ['users','packages','products','orders','transactions','chat_messages','settings','package_products'];
    for (const t of tables) {
      const [rows] = await conn.query(`SELECT COUNT(*) as cnt FROM ${t}`);
      console.log(`  ${t}: ${rows[0].cnt} rows`);
    }
  } catch(e) {
    console.error('[ERROR]', e.message);
  } finally {
    await conn.end();
  }
}

checkDB();

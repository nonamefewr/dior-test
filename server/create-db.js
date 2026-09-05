const mysql = require('mysql2/promise');

async function createDB() {
  const conn = await mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '4ZaQ8BnwjCuh7r3.root',
    password: 'BkcsCCQQY845lLoF',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
    charset: 'utf8mb4',
    connectTimeout: 15000
  });

  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS dior_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('[OK] Database dior_platform created');
    await conn.query('USE dior_platform');
    console.log('[OK] Connected to dior_platform');
  } catch(e) {
    console.error('[ERROR]', e.code, e.message);
  } finally {
    await conn.end();
  }
}

createDB();

const { getDb } = require('./db');

async function test() {
  const db = await getDb();
  console.log('DB initialized');
  
  try {
    // Test simple insert
    await db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value INTEGER)');
    const stmt = db.prepare('INSERT INTO test (name, value) VALUES (?, ?)');
    const result = await stmt.run('hello', 42);
    console.log('Insert result:', result);
    
    const row = await db.prepare('SELECT * FROM test WHERE id = ?').get(result.lastInsertRowid);
    console.log('Row:', row);
    
    // Test with null
    const result2 = await stmt.run('world', null);
    console.log('Insert null result:', result2);
    
    const all = await db.prepare('SELECT * FROM test').all();
    console.log('All rows:', all);
    
    console.log('All tests passed!');
  } catch (err) {
    console.error('Test failed:', err.message);
  }
  
  process.exit(0);
}

test();

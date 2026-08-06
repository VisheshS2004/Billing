const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database...');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const productExists = collections.some(col => col.name === 'products');

    if (productExists) {
      console.log('Dropping old name_1_unit_1_mrp_1 index if it exists...');
      try {
        await db.collection('products').dropIndex('name_1_unit_1_mrp_1');
        console.log('Successfully dropped old unique index "name_1_unit_1_mrp_1"');
      } catch (err) {
        if (err.codeName === 'IndexNotFound') {
          console.log('Old unique index not found. No need to drop.');
        } else {
          console.error('Error dropping index:', err.message);
        }
      }
    } else {
      console.log('Products collection does not exist yet.');
    }

    console.log('Rebuilding indexes via mongoose...');
    const Product = require('./models/Product');
    await Product.syncIndexes();
    console.log('Indexes synced successfully!');

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();

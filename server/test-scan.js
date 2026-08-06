const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Fuse = require('fuse.js');
dotenv.config();
const Product = require('./models/Product');

const IMAGE_PATH = 'C:\\Users\\vishe\\.gemini\\antigravity-ide\\brain\\2bc74269-02ca-4d87-af8d-78c2998c8625\\media__1783201521700.jpg';
const API_KEY = process.env.GOOGLE_VISION_KEY;

const SEED_PRODUCTS = [
  { name: 'चना',        unit: 'kg' },
  { name: 'मसाला',      unit: 'kg' },
  { name: 'दूध',        unit: 'kg' },
  { name: 'सरसों तेल', unit: 'kg' },
  { name: 'मलका',       unit: 'kg' },
];

function parseItemList(rawText) {
  return rawText.split(/[\n]+/).map(l => l.trim())
    .filter(l => l.length > 2 && /[\u0900-\u097F]/.test(l))
    .map(line => {
      const m = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*$/);
      if (m) return { rawName: m[1].trim(), qty: parseFloat(m[2]), unit: m[3] || '' };
      return { rawName: line, qty: 1, unit: '' };
    });
}

async function callVision(base64) {
  const res = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        imageContext: { languageHints: ['hi'] }
      }]
    })
  });
  const data = await res.json();
  return data.responses?.[0]?.fullTextAnnotation?.text || '';
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  console.log('Seeding 5 products matching the image...');
  const ids = [];
  for (const p of SEED_PRODUCTS) {
    try {
      const doc = await Product.create({ name: p.name, unit: p.unit, priceRetail: 60, priceWholesale: 50 });
      ids.push(doc._id.toString());
      console.log('  + ' + p.name);
    } catch(e) {
      const ex = await Product.findOne({ name: p.name });
      if (ex) { ids.push(ex._id.toString()); console.log('  ~ ' + p.name + ' (already exists)'); }
    }
  }

  console.log('\nReading handwritten image...');
  const imgBuffer = fs.readFileSync(IMAGE_PATH);
  const base64 = imgBuffer.toString('base64');
  console.log('Image: ' + Math.round(imgBuffer.length / 1024) + ' KB\n');

  console.log('Calling Google Cloud Vision (Hindi handwriting OCR)...');
  const rawText = await callVision(base64);

  console.log('\n======= RAW OCR OUTPUT =======');
  console.log(rawText);
  console.log('==============================\n');

  const parsedItems = parseItemList(rawText);
  console.log('Parsed items:', parsedItems.length);
  parsedItems.forEach((it, i) => console.log('  ' + (i+1) + '. "' + it.rawName + '" qty:' + it.qty + ' unit:' + it.unit));

  const allProducts = await Product.find();
  const fuse = new Fuse(allProducts, { keys: ['name'], threshold: 0.5, ignoreLocation: true, minMatchCharLength: 1 });

  const SEP = '='.repeat(65);
  console.log('\n' + SEP);
  console.log(' RESULTS — Real Handwritten Hindi Image Test');
  console.log(SEP);
  let matched = 0;
  parsedItems.forEach(item => {
    const results = fuse.search(item.rawName);
    if (results.length > 0) {
      const score = results[0].score ? (1 - results[0].score).toFixed(2) : '?';
      console.log(' MATCH    | ' + item.rawName.padEnd(14) + ' ' + String(item.qty).padEnd(5) + item.unit.padEnd(4) + ' => ' + results[0].item.name + ' (conf:' + score + ')');
      matched++;
    } else {
      console.log(' NO MATCH | ' + item.rawName.padEnd(14) + ' ' + String(item.qty).padEnd(5) + item.unit.padEnd(4) + ' => custom item (no price)');
    }
  });
  console.log(SEP);
  console.log('\n ACCURACY: ' + matched + '/' + parsedItems.length + ' matched | ' + Math.round(matched/Math.max(parsedItems.length,1)*100) + '%');
  console.log(' Expected items: 5 (चना, मसाला, दूध, सरसों तेल, मलका)\n');

  await Product.deleteMany({ _id: { $in: ids } });
  console.log('Test products cleaned up.');
  await mongoose.disconnect();
}

main().catch(e => { console.error('Test Error:', e.message); process.exit(1); });

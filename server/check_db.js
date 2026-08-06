const mongoose = require('mongoose');
const Abbreviation = require('./models/Abbreviation');

mongoose.connect('mongodb://localhost:27017/autobilling')
  .then(async () => {
    const docs = await Abbreviation.find({});
    docs.forEach(d => {
      console.log(`[${d.abbr}] -> [${d.fullName}]`);
    });
    process.exit(0);
  });

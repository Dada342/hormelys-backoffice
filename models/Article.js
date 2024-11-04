const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    content: { type: String, required: true },
    date: { type: Date, default: Date.now },
    category: { type: String },
    published: { type: Boolean, default: false },
    imageUrl: { type: String },
});

module.exports = mongoose.model('Article', ArticleSchema);

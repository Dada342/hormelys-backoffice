const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    content: { type: String, required: true },
    date: { type: Date, default: Date.now }, // Date de création du brouillon
    publishedDate: { type: Date }, // Date de publication (définie lors de la première publication)
    category: { type: String },
    published: { type: Boolean, default: false },
    imageUrl: { type: String },
    views: { type: Number, default: 0 },
});

module.exports = mongoose.model('Article', ArticleSchema);

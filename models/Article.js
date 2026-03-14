const mongoose = require('mongoose');

/**
 * Génère un slug SEO-friendly à partir d'un titre.
 * @param {string} title - Le titre de l'article
 * @returns {string} Le slug généré
 */
function generateSlug(title) {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^a-z0-9\s-]/g, '')    // Supprime les caractères spéciaux
        .trim()
        .replace(/\s+/g, '-')            // Remplace les espaces par des tirets
        .replace(/-+/g, '-');            // Supprime les tirets multiples
}

const ArticleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String },
    content: { type: String, required: true },
    date: { type: Date, default: Date.now }, // Date de création du brouillon
    publishedDate: { type: Date }, // Date de publication (définie lors de la première publication)
    category: { type: String },
    published: { type: Boolean, default: false },
    imageUrl: { type: String },
    views: { type: Number, default: 0 },
});

// Génère le slug automatiquement avant la sauvegarde
ArticleSchema.pre('save', async function (next) {
    if (this.isModified('title') || !this.slug) {
        let slug = generateSlug(this.title);
        // Vérifier l'unicité du slug
        const existing = await mongoose.model('Article').findOne({ slug, _id: { $ne: this._id } });
        if (existing) {
            slug = `${slug}-${Date.now()}`;
        }
        this.slug = slug;
    }
    next();
});

module.exports = mongoose.model('Article', ArticleSchema);
module.exports.generateSlug = generateSlug;

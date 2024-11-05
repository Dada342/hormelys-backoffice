const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const router = express.Router();
const Article = require('../models/Article');
const authMiddleware = require('../middlewares/authMiddleware');

// Configuration Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration de multer avec Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'articles', // Dossier sur Cloudinary où les images seront stockées
        format: async (req, file) => 'jpg', // Format d'image (optionnel)
        public_id: (req, file) => `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`, // Nom sécurisé
    },
});

const upload = multer({ storage });

// Créer un nouvel article avec un fichier (par exemple une image)
router.post('/', upload.single('image'), async (req, res) => {
    try {
        console.log('Fichier uploadé sur Cloudinary :', req.file); // Vérifiez si l'image est bien reçue
        const { title, description, content, category, published } = req.body;
        const imageUrl = req.file ? req.file.path : null; // URL de l'image sur Cloudinary

        const newArticle = new Article({
            title,
            description,
            content,
            category,
            published,
            imageUrl,
        });

        await newArticle.save();
        console.log('URL de l\'image enregistrée :', newArticle.imageUrl);
        res.status(201).json(newArticle);
    } catch (error) {
        console.error("Error creating article:", error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer tous les articles
router.get('/', async (req, res) => {
    try {
        const articles = await Article.find();
        console.log('Articles:', articles); // Vérifiez que chaque article a bien un `imageUrl`
        res.json(articles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Récupérer un article par ID
router.get('/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ message: 'Article not found' });
        res.json(article);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mettre à jour un article avec un fichier (par exemple une image)
router.put('/:id', upload.single('image'), async (req, res) => {
    try {
        const { title, description, content, category, published } = req.body;
        const imageUrl = req.file ? req.file.path : null; // URL de l'image sur Cloudinary

        const updatedArticle = await Article.findByIdAndUpdate(req.params.id, {
            title,
            description,
            content,
            category,
            published,
            ...(imageUrl && { imageUrl })
        }, { new: true });

        res.json(updatedArticle);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dépublier un article
router.put('/:id/unpublish', async (req, res) => {
    try {
        const updatedArticle = await Article.findByIdAndUpdate(
            req.params.id,
            { published: false },
            { new: true }
        );
        if (!updatedArticle) {
            return res.status(404).json({ message: 'Article not found' });
        }
        res.json(updatedArticle);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un article
router.delete('/:id', async (req, res) => {
    try {
        await Article.findByIdAndDelete(req.params.id);
        res.json({ message: 'Article deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;



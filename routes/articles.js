const express = require('express');
const multer = require('multer');
const router = express.Router();
const Article = require('../models/Article');
const authMiddleware = require('../middlewares/authMiddleware');
const path = require('path');

// Configuration de multer pour enregistrer les fichiers
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'public', 'uploads')); // Utilisez un chemin absolu pour éviter les erreurs
    },
    filename: function (req, file, cb) {
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'); // Remplace les caractères spéciaux par des underscores
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Créer un nouvel article avec un fichier (par exemple une image)
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { title, description, content, category, published } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null; // Obtenir le chemin de l'image si elle est fournie

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
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

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


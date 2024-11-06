const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid'); // Pour générer des noms uniques pour les fichiers
const router = express.Router();
const Article = require('../models/Article');
const authMiddleware = require('../middlewares/authMiddleware');

// Configuration de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration de multer pour le stockage local temporaire
const storage = multer.memoryStorage(); // Utilisation de la mémoire pour stocker les fichiers temporairement
const upload = multer({ storage });

// Fonction utilitaire pour uploader l'image sur Cloudinary
const uploadToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
        const uniqueFilename = `${uuidv4()}-${file.originalname}`;
        const uploadStream = cloudinary.uploader.upload_stream(
            { public_id: `articles/${uniqueFilename}` },
            (error, result) => {
                if (error) {
                    return reject(`Cloudinary error: ${error.message}`);
                }
                resolve(result.secure_url);
            }
        );
        uploadStream.end(file.buffer);
    });
};

// Route pour créer un nouvel article avec une image
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { title, description, content, category, published } = req.body;
        let imageUrl = null;

        // Si une image est fournie, la télécharger sur Cloudinary
        if (req.file) {
            const uniqueFilename = `${uuidv4()}-${req.file.originalname}`;
            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { public_id: `articles/${uniqueFilename}` },
                    (error, result) => {
                        if (error) {
                            reject(new Error(`Cloudinary error: ${error.message}`));
                        } else {
                            resolve(result);
                        }
                    }
                );
                uploadStream.end(req.file.buffer);
            });
            imageUrl = uploadResult.secure_url; // Utilisez secure_url ici
        }

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
        console.error("Erreur lors de la création de l'article :", error);
        res.status(500).json({ error: error.message });
    }
});


// Récupérer tous les articles
router.get('/', async (req, res) => {
    try {
        const articles = await Article.find();
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
        let imageUrl = null;

        if (req.file) {
            imageUrl = await uploadToCloudinary(req.file);
        }

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

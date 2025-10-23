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

// Récupérer les articles populaires (PLACER CETTE ROUTE AVANT `/api/articles/:id`)
router.get('/popular', async (req, res) => {
    try {
        console.log("Requête reçue pour récupérer les articles populaires");

        // Récupérer les articles avec plus d'une vue
        const popularArticles = await Article.find({ views: { $gt: 1 } }).sort({ views: -1 });

        if (!popularArticles || popularArticles.length === 0) {
            console.log("Aucun article populaire trouvé.");
            return res.status(404).json({ message: 'Aucun article populaire trouvé' });
        }

        console.log("Nombre d'articles populaires trouvés :", popularArticles.length);
        res.status(200).json(popularArticles);
    } catch (error) {
        console.error("Erreur lors de la récupération des articles populaires :", error);
        res.status(500).json({ error: error.message });
    }
});

// Incrémenter le nombre de vues d'un article (PLACER CETTE ROUTE AVANT `/api/articles/:id`)
router.put('/:id/views', async (req, res) => {
    try {
        const articleId = req.params.id;

        // Incrémenter le champ "views" de l'article spécifié
        const updatedArticle = await Article.findByIdAndUpdate(
            articleId,
            { $inc: { views: 1 } }, // Utilisation de $inc pour incrémenter "views" de 1
            { new: true }
        );

        if (!updatedArticle) {
            return res.status(404).json({ message: 'Article non trouvé' });
        }

        res.status(200).json(updatedArticle);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Récupérer un article par ID (PLACER CETTE ROUTE APRÈS LES AUTRES ROUTES SPÉCIFIQUES)
router.get('/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ message: 'Article not found' });
        res.json(article);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Basculer le statut de publication d'un article (toggle) - DOIT ÊTRE AVANT /:id
router.put('/:id/toggle-publish', authMiddleware, async (req, res) => {
    try {
        const { published } = req.body;
        console.log(`Toggle publish pour article ${req.params.id}: ${published}`);

        // Récupérer l'article actuel pour vérifier s'il a déjà été publié
        const currentArticle = await Article.findById(req.params.id);
        if (!currentArticle) {
            return res.status(404).json({ message: 'Article not found' });
        }

        // Préparer les champs à mettre à jour
        const updateFields = { published: published };

        // Si on publie l'article pour la première fois, définir publishedDate
        if (published && !currentArticle.publishedDate) {
            updateFields.publishedDate = new Date();
            console.log('Première publication - définition de publishedDate');
        }

        const updatedArticle = await Article.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true }
        );

        console.log(`Article mis à jour:`, updatedArticle);
        res.json(updatedArticle);
    } catch (error) {
        console.error('Erreur lors du basculement du statut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mettre à jour un article avec un fichier (par exemple une image)
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
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

// Récupérer tous les articles avec des filtres dynamiques
router.get('/', async (req, res) => {
    try {
        const { category, sort, limit, published } = req.query;

        // Construire la requête dynamique
        const query = {};
        if (category) {
            query.category = category;
        }

        // Filtrer par statut de publication si spécifié
        // Si published n'est pas fourni, on retourne tous les articles (comportement pour l'admin)
        if (published !== undefined) {
            query.published = published === 'true';
        }

        // Construire les options de tri
        let sortOption = {};
        if (sort) {
            const [field, order] = sort.split(':');
            sortOption[field] = order === 'desc' ? -1 : 1;
        }

        // Limiter le nombre de résultats
        const articles = await Article.find(query)
            .sort(sortOption)
            .limit(parseInt(limit) || 0); // 0 signifie pas de limite si aucun paramètre "limit" n'est passé

        res.status(200).json(articles);
    } catch (error) {
        console.error("Erreur lors de la récupération des articles :", error);
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;


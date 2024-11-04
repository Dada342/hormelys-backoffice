// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

// Charger la clé secrète depuis les variables d'environnement
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt';

const authMiddleware = (req, res, next) => {
    // Extraire le token des en-têtes d'autorisation
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ error: 'Accès interdit. Token requis.' });
    }

    // Extraire le token après "Bearer"
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ error: 'Token manquant dans l\'en-tête Authorization.' });
    }

    // Vérifier le token JWT
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token invalide.' });
        }

        // Ajouter les informations de l'utilisateur décodées à la requête
        req.user = decoded;
        next(); // Continuer vers la route suivante
    });
};

module.exports = authMiddleware;

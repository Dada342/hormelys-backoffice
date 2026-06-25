const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware d'authentification cliente.
 * Verifie le JWT envoye dans l'en-tete Authorization Bearer ET que son `role === 'client'`.
 * Cela distingue les tokens emis pour les clientes (espace personnel /espace-client/[slug])
 * des tokens admin (panel /admin). Un token admin ne donne PAS acces aux routes cliente et vice-versa.
 * Attache `req.client` au request avec le payload decode.
 */
const clientAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Authentification requise' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Token invalide ou expiré' });
        }
        if (decoded.role !== 'client') {
            return res.status(403).json({ message: 'Ce token n\'est pas un token cliente' });
        }
        req.client = decoded;
        next();
    });
};

module.exports = clientAuthMiddleware;

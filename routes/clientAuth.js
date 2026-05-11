const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const ClientAccount = require('../models/ClientAccount');
const ClientRecord = require('../models/ClientRecord');
const clientAuthMiddleware = require('../middlewares/clientAuthMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt';
const TOKEN_EXPIRY = '24h';

/**
 * POST /api/client-auth/login
 * Body: { email, password }
 * Retourne: { token, slug, prenom, nom } pour que le frontend puisse stocker le token
 * et rediriger vers l'espace personnel /espace-client/[slug].
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email et mot de passe requis' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const account = await ClientAccount.findOne({ email: normalizedEmail });
        if (!account) {
            return res.status(401).json({ message: 'Identifiants invalides' });
        }

        const valid = await account.verifyPassword(password);
        if (!valid) {
            return res.status(401).json({ message: 'Identifiants invalides' });
        }

        // Charger le slug + prenom/nom de la fiche associee (pour redirection cote frontend)
        const record = await ClientRecord.findById(account.clientRecordId)
            .select('slug informationsPersonnelles.prenom informationsPersonnelles.nom');
        if (!record) {
            // Cas pathologique : compte sans fiche (ne devrait pas arriver, mais safety)
            return res.status(500).json({ message: 'Fiche associée introuvable' });
        }

        account.lastLoginAt = new Date();
        await account.save();

        const token = jwt.sign(
            {
                id: account._id,
                clientRecordId: account.clientRecordId,
                slug: record.slug,
                email: normalizedEmail,
                role: 'client'
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.json({
            token,
            slug: record.slug,
            prenom: record.informationsPersonnelles?.prenom || '',
            nom: record.informationsPersonnelles?.nom || ''
        });
    } catch (error) {
        console.error('Erreur login cliente:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * GET /api/client-auth/me
 * Auth: Bearer token cliente
 * Retourne la fiche de la cliente authentifiee, filtree pour ne contenir
 * que les blocs partageables (et eventuellement le bloc informationsPersonnelles
 * si l'admin l'a marque comme partageable). Le prenom/nom sont toujours retournes
 * pour permettre le "Bonjour Prenom Nom" en titre de page.
 */
router.get('/me', clientAuthMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.client.clientRecordId);
        if (!record) {
            return res.status(404).json({ message: 'Fiche introuvable' });
        }

        // Construction de la reponse filtree : on n'expose JAMAIS les champs prives
        const view = {
            slug: record.slug,
            prenom: record.informationsPersonnelles?.prenom || '',
            nom: record.informationsPersonnelles?.nom || '',
            informationsPersonnelles: record.informationsPersonnellesIsShareable
                ? record.informationsPersonnelles
                : null,
            blocs: (record.blocs || [])
                .filter(b => b.isShareable)
                .sort((a, b) => a.order - b.order)
                .map(b => ({
                    key: b.key,
                    title: b.title,
                    content: b.content
                })),
            updatedAt: record.updatedAt
        };

        res.json({ clientRecord: view });
    } catch (error) {
        console.error('Erreur GET /client-auth/me:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;

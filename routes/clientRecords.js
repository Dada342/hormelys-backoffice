const express = require('express');
const router = express.Router();
const ClientRecord = require('../models/ClientRecord');
const ClientAccount = require('../models/ClientAccount');
const authMiddleware = require('../middlewares/authMiddleware');
const { generateUniqueSlug } = require('../services/clientRecord');

/**
 * GET /api/admin/client-records
 * Retourne la liste de toutes les fiches clientes (champs limites pour l'affichage en liste).
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const records = await ClientRecord.find()
            .select('slug informationsPersonnelles.nom informationsPersonnelles.prenom informationsPersonnelles.email accountActivated createdAt updatedAt appointments')
            .sort({ updatedAt: -1 });
        res.json({ clientRecords: records });
    } catch (error) {
        console.error('Erreur récupération fiches clientes:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * GET /api/admin/client-records/:id
 * Retourne le detail complet d'une fiche, avec les RDVs lies populates.
 */
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id).populate('appointments');
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });
        res.json({ clientRecord: record });
    } catch (error) {
        console.error('Erreur récupération fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * POST /api/admin/client-records
 * Creation manuelle d'une fiche (sans RDV associe).
 * Body : { informationsPersonnelles: { nom, prenom, email, ... } }
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { informationsPersonnelles } = req.body;
        if (!informationsPersonnelles?.nom || !informationsPersonnelles?.prenom || !informationsPersonnelles?.email) {
            return res.status(400).json({ message: 'Nom, prénom et email sont obligatoires' });
        }
        const email = informationsPersonnelles.email.toLowerCase().trim();
        const existing = await ClientRecord.findOne({ 'informationsPersonnelles.email': email });
        if (existing) {
            return res.status(409).json({
                message: 'Une fiche existe déjà pour cet email',
                clientRecordId: existing._id
            });
        }
        const slug = await generateUniqueSlug(informationsPersonnelles.prenom, informationsPersonnelles.nom);
        const record = new ClientRecord({
            slug,
            informationsPersonnelles: { ...informationsPersonnelles, email }
        });
        await record.save();
        res.status(201).json({ clientRecord: record });
    } catch (error) {
        console.error('Erreur création fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/admin/client-records/:id
 * Mise a jour d'une fiche. L'email ne peut pas etre modifie (cle metier pour le matching RDV).
 * Body : { informationsPersonnelles?, informationsPersonnellesIsShareable?, blocs? }
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { informationsPersonnelles, informationsPersonnellesIsShareable, blocs } = req.body;
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });

        if (informationsPersonnelles) {
            // L'email reste immuable (cle de matching avec les RDVs)
            const { email, ...rest } = informationsPersonnelles;
            record.informationsPersonnelles = {
                ...record.informationsPersonnelles.toObject(),
                ...rest
            };
        }
        if (typeof informationsPersonnellesIsShareable === 'boolean') {
            record.informationsPersonnellesIsShareable = informationsPersonnellesIsShareable;
        }
        if (Array.isArray(blocs)) {
            record.blocs = blocs;
        }
        await record.save();
        res.json({ clientRecord: record });
    } catch (error) {
        console.error('Erreur update fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * DELETE /api/admin/client-records/:id
 * Supprime la fiche ET le ClientAccount associe si existant.
 * Note : ne touche pas aux Appointments lies, qui restent en base.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });

        if (record.clientAccountId) {
            await ClientAccount.findByIdAndDelete(record.clientAccountId);
        }
        await ClientRecord.findByIdAndDelete(req.params.id);
        res.json({ message: 'Fiche supprimée' });
    } catch (error) {
        console.error('Erreur suppression fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;

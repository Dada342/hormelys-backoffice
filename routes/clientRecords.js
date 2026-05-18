const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const ClientRecord = require('../models/ClientRecord');
const ClientAccount = require('../models/ClientAccount');
const authMiddleware = require('../middlewares/authMiddleware');
const { generateUniqueSlug, generateRandomPassword } = require('../services/clientRecord');
const { sendMail } = require('../services/mailer');

// Cloudinary partage la meme config que les articles (initialise globalement par routes/articles.js).
// Re-config defensif au cas ou ce fichier est charge avant articles.js.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload documents : PDF / JPG / PNG, max 10 Mo
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const uploadDocument = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Type de fichier non supporté. Acceptés : PDF, JPG, PNG'), false);
        }
    }
});

/**
 * Upload un fichier sur Cloudinary dans un dossier par fiche cliente.
 * Utilise resource_type 'auto' pour gerer PDF et images correctement.
 * On retire l'extension du fichier original avant de la passer en public_id, sinon
 * Cloudinary ajoute sa propre extension en plus et on se retrouve avec `file.pdf.pdf`.
 */
function uploadDocumentToCloudinary(file, clientRecordId) {
    return new Promise((resolve, reject) => {
        const baseName = file.originalname.replace(/\.[^/.]+$/, ''); // strip extension
        const uniqueFilename = `${uuidv4()}-${baseName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        cloudinary.uploader.upload_stream(
            {
                public_id: `client-documents/${clientRecordId}/${uniqueFilename}`,
                resource_type: 'auto'
            },
            (error, result) => {
                if (error) return reject(new Error(`Cloudinary error: ${error.message}`));
                resolve(result);
            }
        ).end(file.buffer);
    });
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://www.hormelys.com';

/**
 * Construit le HTML de l'email contenant les identifiants de l'espace cliente.
 */
function buildCredentialsEmailHtml({ prenom, slug, email, password }) {
    const espaceUrl = `${PUBLIC_BASE_URL}/espace-client/${slug}`;
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                <h1 style="color: #A13D6C; text-align: center; margin-bottom: 20px;">
                    🌿 Votre espace personnel Hormelys
                </h1>
                <p style="font-size: 16px;">Bonjour <strong>${prenom}</strong>,</p>
                <p style="font-size: 16px;">
                    Votre naturopathe Nathalia Laffont a créé un espace personnel pour vous accompagner
                    dans votre suivi. Vous y retrouverez les recommandations, étapes du protocole
                    et conseils personnalisés.
                </p>

                <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #A13D6C;">
                    <h3 style="margin-top: 0; color: #A13D6C; font-size: 18px;">Vos identifiants</h3>
                    <p style="margin: 12px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Lien d'accès</p>
                    <p style="margin: 0;">
                        <a href="${espaceUrl}" style="color: #2C6E63; text-decoration: none; font-weight: bold; word-break: break-all;">
                            ${espaceUrl}
                        </a>
                    </p>
                    <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Email</p>
                    <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${email}</p>
                    <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Mot de passe</p>
                    <p style="margin: 0; color: #333; font-size: 18px; font-weight: bold; letter-spacing: 2px; font-family: 'Courier New', monospace;">${password}</p>
                </div>

                <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                    <p style="margin: 0; color: #856404;">
                        ⚠️ <strong>Important :</strong> conservez ces identifiants en lieu sûr et ne les partagez pas.
                        Votre espace est en lecture seule, il vous suffit de vous connecter pour le consulter.
                    </p>
                </div>

                <p style="font-size: 16px; margin-top: 30px; color: #A13D6C; font-weight: bold;">
                    À très bientôt 🌿
                </p>
                <p style="font-size: 14px; color: #666;">
                    Nathalia Laffont — Naturopathe certifiée
                </p>

                <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                    <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Hormelys - Naturopathie</strong></p>
                    <p style="color: #666; font-size: 14px; margin: 5px 0;">
                        <a href="${PUBLIC_BASE_URL}" style="color: #A13D6C; text-decoration: none;">🌐 www.hormelys.com</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * GET /api/admin/client-records
 * Retourne la liste de toutes les fiches clientes (champs limites pour l'affichage en liste).
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const records = await ClientRecord.find()
            .select('slug informationsPersonnelles.nom informationsPersonnelles.prenom informationsPersonnelles.email accountActivated createdAt updatedAt appointments clientAccountId')
            .populate('clientAccountId', 'lastLoginAt')
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
        const { informationsPersonnelles, informationsPersonnellesIsShareable, blocs, nextAppointment } = req.body;
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
        // Toute saisie via l'admin form est consideree 'manual' (sera ecrasee par un futur follow_up)
        if (nextAppointment && typeof nextAppointment === 'object') {
            record.nextAppointment = {
                date: nextAppointment.date || '',
                time: nextAppointment.time || '',
                note: nextAppointment.note || '',
                source: 'manual'
            };
        }
        await record.save();
        res.json({ clientRecord: record });
    } catch (error) {
        console.error('Erreur update fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * GET /api/admin/client-records/:id/preview
 * Retourne la fiche filtree EXACTEMENT comme la verra la cliente sur /espace-client/[slug],
 * pour permettre a l'admin de previsualiser son rendu sans avoir a se logger en tant que cliente.
 * Auth admin (pas besoin que l'espace cliente soit deja active).
 */
router.get('/:id/preview', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });

        // Meme logique de filtrage que GET /api/client-auth/me
        const view = {
            slug: record.slug,
            prenom: record.informationsPersonnelles?.prenom || '',
            nom: record.informationsPersonnelles?.nom || '',
            informationsPersonnelles: record.informationsPersonnellesIsShareable
                ? record.informationsPersonnelles
                : null,
            nextAppointment: (record.nextAppointment?.date || record.nextAppointment?.note)
                ? {
                    date: record.nextAppointment.date,
                    time: record.nextAppointment.time,
                    note: record.nextAppointment.note
                }
                : null,
            blocs: (record.blocs || [])
                .filter(b => b.isShareable)
                .sort((a, b) => a.order - b.order)
                .map(b => ({ key: b.key, title: b.title, content: b.content })),
            documents: (record.documents || [])
                .filter(d => d.isShareable)
                .map(d => ({
                    id: d._id,
                    title: d.title,
                    fileUrl: d.fileUrl,
                    fileType: d.fileType,
                    fileSize: d.fileSize,
                    originalFilename: d.originalFilename,
                    uploadedAt: d.uploadedAt
                })),
            updatedAt: record.updatedAt
        };
        res.json({ clientRecord: view });
    } catch (error) {
        console.error('Erreur preview fiche:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * POST /api/admin/client-records/:id/send-credentials
 * Active l'espace cliente :
 *   - Genere un mot de passe aleatoire
 *   - Cree le ClientAccount (email + passwordHash bcrypt)
 *   - Marque la fiche `accountActivated: true` + lie `clientAccountId`
 *   - Envoie un email a la cliente avec son URL d'espace et ses identifiants
 * Idempotent : 409 si la fiche est deja activee.
 */
router.post('/:id/send-credentials', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });
        if (record.accountActivated) {
            return res.status(409).json({ message: 'Espace cliente déjà activé' });
        }

        const email = (record.informationsPersonnelles?.email || '').toLowerCase().trim();
        if (!email) {
            return res.status(400).json({ message: 'Aucun email sur la fiche, impossible d\'envoyer les identifiants' });
        }

        // Gere le cas d'un ClientAccount existant pour cet email (rare : suppression de fiche + recreation)
        const existingAccount = await ClientAccount.findOne({ email });
        if (existingAccount) {
            return res.status(409).json({ message: 'Un compte existe déjà pour cet email' });
        }

        const plainPassword = generateRandomPassword(12);
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        const account = new ClientAccount({
            email,
            passwordHash,
            clientRecordId: record._id
        });
        await account.save();

        record.clientAccountId = account._id;
        record.accountActivated = true;
        await record.save();

        // Envoi de l'email avec les identifiants en clair (unique moment ou ils sont communiques)
        try {
            await sendMail({
                to: email,
                subject: '🌿 Votre espace personnel Hormelys est prêt',
                html: buildCredentialsEmailHtml({
                    prenom: record.informationsPersonnelles.prenom || '',
                    slug: record.slug,
                    email,
                    password: plainPassword
                })
            });
        } catch (emailError) {
            // L'account est cree mais l'email n'est pas parti.
            // On laisse l'admin gerer (elle pourra communiquer le mdp manuellement ou supprimer+recreer).
            console.error('❌ Erreur envoi email identifiants:', emailError.message);
            return res.status(500).json({
                message: 'Compte créé mais email non envoyé. Communiquez le mot de passe manuellement.',
                temporaryPassword: plainPassword
            });
        }

        res.json({
            message: 'Identifiants envoyés avec succès',
            accountActivated: true
        });
    } catch (error) {
        console.error('Erreur envoi identifiants:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * POST /api/admin/client-records/:id/documents
 * Upload un document (PDF, JPG, PNG, max 10 Mo) attache a la fiche.
 * Form-data : `file` (le fichier), `title` (optionnel, sinon = nom de fichier original)
 */
router.post('/:id/documents', authMiddleware, uploadDocument.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Aucun fichier reçu' });
        }
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });

        const result = await uploadDocumentToCloudinary(req.file, record._id.toString());

        const newDoc = {
            title: (req.body.title || '').trim() || req.file.originalname,
            fileUrl: result.secure_url,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            originalFilename: req.file.originalname,
            publicId: result.public_id,
            resourceType: result.resource_type || 'image',
            isShareable: true // partageable par defaut, cf. decision produit
        };
        record.documents.push(newDoc);
        await record.save();

        // Renvoie le document avec son _id genere
        const savedDoc = record.documents[record.documents.length - 1];
        res.status(201).json({ document: savedDoc });
    } catch (error) {
        // Multer error (taille, type) ou Cloudinary
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ message: 'Fichier trop volumineux (max 10 Mo)' });
        }
        console.error('Erreur upload document:', error);
        res.status(500).json({ message: error.message || 'Erreur lors de l\'upload' });
    }
});

/**
 * PUT /api/admin/client-records/:id/documents/:docId
 * Met a jour le titre et/ou la visibilite d'un document existant.
 * Body : { title?, isShareable? }
 */
router.put('/:id/documents/:docId', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });
        const doc = record.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ message: 'Document introuvable' });

        if (typeof req.body.title === 'string') doc.title = req.body.title.trim();
        if (typeof req.body.isShareable === 'boolean') doc.isShareable = req.body.isShareable;

        await record.save();
        res.json({ document: doc });
    } catch (error) {
        console.error('Erreur update document:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * DELETE /api/admin/client-records/:id/documents/:docId
 * Supprime le document de la fiche ET le fichier sur Cloudinary.
 */
router.delete('/:id/documents/:docId', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });
        const doc = record.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ message: 'Document introuvable' });

        // Cleanup Cloudinary (on tolere une erreur, on retire quand meme de la fiche)
        try {
            await cloudinary.uploader.destroy(doc.publicId, { resource_type: doc.resourceType || 'image' });
        } catch (cloudErr) {
            console.error('Erreur suppression Cloudinary:', cloudErr.message);
        }

        record.documents.pull(req.params.docId);
        await record.save();
        res.json({ message: 'Document supprimé' });
    } catch (error) {
        console.error('Erreur suppression document:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * DELETE /api/admin/client-records/:id
 * Supprime la fiche, le ClientAccount associe ET tous les documents Cloudinary.
 * Note : ne touche pas aux Appointments lies, qui restent en base.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const record = await ClientRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Fiche introuvable' });

        // Cleanup des documents Cloudinary (tolere les erreurs, continue la suppression)
        for (const doc of record.documents) {
            try {
                await cloudinary.uploader.destroy(doc.publicId, { resource_type: doc.resourceType || 'image' });
            } catch (cloudErr) {
                console.error(`Erreur suppression Cloudinary doc ${doc.publicId}:`, cloudErr.message);
            }
        }

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

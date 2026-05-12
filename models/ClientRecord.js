const mongoose = require('mongoose');

/**
 * Sous-schema pour les informations personnelles structurées.
 * Pré-remplies depuis le RDV pour les 5 premiers champs ; les autres sont complétés par Nathalia.
 */
const informationsPersonnellesSchema = new mongoose.Schema({
    nom: { type: String, trim: true },
    prenom: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    telephone: { type: String, trim: true, default: '' },
    adresse: { type: String, trim: true, default: '' },
    age: { type: Number, default: null },
    poids: { type: Number, default: null }, // kg
    taille: { type: Number, default: null }, // cm
    situationFamiliale: { type: String, trim: true, default: '' },
    enfants: { type: String, trim: true, default: '' },
    emploi: { type: String, trim: true, default: '' },
    motifRdv: { type: String, trim: true, default: '' }
}, { _id: false });

/**
 * Sous-schema pour un document joint a la fiche (PDF, JPG, PNG).
 * Stocke sur Cloudinary, accessible via fileUrl public.
 */
const documentSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true }, // mime type
    fileSize: { type: Number, required: true }, // bytes
    originalFilename: { type: String, required: true },
    publicId: { type: String, required: true }, // identifiant Cloudinary, pour suppression
    resourceType: { type: String, default: 'image' }, // 'image' | 'raw' | 'video' (Cloudinary)
    isShareable: { type: Boolean, default: true },
    uploadedAt: { type: Date, default: Date.now }
});

/**
 * Sous-schema pour chaque bloc de suivi (problématiques, étapes protocoles, etc.).
 * Le contenu est du HTML rich-text (éditeur Quill 2.x côté admin).
 */
const blocSchema = new mongoose.Schema({
    key: {
        type: String,
        enum: ['problematiques', 'etapes_protocoles', 'instructions', 'complements_alimentaires', 'autres_informations', 'questionnaire', 'custom'],
        required: true
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    isShareable: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
});

/**
 * Liste des blocs initialisés par défaut à la création d'une fiche.
 * Ordre et visibilité par défaut conformes à la décision produit (cf. memory feature_fiches_clientes).
 */
function getDefaultBlocs() {
    return [
        { key: 'problematiques', title: 'Problématiques', content: '', isShareable: true, order: 0 },
        { key: 'etapes_protocoles', title: 'Étapes protocoles', content: '', isShareable: true, order: 1 },
        { key: 'instructions', title: 'Instructions', content: '', isShareable: true, order: 2 },
        { key: 'complements_alimentaires', title: 'Compléments alimentaires', content: '', isShareable: true, order: 3 },
        { key: 'questionnaire', title: 'Questionnaire', content: '', isShareable: true, order: 4 },
        { key: 'autres_informations', title: 'Autres informations', content: '', isShareable: false, order: 5 }
    ];
}

const clientRecordSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    informationsPersonnelles: {
        type: informationsPersonnellesSchema,
        required: true
    },
    informationsPersonnellesIsShareable: {
        type: Boolean,
        default: false
    },
    blocs: {
        type: [blocSchema],
        default: getDefaultBlocs
    },
    documents: {
        type: [documentSchema],
        default: []
    },
    clientAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientAccount',
        default: null
    },
    accountActivated: { type: Boolean, default: false },
    appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Index unique sur l'email — sert de cle metier pour matcher les RDVs futurs et eviter les doublons
clientRecordSchema.index({ 'informationsPersonnelles.email': 1 }, { unique: true });

clientRecordSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('ClientRecord', clientRecordSchema);
module.exports.getDefaultBlocs = getDefaultBlocs;

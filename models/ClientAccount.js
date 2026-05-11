const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * Compte de connexion d'une cliente pour son espace personnel /espace-client/[slug].
 * Distinct de la collection `User` qui est dediee a l'admin.
 * Cree uniquement au moment ou Nathalia clique sur "Envoyer les identifiants" depuis l'admin.
 */
const clientAccountSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    passwordHash: { type: String, required: true },
    clientRecordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientRecord',
        required: true
    },
    lastLoginAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

/**
 * Compare un mot de passe en clair avec le hash stocke (bcrypt).
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
clientAccountSchema.methods.verifyPassword = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model('ClientAccount', clientAccountSchema);

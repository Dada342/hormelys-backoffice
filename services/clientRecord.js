const crypto = require('crypto');
const ClientRecord = require('../models/ClientRecord');
const Appointment = require('../models/Appointment');

/**
 * Genere un mot de passe aleatoire cryptographiquement sur, lisible.
 * Exclut les caracteres ambigus (0/O/o, 1/l/I) et les caracteres speciaux
 * pour eviter les confusions a la saisie/dictee. 55 caracteres dans l'alphabet
 * × 12 chars = ~70 bits d'entropie (largement suffisant).
 * @param {number} length - Longueur du mot de passe (defaut 12)
 * @returns {string}
 */
function generateRandomPassword(length = 12) {
    const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset[bytes[i] % charset.length];
    }
    return password;
}

/**
 * Genere un slug a partir du prenom et du nom, en retirant accents et caracteres non alphanumeriques.
 * Si le slug de base existe deja en base, ajoute un suffixe numerique (`-2`, `-3`, ...).
 * @param {string} prenom
 * @param {string} nom
 * @returns {Promise<string>} slug unique
 */
async function generateUniqueSlug(prenom, nom) {
    const base = `${prenom}-${nom}`
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les marques diacritiques (accents)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!base) {
        throw new Error('Impossible de générer un slug : prénom ou nom vide');
    }

    let slug = base;
    let counter = 2;
    while (await ClientRecord.exists({ slug })) {
        slug = `${base}-${counter}`;
        counter++;
    }
    return slug;
}

/**
 * Cree une fiche cliente a partir d'un RDV physique, ou lie le RDV a la fiche existante si l'email correspond.
 * - Si une fiche existe deja pour cet email : ajoute le RDV a sa liste appointments, et remplit motifRdv s'il etait vide
 * - Sinon : cree une nouvelle fiche avec pre-remplissage minimal (nom, prenom, email, telephone, motif si first_session)
 * Appelee depuis le hook post-save d'un appointment (uniquement pour first_session / follow_up).
 * @param {Object} appointment - document Mongoose Appointment deja sauvegarde
 * @returns {Promise<Object>} le ClientRecord cree ou mis a jour
 */
async function createOrLinkClientRecordFromAppointment(appointment) {
    const email = (appointment.email || '').toLowerCase().trim();
    if (!email) throw new Error('Appointment sans email, impossible de creer la fiche');

    const existing = await ClientRecord.findOne({ 'informationsPersonnelles.email': email });

    if (existing) {
        let changed = false;
        if (!existing.appointments.some(id => id.equals(appointment._id))) {
            existing.appointments.push(appointment._id);
            changed = true;
        }
        // Si la fiche n'a pas de motif et qu'on recoit une first_session avec un motif, on le remplit
        if (appointment.type === 'first_session' && appointment.notes && !existing.informationsPersonnelles.motifRdv) {
            existing.informationsPersonnelles.motifRdv = appointment.notes;
            changed = true;
        }
        if (changed) await existing.save();
        return existing;
    }

    const slug = await generateUniqueSlug(appointment.firstName, appointment.lastName);
    const record = new ClientRecord({
        slug,
        informationsPersonnelles: {
            nom: appointment.lastName,
            prenom: appointment.firstName,
            email,
            telephone: appointment.phone || '',
            motifRdv: appointment.type === 'first_session' ? (appointment.notes || '') : ''
        },
        appointments: [appointment._id]
    });
    await record.save();
    return record;
}

/**
 * Determine si une fiche est consideree "vierge" (jamais remplie par la naturopathe).
 * Une fiche est vierge si :
 *   - Aucun bloc predefini n'a de contenu (apres strip HTML)
 *   - Aucun bloc personnalise (custom) n'a ete ajoute
 *   - Aucun champ d'identite "etendu" n'a ete rempli (age, poids, taille, adresse,
 *     situation, enfants, emploi). Les champs nom/prenom/email/telephone/motifRdv
 *     sont pre-remplis automatiquement depuis le RDV donc ne comptent pas.
 * @param {Object} record - document Mongoose ClientRecord
 * @returns {boolean}
 */
function isFicheUntouched(record) {
    const ip = record.informationsPersonnelles || {};

    if (ip.age != null) return false;
    if (ip.poids != null) return false;
    if (ip.taille != null) return false;
    if (ip.adresse && ip.adresse.trim()) return false;
    if (ip.situationFamiliale && ip.situationFamiliale.trim()) return false;
    if (ip.enfants && ip.enfants.trim()) return false;
    if (ip.emploi && ip.emploi.trim()) return false;

    if (record.blocs.some(b => b.key === 'custom')) return false;

    const hasContentInBlocs = record.blocs.some(b => {
        if (!b.content) return false;
        const stripped = b.content.replace(/<[^>]*>/g, '').trim();
        return stripped.length > 0;
    });
    if (hasContentInBlocs) return false;

    return true;
}

/**
 * Detache un RDV annule de la fiche cliente qui le contient.
 * La fiche est supprimee SEULEMENT si TOUTES ces conditions sont remplies :
 *   1. Le RDV annule est de type 'first_session' (pas un follow_up)
 *   2. La fiche n'a plus aucun autre RDV apres nettoyage
 *   3. La fiche n'a pas ete activee (compte cliente jamais cree)
 *   4. La fiche n'a jamais ete remplie par la naturopathe (cf. isFicheUntouched)
 * Sinon : la fiche est conservee (la naturopathe la supprimera manuellement si elle le souhaite).
 * No-op si aucune fiche ne reference ce RDV (cas d'un discovery_call par ex.).
 * @param {Object} appointment - document Mongoose Appointment (besoin du _id ET du type)
 * @returns {Promise<{action: 'unlinked' | 'deleted' | 'noop', clientRecordId?: string}>}
 */
async function detachAppointmentFromClientRecord(appointment) {
    const appointmentId = appointment._id;
    const appointmentType = appointment.type;

    const record = await ClientRecord.findOne({ appointments: appointmentId });
    if (!record) return { action: 'noop' };

    // Retire le RDV annule
    record.appointments = record.appointments.filter(id => !id.equals(appointmentId));

    // Purge les IDs orphelins (RDVs deja supprimes precedemment) pour eviter qu'une fiche persiste a tort
    if (record.appointments.length > 0) {
        const existingIds = await Appointment.find({ _id: { $in: record.appointments } }).distinct('_id');
        record.appointments = record.appointments.filter(id =>
            existingIds.some(eid => eid.equals(id))
        );
    }

    const shouldDelete =
        appointmentType === 'first_session' &&
        record.appointments.length === 0 &&
        !record.accountActivated &&
        isFicheUntouched(record);

    if (shouldDelete) {
        const id = record._id.toString();
        await ClientRecord.findByIdAndDelete(record._id);
        return { action: 'deleted', clientRecordId: id };
    }

    await record.save();
    return { action: 'unlinked', clientRecordId: record._id.toString() };
}

module.exports = {
    generateUniqueSlug,
    generateRandomPassword,
    createOrLinkClientRecordFromAppointment,
    detachAppointmentFromClientRecord
};

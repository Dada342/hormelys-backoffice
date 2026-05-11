const ClientRecord = require('../models/ClientRecord');
const Appointment = require('../models/Appointment');

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
 * Detache un RDV annule de la fiche cliente qui le contient.
 * Si apres detachement la fiche n'a plus aucun RDV ET n'est pas encore activee
 * (compte cliente jamais cree), elle est supprimee completement (smart cleanup).
 * Sinon : on conserve la fiche, juste detachee.
 * No-op si aucune fiche ne reference ce RDV (cas d'un discovery_call par ex.).
 * @param {string|ObjectId} appointmentId
 * @returns {Promise<{action: 'unlinked' | 'deleted' | 'noop', clientRecordId?: string}>}
 */
async function detachAppointmentFromClientRecord(appointmentId) {
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

    if (record.appointments.length === 0 && !record.accountActivated) {
        const id = record._id.toString();
        await ClientRecord.findByIdAndDelete(record._id);
        return { action: 'deleted', clientRecordId: id };
    }

    await record.save();
    return { action: 'unlinked', clientRecordId: record._id.toString() };
}

module.exports = {
    generateUniqueSlug,
    createOrLinkClientRecordFromAppointment,
    detachAppointmentFromClientRecord
};

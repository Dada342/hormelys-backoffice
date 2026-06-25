/**
 * Génération du contenu iCalendar (.ics) pour les rendez-vous Hormelys.
 */

const { SESSION_CONFIG } = require('./appointmentRules');

/**
 * Génère un fichier .ics (iCalendar) pour un rendez-vous
 * @param {object} appointment - Objet rendez-vous avec les champs requis
 * @param {string} appointment._id - Identifiant unique du RDV
 * @param {string} appointment.firstName - Prénom du client
 * @param {string} appointment.lastName - Nom du client
 * @param {string} appointment.date - Date au format "YYYY-MM-DD"
 * @param {string} appointment.time - Heure de début au format "HH:MM"
 * @param {string} appointment.endTime - Heure de fin au format "HH:MM"
 * @param {string} appointment.type - Type de séance (discovery_call, first_session, follow_up)
 * @param {number} appointment.duration - Durée en minutes
 * @returns {string} Contenu iCalendar (format .ics)
 */
function generateICS(appointment) {
    const { firstName, lastName, date, time, endTime, type, duration } = appointment;
    const config = SESSION_CONFIG[type] || SESSION_CONFIG.discovery_call;
    const isConsultation = type === 'first_session' || type === 'follow_up';

    // Convertir date "2026-03-20" et time "10:00" en format iCal "20260320T100000"
    const dtStart = date.replace(/-/g, '') + 'T' + time.replace(/:/g, '') + '00';
    const dtEnd = date.replace(/-/g, '') + 'T' + endTime.replace(/:/g, '') + '00';
    const now = new Date();
    const dtStamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const summary = isConsultation
        ? `Consultation Naturopathie - Hormelys`
        : `Appel Découverte - Hormelys`;

    const location = isConsultation
        ? `Pôle Santé de Gignac - Box 203\\, 2e étage\\, 280 avenue de Lodève\\, 34150 GIGNAC`
        : `Appel téléphonique`;

    const description = isConsultation
        ? `${config.label} avec Nathalia Laffont\\nLieu : Pôle Santé de Gignac - Box 203\\, 2e étage\\nPensez à apporter :\\n- Vos dernières analyses biologiques\\n- La liste de vos traitements en cours\\nRèglement : ${config.price}€ (espèces\\, chèque ou virement)`
        : `Rendez-vous découverte gratuit de 30 minutes avec Nathalia Laffont\\nNathalia vous appellera au numéro que vous avez fourni.`;

    // UID unique pour l'événement
    const uid = `${appointment._id}@hormelys.com`;

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Hormelys//Rendez-vous//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=Europe/Paris:${dtStart}`,
        `DTEND;TZID=Europe/Paris:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        `ORGANIZER;CN=Nathalia Laffont:mailto:${process.env.NATUROPATH_EMAIL || 'contact@hormelys.com'}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Rappel rendez-vous Hormelys dans 1 heure',
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        'DESCRIPTION:Rappel rendez-vous Hormelys demain',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

module.exports = { generateICS };

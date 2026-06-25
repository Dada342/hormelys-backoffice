/**
 * Wrappers Google Calendar dédiés à la chaîne rendez-vous Hormelys.
 * Couche au-dessus de services/googleCalendar.js pour la construction du payload d'événement.
 */

const { createEvent, deleteEvent } = require('./googleCalendar');
const { SESSION_CONFIG, addMinutes } = require('./appointmentRules');

/**
 * Crée un événement dans Google Agenda de la naturopathe
 * @param {object} appointment - Objet rendez-vous complet
 * @returns {Promise<string|null>} googleEventId ou null en cas d'échec
 */
async function createGoogleCalendarEvent(appointment) {
    const { firstName, lastName, email, phone, date, time, endTime, type, notes } = appointment;
    const config = SESSION_CONFIG[type] || SESSION_CONFIG.discovery_call;
    const isConsultation = type === 'first_session' || type === 'follow_up';

    const event = {
        summary: isConsultation
            ? `${firstName} ${lastName} — ${config.label}`
            : `${firstName} ${lastName} — Appel découverte`,
        description: [
            `Client : ${firstName} ${lastName}`,
            `Email : ${email}`,
            `Téléphone : ${phone}`,
            `Type : ${config.label}`,
            isConsultation ? `Tarif : ${config.price}€` : null,
            notes ? `\nRaison de la venue :\n${notes}` : null,
        ].filter(Boolean).join('\n'),
        location: isConsultation
            ? 'Pôle Santé'
            : `Appel téléphonique — ${phone}`,
        start: {
            dateTime: `${date}T${time}:00`,
            timeZone: 'Europe/Paris',
        },
        end: {
            dateTime: `${date}T${addMinutes(time, config.calendarDuration || config.duration)}:00`,
            timeZone: 'Europe/Paris',
        },
        colorId: '6', // Mandarine - identifie visuellement les RDV crees via le site
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 60 },
                { method: 'popup', minutes: 1440 },
            ],
        },
    };

    return createEvent(event);
}

/**
 * Supprime un événement Google Calendar par son ID
 * @param {string} googleEventId - ID de l'événement Google Calendar
 * @returns {Promise<*>} résultat de la suppression
 */
async function deleteGoogleCalendarEvent(googleEventId) {
    return deleteEvent(googleEventId);
}

module.exports = {
    createGoogleCalendarEvent,
    deleteGoogleCalendarEvent,
};

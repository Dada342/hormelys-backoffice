const { google } = require('googleapis');

/**
 * Service Google Calendar — configuration et fonctions utilitaires
 */
let calendar = null;

try {
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}';
    let credentialsJson = rawKey;
    if (!rawKey.startsWith('{')) {
        credentialsJson = Buffer.from(rawKey, 'base64').toString('utf-8');
    }
    const credentials = JSON.parse(credentialsJson);
    if (credentials.client_email) {
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        calendar = google.calendar({ version: 'v3', auth });
        console.log('✅ Google Calendar API configurée');
    } else {
        console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT_KEY non configurée — synchronisation Google Calendar désactivée');
    }
} catch (error) {
    console.error('❌ Erreur configuration Google Calendar:', error.message);
}

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'nathalia.laffont@gmail.com';

/**
 * Vérifie si une plage horaire est occupée sur Google Calendar
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} startTime - Heure de début au format HH:MM
 * @param {string} endTime - Heure de fin au format HH:MM
 * @returns {Promise<boolean>} true si le créneau est occupé
 */
async function isGoogleCalendarBusy(date, startTime, endTime) {
    if (!calendar) return false;

    try {
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: new Date(`${date}T${startTime}:00.000Z`).toISOString(),
                timeMax: new Date(`${date}T${endTime}:00.000Z`).toISOString(),
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        const busySlots = response.data.calendars[GOOGLE_CALENDAR_ID]?.busy || [];
        return busySlots.length > 0;
    } catch (error) {
        console.error('❌ Erreur vérification Google Calendar freebusy:', error.message);
        return false;
    }
}

/**
 * Récupère les plages occupées sur Google Calendar pour une journée entière
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<Array<{start: string, end: string}>>} Liste des plages occupées (HH:MM)
 */
async function getGoogleCalendarBusySlots(date) {
    if (!calendar) {
        console.log('⚠️ getGoogleCalendarBusySlots: calendar non configuré');
        return [];
    }

    try {
        console.log(`🔍 Google Calendar freebusy query pour ${date}, calendarId: ${GOOGLE_CALENDAR_ID}`);

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: new Date(`${date}T00:00:00.000Z`).toISOString(),
                timeMax: new Date(`${date}T23:59:59.000Z`).toISOString(),
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        // Log de la réponse complète pour debug
        const calendarData = response.data.calendars[GOOGLE_CALENDAR_ID];
        console.log(`📅 Réponse freebusy pour ${date}:`, JSON.stringify(calendarData));

        const busySlots = calendarData?.busy || [];
        const errors = calendarData?.errors;
        if (errors && errors.length > 0) {
            console.error('❌ Erreurs freebusy:', JSON.stringify(errors));
        }

        console.log(`📅 ${busySlots.length} plage(s) occupée(s) trouvée(s) pour ${date}`);

        return busySlots.map(slot => {
            const start = new Date(slot.start);
            const end = new Date(slot.end);
            return {
                start: start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }),
                end: end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }),
            };
        });
    } catch (error) {
        console.error('❌ Erreur récupération plages Google Calendar:', error.message);
        return [];
    }
}

/**
 * Crée un événement dans Google Agenda
 * @param {Object} eventData - Données de l'événement
 * @returns {Promise<string|null>} ID de l'événement créé ou null
 */
async function createEvent(eventData) {
    if (!calendar) return null;

    try {
        const result = await calendar.events.insert({
            calendarId: GOOGLE_CALENDAR_ID,
            resource: eventData,
        });
        console.log('✅ Événement Google Calendar créé:', result.data.id);
        return result.data.id;
    } catch (error) {
        console.error('❌ Erreur création événement Google Calendar:', error.message);
        return null;
    }
}

/**
 * Supprime un événement Google Calendar par son ID
 * @param {string} googleEventId - ID de l'événement à supprimer
 */
async function deleteEvent(googleEventId) {
    if (!calendar || !googleEventId) return;

    try {
        await calendar.events.delete({
            calendarId: GOOGLE_CALENDAR_ID,
            eventId: googleEventId,
        });
        console.log('✅ Événement Google Calendar supprimé:', googleEventId);
    } catch (error) {
        console.error('❌ Erreur suppression événement Google Calendar:', error.message);
    }
}

/**
 * Debug : retourne la réponse brute de l'API freebusy pour diagnostic
 */
async function debugFreeBusy(date) {
    if (!calendar) {
        return { error: 'Google Calendar non configuré', calendarId: GOOGLE_CALENDAR_ID };
    }

    try {
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: new Date(`${date}T00:00:00.000Z`).toISOString(),
                timeMax: new Date(`${date}T23:59:59.000Z`).toISOString(),
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        return {
            calendarId: GOOGLE_CALENDAR_ID,
            rawResponse: response.data.calendars[GOOGLE_CALENDAR_ID],
            allCalendars: Object.keys(response.data.calendars),
        };
    } catch (error) {
        return {
            calendarId: GOOGLE_CALENDAR_ID,
            error: error.message,
            code: error.code,
            errors: error.errors,
        };
    }
}

module.exports = {
    calendar,
    GOOGLE_CALENDAR_ID,
    isGoogleCalendarBusy,
    getGoogleCalendarBusySlots,
    createEvent,
    deleteEvent,
    debugFreeBusy,
};

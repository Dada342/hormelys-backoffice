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
 * Formate une Date en heure HH:MM dans le fuseau Europe/Paris.
 * Utilise Intl.DateTimeFormat.formatToParts pour un résultat fiable
 * quel que soit l'environnement Node.js (local, Vercel, etc.)
 * @param {Date} date
 * @returns {string} HH:MM
 */
function formatTimeParis(date) {
    const formatter = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(date);
    const h = parts.find(p => p.type === 'hour').value;
    const m = parts.find(p => p.type === 'minute').value;
    return `${h}:${m}`;
}

/**
 * Formate une Date en YYYY-MM-DD dans le fuseau Europe/Paris
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
function formatDateParis(date) {
    const formatter = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

/**
 * Incrémente une date string YYYY-MM-DD d'un jour
 * @param {string} dateStr
 * @returns {string} YYYY-MM-DD
 */
function incrementDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + 1);
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
}

/**
 * Calcule l'offset UTC de Europe/Paris pour une date donnée (ex: "+02:00" en été, "+01:00" en hiver).
 * Indispensable pour construire des timestamps RFC3339 valides pour l'API Google Calendar.
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {string} Offset au format "+HH:MM"
 */
function getParisOffsetString(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    const formatter = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Paris',
        timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(utcNoon);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    // tzPart.value = "GMT+02:00" ou "GMT+01:00"
    return tzPart?.value?.replace('GMT', '') || '+01:00';
}

/**
 * Vérifie si une plage horaire est occupée sur Google Calendar.
 * FAIL-CLOSED : retourne true (occupé) en cas d'erreur API,
 * pour empêcher les réservations quand la vérification échoue.
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} startTime - Heure de début au format HH:MM
 * @param {string} endTime - Heure de fin au format HH:MM
 * @returns {Promise<boolean>} true si le créneau est occupé
 */
async function isGoogleCalendarBusy(date, startTime, endTime) {
    if (!calendar) return false;

    try {
        const offset = getParisOffsetString(date);
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: `${date}T${startTime}:00${offset}`,
                timeMax: `${date}T${endTime}:00${offset}`,
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        const busySlots = response.data.calendars[GOOGLE_CALENDAR_ID]?.busy || [];
        return busySlots.length > 0;
    } catch (error) {
        console.error('❌ Erreur vérification Google Calendar freebusy:', error.message);
        return true; // FAIL-CLOSED : en cas d'erreur, on bloque le créneau
    }
}

/**
 * Récupère les plages occupées sur Google Calendar pour une journée entière.
 * Lance une erreur si l'API est inaccessible (fail-closed).
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<Array<{start: string, end: string}>>} Liste des plages occupées (HH:MM)
 * @throws {Error} Si l'API Google Calendar est inaccessible
 */
async function getGoogleCalendarBusySlots(date) {
    if (!calendar) return [];

    try {
        const offset = getParisOffsetString(date);
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: `${date}T00:00:00${offset}`,
                timeMax: `${date}T23:59:59${offset}`,
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        const busySlots = response.data.calendars[GOOGLE_CALENDAR_ID]?.busy || [];
        return busySlots.map(slot => ({
            start: formatTimeParis(new Date(slot.start)),
            end: formatTimeParis(new Date(slot.end)),
        }));
    } catch (error) {
        console.error('❌ Erreur récupération plages Google Calendar:', error.message);
        throw new Error('Impossible de vérifier la disponibilité Google Calendar');
    }
}

/**
 * Récupère les plages occupées sur Google Calendar pour une plage de dates.
 * Retourne un objet indexé par date avec les créneaux occupés.
 * Gère correctement les événements multi-jours (vacances, etc.).
 * @param {string} fromDate - Date de début au format YYYY-MM-DD
 * @param {string} toDate - Date de fin au format YYYY-MM-DD
 * @returns {Promise<Object<string, Array<{start: string, end: string}>>>}
 * @throws {Error} Si l'API Google Calendar est inaccessible
 */
async function getGoogleCalendarBusySlotsForRange(fromDate, toDate) {
    if (!calendar) return {};

    try {
        const fromOffset = getParisOffsetString(fromDate);
        const toOffset = getParisOffsetString(toDate);
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: `${fromDate}T00:00:00${fromOffset}`,
                timeMax: `${toDate}T23:59:59${toOffset}`,
                timeZone: 'Europe/Paris',
                items: [{ id: GOOGLE_CALENDAR_ID }],
            },
        });

        const busySlots = response.data.calendars[GOOGLE_CALENDAR_ID]?.busy || [];
        const byDate = {};

        for (const slot of busySlots) {
            const start = new Date(slot.start);
            const end = new Date(slot.end);
            const startDateStr = formatDateParis(start);
            const endDateStr = formatDateParis(end);

            if (startDateStr === endDateStr) {
                // Événement sur une seule journée
                if (!byDate[startDateStr]) byDate[startDateStr] = [];
                byDate[startDateStr].push({
                    start: formatTimeParis(start),
                    end: formatTimeParis(end),
                });
            } else {
                // Événement multi-jours : découper par journée
                // Premier jour : de l'heure de début à 23:59
                if (!byDate[startDateStr]) byDate[startDateStr] = [];
                byDate[startDateStr].push({ start: formatTimeParis(start), end: '23:59' });

                // Jours intermédiaires : journée entière bloquée
                let currentDateStr = incrementDate(startDateStr);
                while (currentDateStr < endDateStr) {
                    if (!byDate[currentDateStr]) byDate[currentDateStr] = [];
                    byDate[currentDateStr].push({ start: '00:00', end: '23:59' });
                    currentDateStr = incrementDate(currentDateStr);
                }

                // Dernier jour : de 00:00 à l'heure de fin (sauf si minuit pile)
                const endTimeStr = formatTimeParis(end);
                if (endTimeStr !== '00:00') {
                    if (!byDate[endDateStr]) byDate[endDateStr] = [];
                    byDate[endDateStr].push({ start: '00:00', end: endTimeStr });
                }
            }
        }

        return byDate;
    } catch (error) {
        console.error('❌ Erreur récupération plages Google Calendar pour la période:', error.message);
        throw new Error('Impossible de vérifier la disponibilité Google Calendar');
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

module.exports = {
    isGoogleCalendarBusy,
    getGoogleCalendarBusySlots,
    getGoogleCalendarBusySlotsForRange,
    createEvent,
    deleteEvent,
};

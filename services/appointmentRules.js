/**
 * Règles métier pures pour les rendez-vous naturopathie.
 * Aucun I/O — fonctions pures et configuration.
 */

/**
 * Vérifie si un mercredi est bloqué pour cause de délai de préparation insuffisant.
 * Règle : à partir du dimanche 12h, le mercredi suivant n'est plus réservable.
 * @param {string} dateStr - Date au format "YYYY-MM-DD"
 * @returns {boolean}
 */
function isWednesdayBlockedByPrepTime(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getDay() !== 3) return false;
    const precedingSunday = new Date(date);
    precedingSunday.setDate(date.getDate() - 3);
    precedingSunday.setHours(12, 0, 0, 0);
    return new Date() >= precedingSunday;
}

/**
 * Durées et tarifs par type de séance
 */
const SESSION_CONFIG = {
    discovery_call: { duration: 30, price: 0, label: 'Appel découverte gratuit' },
    first_session: { duration: 90, calendarDuration: 120, price: 65, label: 'Première séance (1h30)' },
    follow_up: { duration: 60, price: 55, label: 'Séance de suivi (1h)' }
};

/**
 * Calcule l'heure de fin à partir d'une heure de début et d'une durée en minutes
 * @param {string} timeStr - Heure au format "HH:MM"
 * @param {number} minutes - Durée en minutes
 * @returns {string} Heure de fin au format "HH:MM"
 */
function addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const newM = (totalMinutes % 60).toString().padStart(2, '0');
    return `${newH}:${newM}`;
}

module.exports = {
    SESSION_CONFIG,
    addMinutes,
    isWednesdayBlockedByPrepTime,
};

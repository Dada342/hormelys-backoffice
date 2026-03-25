const express = require('express');
const router = express.Router();
const AvailabilitySlot = require('../models/AvailabilitySlot');
const Appointment = require('../models/Appointment');
const authMiddleware = require('../middlewares/authMiddleware');
const { getGoogleCalendarBusySlots } = require('../services/googleCalendar');

/**
 * Calcule l'heure de fin à partir d'une heure de début et d'une durée en minutes
 */
function addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const newM = (totalMinutes % 60).toString().padStart(2, '0');
    return `${newH}:${newM}`;
}

/**
 * Durées par type de séance
 */
const SESSION_DURATIONS = {
    first_session: 90,  // 1h30
    follow_up: 60       // 1h
};

const SESSION_PRICES = {
    first_session: 65,
    follow_up: 55
};

// =============================================
// ROUTES PUBLIQUES (pas d'auth requise)
// =============================================

/**
 * GET /api/availability/slots?date=YYYY-MM-DD&type=first_session|follow_up
 * Retourne les créneaux disponibles pour une date et un type de séance
 */
router.get('/slots', async (req, res) => {
    try {
        const { date, type } = req.query;

        if (!date) {
            return res.status(400).json({ message: 'Le paramètre date est requis' });
        }

        if (!type || !SESSION_DURATIONS[type]) {
            return res.status(400).json({ message: 'Le paramètre type doit être first_session ou follow_up' });
        }

        const duration = SESSION_DURATIONS[type];

        // Récupérer les plages ouvertes pour cette date
        const openSlots = await AvailabilitySlot.getSlotsForDate(date);

        if (openSlots.length === 0) {
            return res.json({ slots: [], message: 'Aucune disponibilité pour cette date' });
        }

        // Récupérer les RDV existants pour cette date
        const existingAppointments = await Appointment.find({
            date,
            status: { $ne: 'cancelled' }
        });

        // Récupérer les plages occupées sur Google Calendar
        const googleBusySlots = await getGoogleCalendarBusySlots(date);

        // Générer les créneaux possibles par pas de 30 minutes
        const availableSlots = [];

        for (const slot of openSlots) {
            let currentTime = slot.startTime;

            while (true) {
                const endTime = addMinutes(currentTime, duration);

                // Vérifier que le créneau ne dépasse pas la plage
                if (endTime > slot.endTime) break;

                // Vérifier qu'il n'y a pas de chevauchement avec les RDV existants
                const hasConflict = existingAppointments.some(appt => {
                    const apptEnd = appt.endTime || addMinutes(appt.time, appt.duration || 30);
                    return currentTime < apptEnd && endTime > appt.time;
                });

                // Vérifier qu'il n'y a pas de chevauchement avec Google Calendar
                const hasGoogleConflict = googleBusySlots.some(busy =>
                    currentTime < busy.end && endTime > busy.start
                );

                if (!hasConflict && !hasGoogleConflict) {
                    // Vérifier que le créneau est à plus de 24h
                    const slotDateTime = new Date(`${date}T${currentTime}:00`);
                    if (slotDateTime > new Date(Date.now() + 24 * 60 * 60 * 1000)) {
                        availableSlots.push({
                            time: currentTime,
                            endTime: endTime,
                            duration: duration
                        });
                    }
                }

                // Avancer de 30 minutes
                currentTime = addMinutes(currentTime, 30);
            }
        }

        res.json({
            date,
            type,
            duration,
            price: SESSION_PRICES[type],
            slots: availableSlots
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des créneaux:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * GET /api/availability/open-days?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Retourne les jours qui ont au moins une plage ouverte (pour le calendrier côté client)
 */
router.get('/open-days', async (req, res) => {
    try {
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({ message: 'Les paramètres from et to sont requis' });
        }

        // Récupérer les plages ponctuelles dans la période
        const specificSlots = await AvailabilitySlot.find({
            isRecurring: false,
            isBlocked: false,
            date: { $gte: from, $lte: to }
        });

        // Récupérer les plages récurrentes
        const recurringSlots = await AvailabilitySlot.find({
            isRecurring: true,
            isBlocked: false
        });

        // Récupérer les jours bloqués
        const blockedDays = await AvailabilitySlot.find({
            isRecurring: false,
            isBlocked: true,
            date: { $gte: from, $lte: to }
        });

        const blockedDates = new Set(blockedDays.map(s => s.date));
        const openDays = new Set();
        const now = new Date();

        /**
         * Vérifie si une plage a encore des créneaux réservables (à plus de 24h)
         */
        const minBookingTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const hasAvailableTime = (dateStr, endTime) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const endDateTime = new Date(y, m - 1, d, ...endTime.split(':').map(Number));
            return endDateTime > minBookingTime;
        };

        // Ajouter les jours avec des plages ponctuelles (si pas terminées)
        specificSlots.forEach(slot => {
            if (!blockedDates.has(slot.date) && hasAvailableTime(slot.date, slot.endTime)) {
                openDays.add(slot.date);
            }
        });

        // Ajouter les jours récurrents dans la période
        if (recurringSlots.length > 0) {
            const recurringDaysOfWeek = new Set(recurringSlots.map(s => s.dayOfWeek));

            // Itérer par manipulation de strings YYYY-MM-DD pour éviter les problèmes de timezone
            let currentDate = from;
            while (currentDate <= to) {
                const [y, m, d] = currentDate.split('-').map(Number);
                const localDate = new Date(y, m - 1, d); // Constructeur local (pas UTC)
                const dayOfWeek = localDate.getDay();

                if (recurringDaysOfWeek.has(dayOfWeek) && !blockedDates.has(currentDate)) {
                    // Vérifier qu'au moins une plage récurrente a encore du temps disponible aujourd'hui
                    const matchingSlots = recurringSlots.filter(s => s.dayOfWeek === dayOfWeek);
                    const stillAvailable = matchingSlots.some(s => hasAvailableTime(currentDate, s.endTime));
                    if (stillAvailable) {
                        openDays.add(currentDate);
                    }
                }

                // Jour suivant
                localDate.setDate(localDate.getDate() + 1);
                const ny = localDate.getFullYear();
                const nm = String(localDate.getMonth() + 1).padStart(2, '0');
                const nd = String(localDate.getDate()).padStart(2, '0');
                currentDate = `${ny}-${nm}-${nd}`;
            }
        }

        res.json({ openDays: Array.from(openDays).sort() });
    } catch (error) {
        console.error('Erreur lors de la récupération des jours ouverts:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// =============================================
// ROUTES ADMIN (auth requise)
// =============================================

/**
 * GET /api/availability — Liste toutes les plages (admin)
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const slots = await AvailabilitySlot.find().sort({ date: 1, startTime: 1 });
        res.json(slots);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * POST /api/availability — Créer une plage horaire (admin)
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { date, startTime, endTime, isRecurring, dayOfWeek, isBlocked, note } = req.body;

        // Validation
        if (!startTime || !endTime) {
            return res.status(400).json({ message: 'Les heures de début et fin sont requises' });
        }

        if (!isRecurring && !date) {
            return res.status(400).json({ message: 'La date est requise pour une plage ponctuelle' });
        }

        if (isRecurring && (dayOfWeek === undefined || dayOfWeek === null)) {
            return res.status(400).json({ message: 'Le jour de la semaine est requis pour une plage récurrente' });
        }

        if (startTime >= endTime) {
            return res.status(400).json({ message: 'L\'heure de début doit être avant l\'heure de fin' });
        }

        const slot = new AvailabilitySlot({
            date: isRecurring ? '' : date,
            startTime,
            endTime,
            isRecurring: !!isRecurring,
            dayOfWeek: isRecurring ? dayOfWeek : undefined,
            isBlocked: !!isBlocked,
            note: note || ''
        });

        await slot.save();
        res.status(201).json(slot);
    } catch (error) {
        console.error('Erreur lors de la création:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/availability/:id — Modifier une plage (admin)
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { startTime, endTime, date, isBlocked, note } = req.body;

        if (startTime && endTime && startTime >= endTime) {
            return res.status(400).json({ message: 'L\'heure de début doit être avant l\'heure de fin' });
        }

        const slot = await AvailabilitySlot.findByIdAndUpdate(
            req.params.id,
            { ...req.body },
            { new: true, runValidators: true }
        );

        if (!slot) {
            return res.status(404).json({ message: 'Plage non trouvée' });
        }

        res.json(slot);
    } catch (error) {
        console.error('Erreur lors de la modification:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

/**
 * DELETE /api/availability/:id — Supprimer une plage (admin)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const slot = await AvailabilitySlot.findByIdAndDelete(req.params.id);

        if (!slot) {
            return res.status(404).json({ message: 'Plage non trouvée' });
        }

        res.json({ message: 'Plage supprimée avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;

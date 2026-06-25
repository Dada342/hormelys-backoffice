const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const verifyRecaptcha = require('../middlewares/recaptchaMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const { isGoogleCalendarBusy } = require('../services/googleCalendar');
const { createOrLinkClientRecordFromAppointment, detachAppointmentFromClientRecord } = require('../services/clientRecord');
const { SESSION_CONFIG, addMinutes, isWednesdayBlockedByPrepTime } = require('../services/appointmentRules');
const { createGoogleCalendarEvent, deleteGoogleCalendarEvent } = require('../services/appointmentCalendar');
const { sendConfirmationEmails, sendRescheduleEmailToClient, sendCancellationEmailToNaturopath } = require('../services/appointmentEmails');

// GET /api/appointments/availability - Récupérer les créneaux réservés
router.get('/availability', async (req, res) => {
    try {
        const bookedSlots = await Appointment.find(
            {
                status: { $ne: 'cancelled' },
                // Optionnel: ne récupérer que les créneaux futurs
                $expr: {
                    $gte: [
                        { $dateFromString: { dateString: { $concat: ['$date', 'T', '$time'] } } },
                        new Date()
                    ]
                }
            },
            'date time'
        );

        res.json(bookedSlots);
    } catch (error) {
        console.error('Erreur lors de la récupération des créneaux:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// POST /api/appointments/book - Réserver un créneau (avec vérification reCAPTCHA)
router.post('/book', verifyRecaptcha, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, date, time, type = 'discovery_call', reason } = req.body;

        // Validation des données
        if (!firstName || !lastName || !email || !phone || !date || !time) {
            return res.status(400).json({
                message: 'Tous les champs sont obligatoires'
            });
        }

        // Validation du type
        if (!SESSION_CONFIG[type]) {
            return res.status(400).json({
                message: 'Type de séance invalide'
            });
        }

        // Validation du format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: 'Format d\'email invalide'
            });
        }

        // Validation du format téléphone français
        const phoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
        if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({
                message: 'Format de téléphone invalide'
            });
        }

        // Vérifier que le créneau est à plus de 24h
        const appointmentDateTime = new Date(date + 'T' + time);
        const minBookingTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (appointmentDateTime <= minBookingTime) {
            return res.status(400).json({
                message: 'Les réservations doivent être effectuées au moins 24 heures à l\'avance'
            });
        }

        // Vérifier le délai de préparation pour les mercredis
        if (isWednesdayBlockedByPrepTime(date)) {
            return res.status(400).json({
                message: 'Les réservations pour ce mercredi sont clôturées. Veuillez choisir le mercredi suivant.'
            });
        }

        const config = SESSION_CONFIG[type];
        const endTime = addMinutes(time, config.duration);

        // Vérifier si le créneau est occupé sur Google Calendar
        const googleBusy = await isGoogleCalendarBusy(date, time, endTime);
        if (googleBusy) {
            return res.status(409).json({
                message: 'Ce créneau n\'est pas disponible'
            });
        }

        // Vérification selon le type
        if (type === 'discovery_call') {
            // Logique simple pour les appels découverte (inchangée)
            const isAvailable = await Appointment.isSlotAvailable(date, time);
            if (!isAvailable) {
                return res.status(409).json({
                    message: 'Ce créneau est déjà réservé'
                });
            }
        } else {
            // Pour les consultations cabinet : vérifier la collision de plages horaires
            const isAvailable = await Appointment.isTimeRangeAvailable(date, time, endTime);
            if (!isAvailable) {
                return res.status(409).json({
                    message: 'Ce créneau chevauche un rendez-vous existant'
                });
            }

            // Vérifier que le créneau est bien dans une plage ouverte
            const openSlots = await AvailabilitySlot.getSlotsForDate(date);
            const isInOpenSlot = openSlots.some(slot =>
                time >= slot.startTime && endTime <= slot.endTime
            );
            if (!isInOpenSlot) {
                return res.status(400).json({
                    message: 'Ce créneau n\'est pas dans une plage de disponibilité'
                });
            }
        }

        // Créer le rendez-vous avec un token d'annulation unique
        const cancellationToken = crypto.randomUUID();
        const appointment = new Appointment({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            date,
            time,
            endTime,
            type,
            duration: config.duration,
            price: config.price,
            notes: type === 'first_session' && reason ? reason.trim() : '',
            status: 'confirmed',
            cancellationToken
        });

        await appointment.save();

        // Créer l'événement dans Google Agenda de la naturopathe
        const googleEventId = await createGoogleCalendarEvent(appointment);
        if (googleEventId) {
            appointment.googleEventId = googleEventId;
        }

        // Auto-création / lien de la fiche cliente pour les RDV physiques uniquement
        if (appointment.type === 'first_session' || appointment.type === 'follow_up') {
            try {
                await createOrLinkClientRecordFromAppointment(appointment);
            } catch (clientRecordError) {
                // Ne pas faire échouer la réservation si la création de fiche échoue
                console.error('Erreur création/lien fiche cliente:', clientRecordError);
            }
        }

        // Envoyer les emails de confirmation
        const emailSent = await sendConfirmationEmails(appointment);

        // Mettre à jour le statut d'envoi d'email
        appointment.emailSent = emailSent;
        await appointment.save();

        res.status(201).json({
            message: 'Rendez-vous réservé avec succès',
            appointment: {
                id: appointment._id,
                date: appointment.date,
                time: appointment.time,
                endTime: appointment.endTime,
                type: appointment.type,
                duration: appointment.duration,
                price: appointment.price,
                emailSent: appointment.emailSent
            }
        });

    } catch (error) {
        console.error('Erreur lors de la réservation:', error);
        res.status(500).json({
            message: 'Erreur lors de la réservation'
        });
    }
});

// POST /api/appointments/book-admin - Réserver un créneau depuis le panel admin (JWT requis, pas de reCAPTCHA)
router.post('/book-admin', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, date, time } = req.body;
        const type = 'follow_up';

        if (!firstName || !lastName || !email || !phone || !date || !time) {
            return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Format d\'email invalide' });
        }

        const config = SESSION_CONFIG[type];
        const endTime = addMinutes(time, config.duration);

        // Vérifier si le créneau est occupé sur Google Calendar
        const googleBusy = await isGoogleCalendarBusy(date, time, endTime);
        if (googleBusy) {
            return res.status(409).json({ message: 'Ce créneau n\'est pas disponible (Google Agenda)' });
        }

        // Vérifier la collision avec les RDV existants
        const isAvailable = await Appointment.isTimeRangeAvailable(date, time, endTime);
        if (!isAvailable) {
            return res.status(409).json({ message: 'Ce créneau chevauche un rendez-vous existant' });
        }

        // Vérifier que le créneau est dans une plage ouverte
        const openSlots = await AvailabilitySlot.getSlotsForDate(date);
        const isInOpenSlot = openSlots.some(slot =>
            time >= slot.startTime && endTime <= slot.endTime
        );
        if (!isInOpenSlot) {
            return res.status(400).json({ message: 'Ce créneau n\'est pas dans une plage de disponibilité' });
        }

        const cancellationToken = crypto.randomUUID();
        const appointment = new Appointment({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            date,
            time,
            endTime,
            type,
            duration: config.duration,
            price: config.price,
            notes: '',
            status: 'confirmed',
            cancellationToken
        });

        await appointment.save();

        const googleEventId = await createGoogleCalendarEvent(appointment);
        if (googleEventId) {
            appointment.googleEventId = googleEventId;
        }

        try {
            await createOrLinkClientRecordFromAppointment(appointment);
        } catch (err) {
            console.error('Erreur création/lien fiche cliente (book-admin):', err);
        }

        const emailSent = await sendConfirmationEmails(appointment);
        appointment.emailSent = emailSent;
        await appointment.save();

        res.status(201).json({
            message: 'Rendez-vous réservé avec succès',
            appointment: {
                id: appointment._id,
                date: appointment.date,
                time: appointment.time,
                endTime: appointment.endTime,
                type: appointment.type,
                duration: appointment.duration,
                price: appointment.price,
                emailSent: appointment.emailSent
            }
        });
    } catch (error) {
        console.error('Erreur lors de la réservation admin:', error);
        res.status(500).json({ message: 'Erreur lors de la réservation' });
    }
});

// GET /api/appointments/cancel-by-token/:token - Récupérer les infos du RDV via le token
router.get('/cancel-by-token/:token', async (req, res) => {
    try {
        const appointment = await Appointment.findOne({
            cancellationToken: req.params.token
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Ce rendez-vous a déjà été annulé' });
        }

        const config = SESSION_CONFIG[appointment.type] || SESSION_CONFIG.discovery_call;

        res.json({
            id: appointment._id,
            firstName: appointment.firstName,
            lastName: appointment.lastName,
            date: appointment.date,
            time: appointment.time,
            type: appointment.type,
            typeLabel: config.label,
            duration: appointment.duration,
            price: appointment.price,
            status: appointment.status
        });
    } catch (error) {
        console.error('Erreur lors de la récupération du RDV par token:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// PUT /api/appointments/cancel-by-token/:token - Annuler un RDV via le token
router.put('/cancel-by-token/:token', async (req, res) => {
    try {
        const appointment = await Appointment.findOne({
            cancellationToken: req.params.token
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        // Supprimer l'événement du Google Agenda de la naturopathe
        await deleteGoogleCalendarEvent(appointment.googleEventId);

        // Détacher le RDV de sa fiche cliente associée (smart cleanup si fiche orpheline non activée)
        try {
            const cleanup = await detachAppointmentFromClientRecord(appointment);
            if (cleanup.action === 'deleted') {
                console.log(`Fiche cliente ${cleanup.clientRecordId} supprimée (orpheline + non activée)`);
            }
        } catch (cleanupError) {
            console.error('Erreur cleanup fiche cliente lors de l\'annulation:', cleanupError);
        }

        // Supprimer le rendez-vous de la base de données
        await Appointment.findByIdAndDelete(appointment._id);

        // Notifier la naturopathe de l'annulation
        await sendCancellationEmailToNaturopath(appointment);

        res.json({
            message: 'Rendez-vous annulé et supprimé avec succès',
            appointment: { id: appointment._id }
        });
    } catch (error) {
        console.error('Erreur lors de l\'annulation par token:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// GET /api/appointments - Récupérer tous les rendez-vous (pour l'admin)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status, type, from, to } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (type) filter.type = type;
        if (from || to) {
            filter.date = {};
            if (from) filter.date.$gte = from;
            if (to) filter.date.$lte = to;
        }

        const appointments = await Appointment.find(filter)
            .sort({ date: 1, time: 1 });

        res.json(appointments);
    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// PUT /api/appointments/:id - Modifier un rendez-vous (admin)
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { date, time, type, notes } = req.body;
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Impossible de modifier un rendez-vous annulé' });
        }

        const newType = type || appointment.type;
        const newDate = date || appointment.date;
        const newTime = time || appointment.time;
        const config = SESSION_CONFIG[newType] || SESSION_CONFIG.discovery_call;
        const newEndTime = addMinutes(newTime, config.duration);

        // Vérifier la disponibilité du nouveau créneau (sauf si date/heure inchangées)
        if (date || time) {
            if (newType === 'discovery_call') {
                const existing = await Appointment.findOne({
                    _id: { $ne: appointment._id },
                    date: newDate,
                    time: newTime,
                    status: { $ne: 'cancelled' }
                });
                if (existing) {
                    return res.status(409).json({ message: 'Ce créneau est déjà réservé' });
                }
            } else {
                const overlapping = await Appointment.findOne({
                    _id: { $ne: appointment._id },
                    date: newDate,
                    status: { $ne: 'cancelled' },
                    time: { $lt: newEndTime },
                    endTime: { $gt: newTime }
                });
                if (overlapping) {
                    return res.status(409).json({ message: 'Ce créneau chevauche un rendez-vous existant' });
                }
            }
        }

        // Mettre à jour les champs
        appointment.date = newDate;
        appointment.time = newTime;
        appointment.endTime = newEndTime;
        appointment.type = newType;
        appointment.duration = config.duration;
        appointment.price = config.price;
        if (notes !== undefined) appointment.notes = notes;
        appointment.updatedAt = new Date();

        await appointment.save();

        // Mettre à jour Google Calendar si l'événement existe
        if (appointment.googleEventId) {
            try {
                await deleteGoogleCalendarEvent(appointment.googleEventId);
                const newGoogleEventId = await createGoogleCalendarEvent(appointment);
                if (newGoogleEventId) {
                    appointment.googleEventId = newGoogleEventId;
                    await appointment.save();
                }
            } catch (calError) {
                console.error('Erreur mise à jour Google Calendar:', calError.message);
            }
        }

        // Notifier la cliente par email uniquement si la date ou l'heure a changé
        if (date || time) {
            await sendRescheduleEmailToClient(appointment);
        }

        res.json({
            message: 'Rendez-vous modifié avec succès',
            appointment
        });
    } catch (error) {
        console.error('Erreur lors de la modification:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// DELETE /api/appointments/:id/cancel - Annuler et supprimer un rendez-vous
router.delete('/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        // Supprimer l'événement du Google Agenda
        await deleteGoogleCalendarEvent(appointment.googleEventId);

        // Détacher le RDV de sa fiche cliente associée (smart cleanup si fiche orpheline non activée)
        try {
            const cleanup = await detachAppointmentFromClientRecord(appointment);
            if (cleanup.action === 'deleted') {
                console.log(`Fiche cliente ${cleanup.clientRecordId} supprimée (orpheline + non activée)`);
            }
        } catch (cleanupError) {
            console.error('Erreur cleanup fiche cliente lors de l\'annulation:', cleanupError);
        }

        // Supprimer le rendez-vous de la base de données
        await Appointment.findByIdAndDelete(appointment._id);

        res.json({
            message: 'Rendez-vous annulé et supprimé avec succès',
            appointment: { id: appointment._id }
        });
    } catch (error) {
        console.error('Erreur lors de l\'annulation:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;

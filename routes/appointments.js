const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const nodemailer = require('nodemailer');
const verifyRecaptcha = require('../middleware/recaptchaMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * Durées et tarifs par type de séance
 */
const SESSION_CONFIG = {
    discovery_call: { duration: 30, price: 0, label: 'Appel découverte gratuit' },
    first_session: { duration: 90, price: 65, label: 'Première séance (1h30)' },
    follow_up: { duration: 60, price: 55, label: 'Séance de suivi (1h)' }
};

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

// Configuration SMTP IONOS avec mot de passe d'application
console.log('=== Configuration SMTP en production ===');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'DÉFINI' : 'NON DÉFINI');
console.log('SMTP_FROM:', process.env.SMTP_FROM);
console.log('NATUROPATH_EMAIL:', process.env.NATUROPATH_EMAIL);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true, // SSL pour port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    debug: true, // Active les logs détaillés en production
    logger: true,
    // Options supplémentaires pour la production
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    tls: {
        rejectUnauthorized: false
    }
});

// Test de connexion SMTP au démarrage
transporter.verify(function(error, success) {
    if (error) {
        console.error('❌ ERREUR de connexion SMTP:', error);
    } else {
        console.log('✅ Serveur SMTP prêt à envoyer des emails');
    }
});

// Fonction pour envoyer les emails avec nodemailer
const sendConfirmationEmails = async (appointment) => {
    const { firstName, lastName, email, phone, date, time, type, duration, price, endTime, cancellationToken, notes } = appointment;
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.hormelys.com';
    const cancellationUrl = `${frontendUrl}/rendez-vous/annulation?token=${cancellationToken}`;
    const rescheduleUrl = `${frontendUrl}/rendez-vous/reprogrammer?token=${cancellationToken}`;
    const config = SESSION_CONFIG[type] || SESSION_CONFIG.discovery_call;

    // Format de la date pour l'affichage
    const appointmentDate = new Date(date + 'T' + time);
    const formattedDate = appointmentDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const isConsultation = type === 'first_session' || type === 'follow_up';
    const durationLabel = duration === 90 ? '1h30' : duration === 60 ? '1h' : '30 minutes';
    const typeLabel = config.label;
    const subjectClient = isConsultation
        ? `Confirmation de votre consultation - Hormelys`
        : 'Confirmation de votre rendez-vous découverte - Hormelys';
    const subjectNaturo = isConsultation
        ? `Nouvelle consultation réservée - ${config.label}`
        : 'Nouveau rendez-vous découverte réservé';

    // Email pour le client
    const clientEmailOptions = {
        from: process.env.SMTP_FROM,
        to: email,
        subject: subjectClient,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Confirmation de rendez-vous</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                        <tr>
                            <td align="center" style="padding: 20px; background-color: #ffffff !important;">
                                <table cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff !important; padding: 20px; border-radius: 10px;">
                                    <tr>
                                        <td align="center" style="background-color: #ffffff !important; padding: 10px;">
                                            <img src="${process.env.FRONTEND_URL || 'https://www.hormelys.com'}/assets/logohormelys1.webp" alt="Hormelys - Naturopathie" width="200" height="auto" style="max-width: 200px; height: auto; display: block; border: none; outline: none;">
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    
                    <h1 style="color: #A13D6C; text-align: center; margin-bottom: 20px;">
                        🎉 Rendez-vous confirmé !
                    </h1>

                    <p style="font-size: 16px; margin-bottom: 15px;">
                        Bonjour <strong>${firstName}</strong>,
                    </p>

                    <p style="font-size: 16px; margin-bottom: 20px;">
                        ${isConsultation
                            ? `Votre <strong>${typeLabel}</strong> au Pôle Santé de Gignac avec <strong>Nathalia</strong> a été confirmée avec succès.`
                            : `Votre rendez-vous découverte de <strong>30 minutes</strong> par téléphone avec <strong>Nathalia</strong> a été confirmé avec succès.`
                        }
                    </p>
                    
                    <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #A13D6C;">
                        <h3 style="margin-top: 0; color: #A13D6C; font-size: 18px;">
                            Détails de votre rendez-vous
                        </h3>
                        <p style="margin: 12px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Date</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${formattedDate}</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Horaire</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${time} → ${endTime} (${durationLabel})</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Type</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${typeLabel}</p>

                        ${isConsultation ? `
                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Tarif</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${price}€</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Lieu</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">Pôle Santé de Gignac — Box 203, 2e étage</p>
                        <p style="margin: 4px 0 0 0; color: #555; font-size: 14px;">280 avenue de Lodève — 34150 GIGNAC</p>
                        ` : `
                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Votre numéro</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${phone}</p>
                        `}
                    </div>
                    
                    ${isConsultation ? `
                    <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #b3d9ff;">
                        <p style="margin: 0; color: #0066cc; font-weight: bold;">
                            📍 Votre consultation aura lieu au Pôle Santé de Gignac
                        </p>
                        <p style="margin: 5px 0 0 0; color: #0066cc;">
                            Box 203, 2e étage - 280 avenue de Lodève - 34150 GIGNAC
                        </p>
                    </div>

                    <div style="background-color: #f0f7f0; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c3dfc3;">
                        <h4 style="margin-top: 0; color: #2e7d32;">📋 Pensez à apporter :</h4>
                        <ul style="color: #555; line-height: 1.8; margin-bottom: 0;">
                            <li>Vos dernières analyses biologiques</li>
                            <li>La liste de vos traitements en cours</li>
                        </ul>
                    </div>

                    <p style="color: #555; margin-top: 15px;">
                        Règlement de <strong>${price}€</strong> en espèces, par chèque ou par virement lors de la séance.
                    </p>
                    ` : `
                    <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #b3d9ff;">
                        <p style="margin: 0; color: #0066cc; font-weight: bold;">
                            📞 Je vous appellerai au numéro que vous avez fourni : ${phone}
                        </p>
                    </div>

                    <h3 style="color: #A13D6C; margin-top: 30px;">
                        🎯 Ce rendez-vous découverte nous permettra de :
                    </h3>
                    <ul style="color: #555; line-height: 1.8;">
                        <li>Faire connaissance et comprendre vos besoins</li>
                        <li>Discuter de vos objectifs de santé</li>
                        <li>Voir comment la naturopathie peut vous accompagner</li>
                        <li>Répondre à toutes vos questions</li>
                    </ul>
                    `}
                    
                    <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                        <p style="margin: 0; color: #856404;">
                            ⚠️ <strong>Important :</strong> Si vous devez annuler ce rendez-vous, merci de le faire au moins 24h à l'avance.
                        </p>
                    </div>

                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${rescheduleUrl}" style="display: inline-block; padding: 12px 30px; background-color: #2C6E63; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: bold; margin-right: 10px;">
                            Reprogrammer mon rendez-vous
                        </a>
                    </div>
                    <div style="text-align: center; margin: 10px 0 25px 0;">
                        <a href="${cancellationUrl}" style="display: inline-block; padding: 10px 24px; background-color: transparent; color: #dc3545; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: bold; border: 2px solid #dc3545;">
                            Annuler mon rendez-vous
                        </a>
                    </div>
                    
                    <p style="font-size: 16px; margin-top: 30px; color: #A13D6C; font-weight: bold;">
                        J'ai hâte de vous rencontrer ! 🌿
                    </p>
                    
                    <div style="margin-top: 30px; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
                        <p style="margin: 0; font-size: 16px;">
                            À bientôt,<br>
                            <strong style="color: #A13D6C;">Nathalia Laffont</strong><br>
                            <em>Naturopathe certifiée</em>
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                        <p style="color: #666; font-size: 14px; margin: 5px 0;">
                            <strong>Hormelys - Naturopathie</strong>
                        </p>
                        <p style="color: #666; font-size: 14px; margin: 5px 0;">
                            280 Avenue de Lodève, 34150 Gignac
                        </p>
                        <p style="color: #666; font-size: 14px; margin: 5px 0;">
                            Tél : 06 85 68 30 59
                        </p>
                        <p style="color: #666; font-size: 14px; margin: 5px 0;">
                            <a href="https://www.hormelys.com" style="color: #A13D6C; text-decoration: none;">
                                🌐 www.hormelys.com
                            </a>
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `
    };
    
    // Email pour la naturopathe
    const naturopathEmailOptions = {
        from: process.env.SMTP_FROM,
        to: process.env.NATUROPATH_EMAIL,
        subject: isConsultation ? `🔔 ${subjectNaturo}` : '🔔 Nouveau rendez-vous découverte réservé',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Nouveau rendez-vous</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                    
                    <h1 style="color: #A13D6C; text-align: center; margin-bottom: 20px;">
                        🔔 ${isConsultation ? 'Nouvelle consultation réservée' : 'Nouveau rendez-vous découverte'}
                    </h1>

                    <p style="font-size: 16px; text-align: center; color: #666; margin-bottom: 30px;">
                        ${isConsultation
                            ? `Un client a réservé une <strong>${typeLabel}</strong>`
                            : 'Un nouveau client a réservé un rendez-vous découverte'
                        }
                    </p>
                    
                    <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #28a745;">
                        <h3 style="margin-top: 0; color: #28a745; font-size: 18px;">
                            Informations du client
                        </h3>
                        <p style="margin: 12px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Nom</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${firstName} ${lastName}</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Email</p>
                        <p style="margin: 0; color: #333; font-size: 16px;">${email}</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Téléphone</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${phone}</p>
                    </div>

                    ${notes ? `
                    <div style="background-color: #f3e5f5; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #9c27b0;">
                        <h3 style="margin-top: 0; color: #9c27b0; font-size: 18px;">
                            📝 Raison de la venue :
                        </h3>
                        <p style="margin: 0; color: #333; font-size: 16px;">${notes}</p>
                    </div>
                    ` : ''}

                    <div style="background-color: #e3f2fd; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #2196f3;">
                        <h3 style="margin-top: 0; color: #2196f3; font-size: 18px;">
                            Détails du rendez-vous
                        </h3>
                        <p style="margin: 12px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Date</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${formattedDate}</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Horaire</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${time} → ${endTime} (${durationLabel})</p>

                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Type</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${typeLabel}</p>

                        ${isConsultation ? `
                        <p style="margin: 16px 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Tarif</p>
                        <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">${price}€</p>
                        ` : ''}
                    </div>
                    
                    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 25px 0; border: 2px solid #ff9800;">
                        <h3 style="margin-top: 0; color: #f57c00; font-size: 16px;">
                            🎯 ${isConsultation ? 'Consultation prévue :' : 'Action requise :'}
                        </h3>
                        <p style="margin: 0; color: #e65100; font-weight: bold; font-size: 16px;">
                            ${isConsultation
                                ? `📍 Consultation au cabinet - ${typeLabel}<br>📅 Le ${formattedDate} de ${time} à ${endTime}`
                                : `📞 Appeler ${firstName} ${lastName} au ${phone}<br>📅 Le ${formattedDate} à ${time}`
                            }
                        </p>
                    </div>
                    
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h4 style="margin-top: 0; color: #2e7d32;">📞 Contact client :</h4>
                        <p style="margin: 5px 0; font-size: 18px;">
                            <a href="tel:${phone}" style="color: #2e7d32; text-decoration: none; font-weight: bold;">
                                ${phone}
                            </a>
                        </p>
                        <p style="margin: 5px 0;">
                            <a href="mailto:${email}" style="color: #2e7d32; text-decoration: none;">
                                ${email}
                            </a>
                        </p>
                    </div>
                    
                    <p style="color: #666; font-style: italic; margin-top: 30px; text-align: center; font-size: 14px;">
                        ✅ Un email de confirmation a été automatiquement envoyé au client.
                    </p>
                    
                    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                        <p style="color: #A13D6C; font-size: 14px; margin: 5px 0;">
                            <strong>Système de réservation Hormelys</strong>
                        </p>
                        <p style="color: #666; font-size: 12px; margin: 5px 0;">
                            Email automatique - Système de réservation Hormelys
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `
    };
    
    try {
        console.log('=== Tentative d\'envoi des emails de confirmation ===');
        console.log('Email client vers:', email);
        console.log('Email naturopathe vers:', process.env.NATUROPATH_EMAIL);

        // Envoyer l'email client d'abord
        console.log('Envoi de l\'email client...');
        const clientResult = await transporter.sendMail(clientEmailOptions);
        console.log('✅ Email client envoyé avec succès:', clientResult.messageId);

        // Attendre 2 secondes puis envoyer l'email naturopathe
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Envoi de l\'email naturopathe...');
        const naturopathResult = await transporter.sendMail(naturopathEmailOptions);
        console.log('✅ Email naturopathe envoyé avec succès:', naturopathResult.messageId);

        console.log('=== Tous les emails de confirmation envoyés avec succès ===');
        return true;
    } catch (error) {
        console.error('❌ ERREUR lors de l\'envoi des emails:');
        console.error('Type d\'erreur:', error.name);
        console.error('Message:', error.message);
        console.error('Code:', error.code);
        console.error('Response:', error.response);
        console.error('Stack:', error.stack);
        // Même en cas d'erreur d'email, la réservation est valide
        return false;
    }
};

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

        // Vérifier que la date/heure n'est pas dans le passé
        const appointmentDateTime = new Date(date + 'T' + time);
        if (appointmentDateTime <= new Date()) {
            return res.status(400).json({
                message: 'Impossible de réserver un créneau dans le passé'
            });
        }

        const config = SESSION_CONFIG[type];
        const endTime = addMinutes(time, config.duration);

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

        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Ce rendez-vous a déjà été annulé' });
        }

        appointment.status = 'cancelled';
        await appointment.save();

        // Notifier la naturopathe de l'annulation
        const appointmentDate = new Date(appointment.date + 'T' + appointment.time);
        const formattedDate = appointmentDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const config = SESSION_CONFIG[appointment.type] || SESSION_CONFIG.discovery_call;

        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: process.env.NATUROPATH_EMAIL,
                subject: `❌ Annulation - ${appointment.firstName} ${appointment.lastName} - ${formattedDate}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head><meta charset="utf-8"></head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                            <h1 style="color: #dc3545; text-align: center;">❌ Rendez-vous annulé</h1>
                            <p style="font-size: 16px; text-align: center; color: #666;">
                                <strong>${appointment.firstName} ${appointment.lastName}</strong> a annulé son rendez-vous.
                            </p>
                            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #dc3545;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: bold; color: #555;">Type :</td>
                                        <td style="padding: 8px 0; color: #333;">${config.label}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: bold; color: #555;">Date :</td>
                                        <td style="padding: 8px 0; color: #333;">${formattedDate}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: bold; color: #555;">Heure :</td>
                                        <td style="padding: 8px 0; color: #333;">${appointment.time}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: bold; color: #555;">Email :</td>
                                        <td style="padding: 8px 0; color: #333;">${appointment.email}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: bold; color: #555;">Téléphone :</td>
                                        <td style="padding: 8px 0; color: #333;">${appointment.phone}</td>
                                    </tr>
                                </table>
                            </div>
                            <p style="color: #666; font-style: italic; text-align: center; font-size: 14px;">
                                Ce créneau est de nouveau disponible.
                            </p>
                            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                                <p style="color: #A13D6C; font-size: 14px;"><strong>Système de réservation Hormelys</strong></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            });
            console.log('✅ Email d\'annulation envoyé à la naturopathe');
        } catch (emailError) {
            console.error('❌ Erreur envoi email annulation:', emailError.message);
        }

        res.json({
            message: 'Rendez-vous annulé avec succès',
            appointment: { id: appointment._id, status: 'cancelled' }
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

// PUT /api/appointments/:id/cancel - Annuler un rendez-vous
router.put('/:id/cancel', async (req, res) => {
    try {
        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { status: 'cancelled', updatedAt: new Date() },
            { new: true }
        );
        
        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }
        
        res.json({ 
            message: 'Rendez-vous annulé avec succès',
            appointment 
        });
    } catch (error) {
        console.error('Erreur lors de l\'annulation:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const nodemailer = require('nodemailer');

/**
 * Durées et tarifs par type de séance (identique à appointments.js)
 */
const SESSION_CONFIG = {
    discovery_call: { duration: 30, price: 0, label: 'Appel découverte gratuit' },
    first_session: { duration: 90, price: 65, label: 'Première séance (1h30)' },
    follow_up: { duration: 60, price: 55, label: 'Séance de suivi (1h)' }
};

/**
 * Configuration du transporteur SMTP
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Middleware de vérification du secret CRON
 */
function verifyCronSecret(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ message: 'Non autorisé' });
    }
    next();
}

/**
 * Génère le HTML de l'email de rappel pour un rendez-vous
 */
function buildReminderEmail(appointment) {
    const { firstName, phone, date, time, type, duration, price, endTime, cancellationToken } = appointment;
    const config = SESSION_CONFIG[type] || SESSION_CONFIG.discovery_call;
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.hormelys.com';
    const cancellationUrl = `${frontendUrl}/rendez-vous/annulation?token=${cancellationToken}`;

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

    const subject = isConsultation
        ? 'Rappel : votre consultation demain - Hormelys'
        : 'Rappel : votre rendez-vous découverte demain - Hormelys';

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Rappel de rendez-vous</title>
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
                    🔔 Rappel de votre rendez-vous demain
                </h1>

                <p style="font-size: 16px; margin-bottom: 15px;">
                    Bonjour <strong>${firstName}</strong>,
                </p>

                <p style="font-size: 16px; margin-bottom: 20px;">
                    ${isConsultation
                        ? `Nous vous rappelons que votre <strong>${typeLabel}</strong> au Pôle Santé de Gignac avec <strong>Nathalia</strong> a lieu <strong>demain</strong>.`
                        : `Nous vous rappelons que votre rendez-vous découverte de <strong>30 minutes</strong> par téléphone avec <strong>Nathalia</strong> a lieu <strong>demain</strong>.`
                    }
                </p>

                <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #A13D6C;">
                    <h3 style="margin-top: 0; color: #A13D6C; font-size: 18px;">
                        📅 Détails de votre rendez-vous :
                    </h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Date :</td>
                            <td style="padding: 8px 0; color: #333;">${formattedDate}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">🕐 Heure :</td>
                            <td style="padding: 8px 0; color: #333;">${time}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">⏱️ Durée :</td>
                            <td style="padding: 8px 0; color: #333;">${durationLabel}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">📋 Type :</td>
                            <td style="padding: 8px 0; color: #333;">${typeLabel}</td>
                        </tr>
                        ${isConsultation ? `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">💶 Tarif :</td>
                            <td style="padding: 8px 0; color: #333;">${price}€</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">📍 Lieu :</td>
                            <td style="padding: 8px 0; color: #333;">Pôle Santé de Gignac - Box 203, 2e étage<br>280 avenue de Lodève - 34150 GIGNAC</td>
                        </tr>
                        ` : `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #555;">📱 Votre numéro :</td>
                            <td style="padding: 8px 0; color: #333;">${phone}</td>
                        </tr>
                        `}
                    </table>
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
                `}

                <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                    <p style="margin: 0; color: #856404;">
                        ⚠️ <strong>Important :</strong> Si vous devez annuler ce rendez-vous, vous pouvez le faire via le bouton ci-dessous.
                    </p>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                    <a href="${cancellationUrl}" style="display: inline-block; padding: 12px 30px; background-color: #dc3545; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: bold;">
                        Annuler mon rendez-vous
                    </a>
                </div>

                <p style="font-size: 16px; margin-top: 30px; color: #A13D6C; font-weight: bold;">
                    À demain ! 🌿
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
    `;

    return { subject, html };
}

/**
 * GET /api/cron/send-reminders
 * Envoie un email de rappel aux clients dont le RDV est demain (J+1)
 * Protégé par CRON_SECRET
 */
router.get('/send-reminders', verifyCronSecret, async (req, res) => {
    try {
        // Calculer la date de demain au format YYYY-MM-DD
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        console.log(`=== CRON: Recherche des RDV pour demain (${tomorrowStr}) ===`);

        // Trouver les RDV confirmés de demain sans rappel envoyé
        const appointments = await Appointment.find({
            date: tomorrowStr,
            status: 'confirmed',
            reminderSent: { $ne: true }
        });

        console.log(`${appointments.length} rappel(s) à envoyer`);

        let sent = 0;
        let errors = 0;

        for (const appointment of appointments) {
            try {
                const { subject, html } = buildReminderEmail(appointment);

                await transporter.sendMail({
                    from: process.env.SMTP_FROM,
                    to: appointment.email,
                    subject,
                    html
                });

                appointment.reminderSent = true;
                await appointment.save();
                sent++;

                console.log(`✅ Rappel envoyé à ${appointment.email} pour le ${tomorrowStr} à ${appointment.time}`);

                // Pause de 2s entre chaque email pour ne pas surcharger le SMTP
                if (appointments.indexOf(appointment) < appointments.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (emailError) {
                errors++;
                console.error(`❌ Erreur envoi rappel à ${appointment.email}:`, emailError.message);
            }
        }

        res.json({
            message: `Rappels traités pour le ${tomorrowStr}`,
            total: appointments.length,
            sent,
            errors
        });
    } catch (error) {
        console.error('❌ Erreur CRON send-reminders:', error);
        res.status(500).json({ message: 'Erreur lors de l\'envoi des rappels' });
    }
});

module.exports = router;

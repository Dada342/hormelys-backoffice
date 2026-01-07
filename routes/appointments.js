const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const nodemailer = require('nodemailer');

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
    const { firstName, lastName, email, phone, date, time } = appointment;
    
    // Format de la date pour l'affichage
    const appointmentDate = new Date(date + 'T' + time);
    const formattedDate = appointmentDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Email pour le client
    const clientEmailOptions = {
        from: process.env.SMTP_FROM,
        to: email,
        subject: 'Confirmation de votre rendez-vous découverte - Hormelys',
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
                        Votre rendez-vous découverte de <strong>30 minutes</strong> par téléphone avec <strong>Nathalia</strong> a été confirmé avec succès.
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
                                <td style="padding: 8px 0; color: #333;">30 minutes</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">📞 Type :</td>
                                <td style="padding: 8px 0; color: #333;">Appel téléphonique gratuit</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">📱 Votre numéro :</td>
                                <td style="padding: 8px 0; color: #333;">${phone}</td>
                            </tr>
                        </table>
                    </div>
                    
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
                    
                    <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                        <p style="margin: 0; color: #856404;">
                            ⚠️ <strong>Important :</strong> Si vous devez annuler ou reporter ce rendez-vous, merci de me contacter au moins 24h à l'avance.
                        </p>
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
        subject: '🔔 Nouveau rendez-vous découverte réservé',
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
                        🔔 Nouveau rendez-vous découverte
                    </h1>
                    
                    <p style="font-size: 16px; text-align: center; color: #666; margin-bottom: 30px;">
                        Un nouveau client a réservé un rendez-vous découverte
                    </p>
                    
                    <div style="background-color: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #28a745;">
                        <h3 style="margin-top: 0; color: #28a745; font-size: 18px;">
                            👤 Informations du client :
                        </h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555; width: 30%;">Prénom :</td>
                                <td style="padding: 8px 0; color: #333;">${firstName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Nom :</td>
                                <td style="padding: 8px 0; color: #333;">${lastName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Email :</td>
                                <td style="padding: 8px 0; color: #333;">${email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Téléphone :</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold;">${phone}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background-color: #e3f2fd; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #2196f3;">
                        <h3 style="margin-top: 0; color: #2196f3; font-size: 18px;">
                            📅 Détails du rendez-vous :
                        </h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555; width: 30%;">Date :</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold;">${formattedDate}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Heure :</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold;">${time}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Durée :</td>
                                <td style="padding: 8px 0; color: #333;">30 minutes</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; color: #555;">Type :</td>
                                <td style="padding: 8px 0; color: #333;">Appel découverte gratuit</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 25px 0; border: 2px solid #ff9800;">
                        <h3 style="margin-top: 0; color: #f57c00; font-size: 16px;">
                            🎯 Action requise :
                        </h3>
                        <p style="margin: 0; color: #e65100; font-weight: bold; font-size: 16px;">
                            📞 Appeler ${firstName} ${lastName} au ${phone}
                            <br>
                            📅 Le ${formattedDate} à ${time}
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

// POST /api/appointments/book - Réserver un créneau
router.post('/book', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, date, time, type = 'discovery_call' } = req.body;
        
        // Validation des données
        if (!firstName || !lastName || !email || !phone || !date || !time) {
            return res.status(400).json({ 
                message: 'Tous les champs sont obligatoires' 
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
        
        // Vérifier si le créneau est disponible
        const isAvailable = await Appointment.isSlotAvailable(date, time);
        if (!isAvailable) {
            return res.status(409).json({ 
                message: 'Ce créneau est déjà réservé' 
            });
        }
        
        // Vérifier que la date/heure n'est pas dans le passé
        const appointmentDateTime = new Date(date + 'T' + time);
        if (appointmentDateTime <= new Date()) {
            return res.status(400).json({ 
                message: 'Impossible de réserver un créneau dans le passé' 
            });
        }
        
        // Créer le rendez-vous
        const appointment = new Appointment({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            date,
            time,
            type,
            status: 'confirmed'
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
                type: appointment.type,
                emailSent: appointment.emailSent
            }
        });
        
    } catch (error) {
        console.error('Erreur lors de la réservation:', error);
        
        if (error.code === 11000) {
            // Erreur de duplication (créneau déjà réservé)
            return res.status(409).json({ 
                message: 'Ce créneau est déjà réservé' 
            });
        }
        
        res.status(500).json({ 
            message: 'Erreur lors de la réservation' 
        });
    }
});

// GET /api/appointments - Récupérer tous les rendez-vous (pour l'admin)
router.get('/', async (req, res) => {
    try {
        const appointments = await Appointment.find()
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
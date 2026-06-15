const nodemailer = require('nodemailer');

/**
 * Transporter SMTP partage pour les emails autres que la chaine RDV.
 * Initialise une seule fois au chargement du module.
 * Note : la chaine RDV (routes/appointments.js) conserve son propre transporter
 * pour eviter de toucher au code existant qui marche en prod.
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: true, // SSL pour port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    tls: { rejectUnauthorized: false }
});

/**
 * Construit le header From avec un nom d'affichage humain.
 * Ex: '"Nathalia Laffont - Hormelys" <contact@hormelys.com>'.
 * Le nom d'affichage est configurable via SMTP_FROM_NAME (defaut: "Hormelys").
 */
function buildFrom() {
    const fromName = process.env.SMTP_FROM_NAME || 'Hormelys';
    return `"${fromName}" <${process.env.SMTP_FROM}>`;
}

/**
 * Envoie un email via le transporter partage.
 * Inclut systematiquement un Reply-To pour permettre aux destinataires
 * de repondre directement a la naturopathe.
 * @param {Object} options
 * @param {string} options.to - Adresse email du destinataire
 * @param {string} options.subject - Sujet
 * @param {string} options.html - Corps HTML
 * @param {string} [options.text] - Version texte alternative (recommande pour deliverabilite)
 * @returns {Promise<Object>} Le messageInfo de nodemailer
 */
async function sendMail({ to, subject, html, text }) {
    return transporter.sendMail({
        from: buildFrom(),
        replyTo: process.env.NATUROPATH_EMAIL || process.env.SMTP_FROM,
        to,
        subject,
        html,
        text
    });
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://www.hormelys.com';

/**
 * Construit l'email de notification envoyé à Nathalia quand une cliente envoie un message.
 * @param {{ prenom: string, nom: string, content: string, adminUrl: string }} params
 * @returns {{ html: string, text: string }}
 */
function buildClientMessageNotificationEmail({ prenom, nom, content, adminUrl }) {
    const safeContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    const text = `Bonjour Nathalia,

${prenom} ${nom} vous a envoyé un message depuis son espace personnel :

« ${content} »

Répondre depuis l'admin : ${adminUrl}

—
Hormelys — Naturopathie
${PUBLIC_BASE_URL}`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                <h2 style="color: #A13D6C; margin-bottom: 4px;">💬 Nouveau message</h2>
                <p style="color: #666; margin-top: 0;">${prenom} ${nom} vous a écrit depuis son espace personnel.</p>
                <div style="background-color: #F5E8EF; padding: 20px; border-radius: 12px; border-left: 4px solid #A13D6C; margin: 20px 0;">
                    <p style="margin: 0; font-size: 15px; color: #333;">${safeContent}</p>
                </div>
                <p>
                    <a href="${adminUrl}" style="display: inline-block; background: linear-gradient(to right, #2C6E63, #3D8B7A); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                        Répondre depuis l'admin →
                    </a>
                </p>
                <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                    <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Hormelys — Naturopathie</strong></p>
                    <a href="${PUBLIC_BASE_URL}" style="color: #A13D6C; font-size: 14px; text-decoration: none;">www.hormelys.com</a>
                </div>
            </div>
        </body>
        </html>
    `;
    return { html, text };
}

/**
 * Construit l'email de notification envoyé à la cliente quand Nathalia lui répond.
 * @param {{ prenom: string, content: string, espaceUrl: string }} params
 * @returns {{ html: string, text: string }}
 */
function buildAdminMessageNotificationEmail({ prenom, content, espaceUrl }) {
    const safeContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    const text = `Bonjour ${prenom},

Votre naturopathe Nathalia Laffont vous a envoyé un message dans votre espace personnel :

« ${content} »

Accéder à votre espace : ${espaceUrl}

À très bientôt,
Nathalia Laffont — Naturopathe certifiée

—
Hormelys — Naturopathie
${PUBLIC_BASE_URL}`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                <h2 style="color: #A13D6C; margin-bottom: 4px;">💬 Nouveau message de Nathalia</h2>
                <p style="color: #666; margin-top: 0;">Bonjour <strong>${prenom}</strong>, votre naturopathe vous a répondu.</p>
                <div style="background-color: #F5E8EF; padding: 20px; border-radius: 12px; border-left: 4px solid #A13D6C; margin: 20px 0;">
                    <p style="margin: 0; font-size: 15px; color: #333;">${safeContent}</p>
                </div>
                <p>
                    <a href="${espaceUrl}" style="display: inline-block; background: linear-gradient(to right, #2C6E63, #3D8B7A); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                        Voir mon espace personnel →
                    </a>
                </p>
                <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
                    <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Hormelys — Naturopathie</strong></p>
                    <a href="${PUBLIC_BASE_URL}" style="color: #A13D6C; font-size: 14px; text-decoration: none;">www.hormelys.com</a>
                </div>
            </div>
        </body>
        </html>
    `;
    return { html, text };
}

module.exports = { sendMail, buildClientMessageNotificationEmail, buildAdminMessageNotificationEmail };

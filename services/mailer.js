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

module.exports = { sendMail };

const axios = require('axios');

/**
 * Middleware pour vérifier le token reCAPTCHA v3
 * Score attendu : 0.5 ou plus (0.0 = bot, 1.0 = humain)
 */
async function verifyRecaptcha(req, res, next) {
    // En développement, bypass la vérification reCAPTCHA
    if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ reCAPTCHA bypassed en mode développement');
        return next();
    }

    const { recaptchaToken } = req.body;

    // Si pas de token, rejeter la requête
    if (!recaptchaToken) {
        console.log('❌ Pas de token reCAPTCHA fourni');
        return res.status(400).json({
            success: false,
            message: 'Vérification de sécurité échouée'
        });
    }

    try {
        // Vérifier le token auprès de Google
        const verificationURL = 'https://www.google.com/recaptcha/api/siteverify';
        const response = await axios.post(verificationURL, null, {
            params: {
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: recaptchaToken
            }
        });

        const { success, score, action } = response.data;

        console.log(`🔒 reCAPTCHA - Success: ${success}, Score: ${score}, Action: ${action}`);

        // Vérifier si la requête est valide
        if (!success) {
            console.log('❌ reCAPTCHA validation échouée');
            return res.status(400).json({
                success: false,
                message: 'Vérification de sécurité échouée'
            });
        }

        // Vérifier le score (0.5 est le seuil recommandé par Google)
        if (score < 0.5) {
            console.log(`❌ Score reCAPTCHA trop bas: ${score}`);
            return res.status(403).json({
                success: false,
                message: 'Votre requête semble suspecte. Veuillez réessayer.'
            });
        }

        console.log(`✅ reCAPTCHA validé - Score: ${score}`);

        // Si tout est OK, continuer
        next();

    } catch (error) {
        console.error('Erreur lors de la vérification reCAPTCHA:', error);
        // En cas d'erreur, on laisse passer pour ne pas bloquer les vrais utilisateurs
        // mais on log l'erreur
        console.warn('⚠️ Erreur reCAPTCHA - Requête autorisée par défaut');
        next();
    }
}

module.exports = verifyRecaptcha;

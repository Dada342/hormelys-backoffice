const express = require('express');
const router = express.Router();
const axios = require('axios'); // Assurez-vous d'avoir axios installé

// Route pour récupérer les avis Google
router.get('/google-reviews', async (req, res) => {
    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        const placeId = process.env.GOOGLE_PLACE_ID;

        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,reviews,rating,user_ratings_total&key=${apiKey}&language=fr`;
        const response = await axios.get(url);

        if (response.data.result && response.data.result.reviews) {
            const reviews = response.data.result.reviews.map((review) => ({
                authorName: review.author_name,
                rating: review.rating,
                text: review.text,
                response: review.response ? review.response.text : null,
                relativeTime: review.relative_time_description,
            }));
            return res.status(200).json({
                name: response.data.result.name,
                rating: response.data.result.rating,
                reviews: reviews,
            });
        } else {
            return res.status(404).json({ message: 'Aucun avis trouvé pour ce lieu.' });
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des avis Google :', error.message);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

module.exports = router;
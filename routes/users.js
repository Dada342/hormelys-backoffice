const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // modèle User
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt';

// Route d'inscription
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Créez un nouvel utilisateur
    const user = new User({ username, email, password });
    await user.save();

    // Générez le token JWT après l'enregistrement
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

    // Envoyez le message de succès et le token
    res.status(201).json({ message: 'Utilisateur créé avec succès', token });
  } catch (error) {
    res.status(400).json({ error: 'Erreur lors de la création de l’utilisateur' });
  }
});


// Route de connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de serveur' });
  }
});

module.exports = router;


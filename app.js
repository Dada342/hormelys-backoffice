require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

const connectDB = require("./models/connection");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const articlesRouter = require('./routes/articles');
const reviewsRouter = require('./routes/reviews');
const appointmentsRouter = require('./routes/appointments');


var app = express();
const cors = require('cors');

// Configuration de CORS
const corsOptions = {
    origin: [
        'http://localhost:3000', // Frontend Next.js
        'http://localhost:3001', // Backend Express
        'https://hormelys-backoffice.onrender.com',
        'https://hormelys.com',
        'https://www.hormelys.com'
    ], // Origines autorisées
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'], // Ajoutez 'Cache-Control'
    credentials: true, // Si des cookies sont nécessaires
};

// Middleware CORS avec les options spécifiées
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pour répondre aux pré-requêtes OPTIONS

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Middleware pour assurer que MongoDB est connecté avant de traiter les requêtes
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('Erreur de connexion MongoDB:', error);
        res.status(500).json({ message: 'Erreur de connexion à la base de données' });
    }
});

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes de l'application
app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/appointments', appointmentsRouter);

module.exports = app;




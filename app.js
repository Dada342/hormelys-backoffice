require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

require("./models/connection");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const articlesRouter = require('./routes/articles');

var app = express();
const cors = require('cors');

// Configuration de CORS
const corsOptions = {
    origin: [
        'http://localhost:3001',
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

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes de l'application
app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/articles', articlesRouter);

module.exports = app;




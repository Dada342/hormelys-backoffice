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

// Configuration des en-têtes CORS pour autoriser le domaine https://www.hormelys.com
app.use(cors({
    origin: 'https://www.hormelys.com',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
}));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Servir les images du dossier uploads
app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.hormelys.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Routes de l'application
app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/articles', articlesRouter);

module.exports = app;


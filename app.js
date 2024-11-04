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
app.use(cors());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/articles', articlesRouter);

module.exports = app;

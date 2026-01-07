const mongoose = require('mongoose');

const connectionString = process.env.MONGODB_URI;

// Configuration optimisée pour Vercel serverless
const options = {
    bufferCommands: false, // Désactive le buffering des commandes si pas connecté
    serverSelectionTimeoutMS: 10000, // Timeout pour sélectionner un serveur (10s)
    socketTimeoutMS: 45000, // Timeout pour les opérations socket (45s)
    maxPoolSize: 10, // Taille max du pool de connexions
};

// Réutiliser la connexion existante pour éviter de créer plusieurs connexions
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        console.log('✅ Utilisation de la connexion MongoDB en cache');
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(connectionString, options)
            .then((mongoose) => {
                console.log('✅ Nouvelle connexion MongoDB établie');
                return mongoose;
            })
            .catch((error) => {
                console.error('❌ Erreur de connexion MongoDB:', error);
                cached.promise = null;
                throw error;
            });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

// Établir la connexion au démarrage
connectDB();

module.exports = connectDB;
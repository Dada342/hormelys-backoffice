const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    time: {
        type: String, // Format: HH:MM
        required: true
    },
    type: {
        type: String,
        enum: ['discovery_call', 'first_session', 'follow_up'],
        default: 'discovery_call'
    },
    price: {
        type: Number,
        default: 0 // 0 pour discovery_call, 65 pour first_session, 55 pour follow_up
    },
    endTime: {
        type: String, // Format: HH:MM — heure de fin calculée selon la durée
        default: ''
    },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'completed'],
        default: 'confirmed'
    },
    duration: {
        type: Number,
        default: 30 // en minutes
    },
    notes: {
        type: String,
        default: ''
    },
    emailSent: {
        type: Boolean,
        default: false
    },
    reminderSent: {
        type: Boolean,
        default: false
    },
    cancellationToken: {
        type: String,
        unique: true,
        sparse: true
    },
    googleEventId: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index pour rechercher efficacement les RDV par date
appointmentSchema.index({ date: 1, time: 1 });

// Middleware pour mettre à jour updatedAt
appointmentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Méthode pour formater la date et l'heure
appointmentSchema.methods.getFormattedDateTime = function() {
    const date = new Date(this.date + 'T' + this.time);
    return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Méthode pour vérifier si le créneau est disponible (appels découverte — logique simple)
appointmentSchema.statics.isSlotAvailable = async function(date, time) {
    const existingAppointment = await this.findOne({
        date,
        time,
        status: { $ne: 'cancelled' }
    });
    return !existingAppointment;
};

/**
 * Vérifie si une plage horaire est libre (pas de chevauchement avec d'autres RDV)
 * Utilisé pour les consultations cabinet avec durées variables
 */
appointmentSchema.statics.isTimeRangeAvailable = async function(date, startTime, endTime) {
    const overlapping = await this.findOne({
        date,
        status: { $ne: 'cancelled' },
        // Un RDV existant chevauche si son début < notre fin ET sa fin > notre début
        time: { $lt: endTime },
        endTime: { $gt: startTime }
    });
    return !overlapping;
};

module.exports = mongoose.model('Appointment', appointmentSchema);
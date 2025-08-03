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
        enum: ['discovery_call', 'consultation', 'follow_up'],
        default: 'discovery_call'
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
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index unique pour empêcher les réservations multiples du même créneau
appointmentSchema.index({ date: 1, time: 1 }, { unique: true });

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

// Méthode pour vérifier si le créneau est disponible
appointmentSchema.statics.isSlotAvailable = async function(date, time) {
    const existingAppointment = await this.findOne({ 
        date, 
        time, 
        status: { $ne: 'cancelled' } 
    });
    return !existingAppointment;
};

module.exports = mongoose.model('Appointment', appointmentSchema);
const mongoose = require('mongoose');

const availabilitySlotSchema = new mongoose.Schema({
    date: {
        type: String, // Format: YYYY-MM-DD (vide pour les plages récurrentes)
        default: ''
    },
    startTime: {
        type: String, // Format: HH:MM
        required: true
    },
    endTime: {
        type: String, // Format: HH:MM
        required: true
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    dayOfWeek: {
        type: Number, // 0=dimanche, 1=lundi, ..., 6=samedi (utilisé si isRecurring)
        min: 0,
        max: 6
    },
    isBlocked: {
        type: Boolean,
        default: false // true = créneau bloqué (vacances, absence)
    },
    note: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index pour rechercher rapidement par date
availabilitySlotSchema.index({ date: 1 });
availabilitySlotSchema.index({ isRecurring: 1, dayOfWeek: 1 });

/**
 * Vérifie que startTime < endTime
 */
availabilitySlotSchema.pre('save', function(next) {
    if (this.startTime >= this.endTime) {
        return next(new Error('L\'heure de début doit être avant l\'heure de fin'));
    }
    next();
});

/**
 * Récupère toutes les plages ouvertes pour une date donnée
 * Combine les plages ponctuelles + récurrentes, en excluant les bloquées
 */
availabilitySlotSchema.statics.getSlotsForDate = async function(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(y, m - 1, d); // Constructeur local (pas UTC)
    const dayOfWeek = date.getDay();

    // Plages spécifiques à cette date (ponctuelles)
    const specificSlots = await this.find({
        date: dateString,
        isRecurring: false
    });

    // Plages récurrentes pour ce jour de la semaine
    const recurringSlots = await this.find({
        isRecurring: true,
        dayOfWeek: dayOfWeek
    });

    // Séparer les plages bloquées des plages ouvertes
    const blockedSlots = specificSlots.filter(s => s.isBlocked);
    const openSpecific = specificSlots.filter(s => !s.isBlocked);
    const openRecurring = recurringSlots.filter(s => !s.isBlocked);

    // Si des plages ponctuelles existent pour cette date, elles prennent le dessus sur les récurrentes
    const openSlots = openSpecific.length > 0 ? openSpecific : openRecurring;

    // Filtrer les plages ouvertes en retirant les plages bloquées
    if (blockedSlots.length === 0) {
        return openSlots;
    }

    // Retirer les plages qui chevauchent un blocage
    return openSlots.filter(slot => {
        return !blockedSlots.some(blocked =>
            slot.startTime < blocked.endTime && slot.endTime > blocked.startTime
        );
    });
};

module.exports = mongoose.model('AvailabilitySlot', availabilitySlotSchema);

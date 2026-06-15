const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    clientRecordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientRecord',
        required: true,
        index: true
    },
    senderType: {
        type: String,
        enum: ['admin', 'client'],
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    readAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

module.exports = mongoose.model('Message', messageSchema);

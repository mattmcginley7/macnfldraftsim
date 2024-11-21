// models/User.js
const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true } // In a real application, ensure this is hashed
});

module.exports = mongoose.model('User', UserSchema);

import { Schema, model } from "mongoose";

const userSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  points: {
    type: Number,
    default: 0,
    required: true
  },
});

module.exports = model['user'] || model('user', userSchema);
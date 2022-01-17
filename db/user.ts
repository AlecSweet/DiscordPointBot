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

const userModel = model['user'] || model('user', userSchema);

export default userModel;
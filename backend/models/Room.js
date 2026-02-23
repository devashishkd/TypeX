import { Schema, model } from 'mongoose';

const playerSchema = new Schema(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    isReady:  { type: Boolean, default: false },
  },
  { _id: false }
);

const roomSchema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Room name is required'],
      unique: true,
      trim: true,
      maxlength: 30,
    },
    mode: {
      type: String,
      enum: ['1v1', 'multi'],
      default: 'multi',
    },
    maxPlayers: {
      type: Number,
      default: 6,  // 2 for 1v1, up to 6 for multi
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      default: null,
      select: false,
    },
    status: {
      type: String,
      enum: ['waiting', 'starting', 'in-progress', 'done'],
      default: 'waiting',
    },
    players: {
      type: [playerSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

const Room = model('Room', roomSchema);

export default Room;

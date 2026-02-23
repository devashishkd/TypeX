import Room from '../models/Room.js';

// generates a short room code like "XKTP-4829"
// 4 random uppercase letters + 4 random digits
const generateRoomCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * 26)];
  code += '-';
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * 10)];
  return code;
};

// helper to remove the password field before sending room data to client
// cuz we dont want anyone to see the room password in the response lol
const sanitizeRoom = (room) => {
  const obj = room.toObject();
  delete obj.password;
  return obj;
};

// ─── Create Room ────────────────────────────────────────────────────────────
// makes a new room and adds the creator as the first player automatically
// if its a private room, they gotta provide a password 
// for 1v1 mode we force maxPlayers to 2, otherwise default is 6

export const createRoom = async (req, res) => {
  try {
    const { name, mode = 'multi', isPrivate = false, password = null, maxPlayers } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Room name is required.' });
    }

    // check if a room with this name already exists
    const nameExists = await Room.findOne({ name: name.trim() });
    if (nameExists) {
      return res.status(409).json({ message: 'A room with this name already exists.' });
    }

    // cant make a private room without a password, that makes no sense
    if (isPrivate && !password) {
      return res.status(400).json({ message: 'Private rooms require a password.' });
    }

    // 1v1 = 2 players max, multi = whatever they want (default 6)
    const resolvedMaxPlayers = mode === '1v1' ? 2 : (maxPlayers ?? 6);

    const room = await Room.create({
      roomId: generateRoomCode(),
      name: name.trim(),
      mode,
      isPrivate,
      password: isPrivate ? password : null,
      maxPlayers: resolvedMaxPlayers,
      createdBy: req.user.id,
      players: [
        {
          userId: req.user.id,
          username: req.user.username,
          isReady: false,
        },
      ],
    });

    return res.status(201).json({
      message: 'Room created successfully.',
      room: sanitizeRoom(room),
    });
  } catch (error) {
    console.error('[createRoom]', error);
    res.status(500).json({ message: 'Server error while creating room.' });
  }
};

// ─── List Rooms ─────────────────────────────────────────────────────────────
// shows all public rooms that are still waiting for players
// private rooms wont show up here obviously
// you can filter by mode with ?mode=1v1 or ?mode=multi

export const listRooms = async (req, res) => {
  try {
    const { mode } = req.query;

    const filter = {
      isPrivate: false,
      status: 'waiting',
    };

    // only add mode filter if they actually passed a valid one
    if (mode && ['1v1', 'multi'].includes(mode)) {
      filter.mode = mode;
    }

    const rooms = await Room.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(50);

    // dont show rooms that are already full, no point
    const availableRooms = rooms.filter((r) => r.players.length < r.maxPlayers);

    return res.status(200).json({ rooms: availableRooms });
  } catch (error) {
    console.error('[listRooms]', error);
    res.status(500).json({ message: 'Server error while fetching rooms.' });
  }
};

// ─── Get Single Room ────────────────────────────────────────────────────────
// just fetches one room by its roomId
// used when the player enters the lobby page

export const getRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId }).select('-password');

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    return res.status(200).json({ room });
  } catch (error) {
    console.error('[getRoom]', error);
    res.status(500).json({ message: 'Server error while fetching room.' });
  }
};

// ─── Join Room ──────────────────────────────────────────────────────────────
// adds the user to a room
// checks a bunch of stuff first:
//   - does the room exist?
//   - is it still in waiting status?

export const joinRoom = async (req, res) => {
  try {
    const { roomId, password } = req.body;

    if (!roomId) {
      return res.status(400).json({ message: 'roomId is required.' });
    }

    // we need the password field to check it, so select('+password')
    const room = await Room.findOne({ roomId }).select('+password');

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    // too late buddy, game already started or finished
    if (room.status !== 'waiting') {
      return res.status(400).json({ message: 'Room is no longer accepting players.' });
    }

    // room is full, cant join
    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ message: 'Room is full.' });
    }

    // wrong password for private room
    if (room.isPrivate) {
      if (!password || password !== room.password) {
        return res.status(403).json({ message: 'Incorrect room password.' });
      }
    }

    // check if they're already in the room (dont add duplicates)
    const alreadyIn = room.players.some(
      (p) => p.userId.toString() === req.user.id
    );
    if (alreadyIn) {
      return res.status(200).json({
        message: 'Already in room.',
        room: sanitizeRoom(room),
      });
    }

    // all good, add them to the room
    room.players.push({
      userId: req.user.id,
      username: req.user.username,
      isReady: false,
    });

    await room.save();

    return res.status(200).json({
      message: 'Joined room successfully.',
      room: sanitizeRoom(room),
    });
  } catch (error) {
    console.error('[joinRoom]', error);
    res.status(500).json({ message: 'Server error while joining room.' });
  }
};

// ─── Leave Room ─────────────────────────────────────────────────────────────
// removes the user from a room
// if nobody is left in the room after they leave, just delete the whole room
// no point keeping empty rooms in the db

export const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ message: 'roomId is required.' });
    }

    const room = await Room.findOne({ roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    // filter out the leaving player
    room.players = room.players.filter(
      (p) => p.userId.toString() !== req.user.id
    );

    // if room is empty now, just nuke it
    if (room.players.length === 0) {
      await Room.deleteOne({ roomId });
      return res.status(200).json({ message: 'Left room. Room deleted (empty).' });
    }

    await room.save();

    return res.status(200).json({
      message: 'Left room successfully.',
      room: sanitizeRoom(room),
    });
  } catch (error) {
    console.error('[leaveRoom]', error);
    res.status(500).json({ message: 'Server error while leaving room.' });
  }
};

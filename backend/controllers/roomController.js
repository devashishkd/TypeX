import { v4 as uuidv4 } from 'uuid';
import Room from '../models/Room.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Strip the password field from a Room document before sending to client.
 */
const sanitizeRoom = (room) => {
  const obj = room.toObject();
  delete obj.password;
  return obj;
};

// ─── controllers ────────────────────────────────────────────────────────────

/**
 * @route  POST /api/rooms/create
 * @access Private
 * @body   { name, mode?, isPrivate?, password?, maxPlayers? }
 *
 * Creates a new room and automatically adds the creator as the first player.
 */
export const createRoom = async (req, res) => {
  try {
    const { name, mode = 'multi', isPrivate = false, password = null, maxPlayers } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Room name is required.' });
    }

    // Private rooms must have a password
    if (isPrivate && !password) {
      return res.status(400).json({ message: 'Private rooms require a password.' });
    }

    // Resolve sensible maxPlayers
    const resolvedMaxPlayers = mode === '1v1' ? 2 : (maxPlayers ?? 6);

    const room = await Room.create({
      roomId: uuidv4(),
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

// ────────────────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/rooms
 * @access Private
 * @query  mode? ('1v1' | 'multi') — optional filter
 *
 * Returns all public rooms that are in 'waiting' status and not full.
 * Private rooms are excluded from this listing.
 */
export const listRooms = async (req, res) => {
  try {
    const { mode } = req.query;

    const filter = {
      isPrivate: false,
      status: 'waiting',
    };

    if (mode && ['1v1', 'multi'].includes(mode)) {
      filter.mode = mode;
    }

    const rooms = await Room.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(50);

    // Only return rooms that are not yet full
    const availableRooms = rooms.filter((r) => r.players.length < r.maxPlayers);

    return res.status(200).json({ rooms: availableRooms });
  } catch (error) {
    console.error('[listRooms]', error);
    res.status(500).json({ message: 'Server error while fetching rooms.' });
  }
};

// ────────────────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/rooms/:roomId
 * @access Private
 *
 * Returns details of a specific room (used when entering lobby).
 * Password is never returned.
 */
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

// ────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/rooms/join
 * @access Private
 * @body   { roomId, password? }
 *
 * Adds the authenticated user to a room.
 * Validates: room exists, not full, not in-progress, correct password (if private).
 */
export const joinRoom = async (req, res) => {
  try {
    const { roomId, password } = req.body;

    if (!roomId) {
      return res.status(400).json({ message: 'roomId is required.' });
    }

    // Fetch with password so we can validate it
    const room = await Room.findOne({ roomId }).select('+password');

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    // Cannot join a room that has already started or finished
    if (room.status !== 'waiting') {
      return res.status(400).json({ message: 'Room is no longer accepting players.' });
    }

    // Check capacity
    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ message: 'Room is full.' });
    }

    // Validate password for private rooms
    if (room.isPrivate) {
      if (!password || password !== room.password) {
        return res.status(403).json({ message: 'Incorrect room password.' });
      }
    }

    // Prevent duplicate joins
    const alreadyIn = room.players.some(
      (p) => p.userId.toString() === req.user.id
    );
    if (alreadyIn) {
      // Return room data anyway — idempotent
      return res.status(200).json({
        message: 'Already in room.',
        room: sanitizeRoom(room),
      });
    }

    // Add the player
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

// ────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/rooms/leave
 * @access Private
 * @body   { roomId }
 *
 * Removes the authenticated user from a room.
 * If the room becomes empty, it is deleted from the database.
 */
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

    // Remove the player
    room.players = room.players.filter(
      (p) => p.userId.toString() !== req.user.id
    );

    // Clean up empty rooms
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

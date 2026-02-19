import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  createRoom,
  listRooms,
  getRoom,
  joinRoom,
  leaveRoom,
} from '../controllers/roomController.js';

const router = Router();

// All room routes require authentication
router.use(protect);

router.get('/',           listRooms);    // GET  /api/rooms         — list public waiting rooms
router.post('/create',    createRoom);   // POST /api/rooms/create  — create a room
router.get('/:roomId',    getRoom);      // GET  /api/rooms/:roomId — get single room details
router.post('/join',      joinRoom);     // POST /api/rooms/join    — join a room
router.post('/leave',     leaveRoom);    // POST /api/rooms/leave   — leave a room

export default router;
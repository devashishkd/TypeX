import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getProfile,
  updateProfile,
  changePassword,
  getUserById,
} from '../controllers/userController.js';

const router = Router();

// All user routes require authentication
router.use(protect);

router.get('/me',              getProfile);      // GET  /api/users/me              — own profile
router.put('/me',              updateProfile);    // PUT  /api/users/me              — update profile
router.put('/me/password',     changePassword);   // PUT  /api/users/me/password     — change password
router.get('/:userId',         getUserById);      // GET  /api/users/:userId         — public profile

export default router;
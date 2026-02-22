import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getLeaderboard } from '../controllers/leaderboardController.js';

const router = Router();

router.use(protect);

router.get('/', getLeaderboard);  // GET /api/leaderboard

export default router;

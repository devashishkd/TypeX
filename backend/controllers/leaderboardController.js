import User from '../models/User.js';

// ─── Leaderboard ────────────────────────────────────────────────────────────
// gets the top players sorted by their best wpm
// only shows people who have actually played at least 1 game
// you can pass ?limit=10 to control how many results (max 100)

export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const players = await User.find({ 'stats.gamesPlayed': { $gt: 0 } })
      .select('username stats.bestWpm stats.avgWpm stats.wins stats.gamesPlayed stats.avgAccuracy')
      .sort({ 'stats.bestWpm': -1 })
      .limit(limit);

    return res.status(200).json({ leaderboard: players });
  } catch (error) {
    console.error('[getLeaderboard]', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard.' });
  }
};

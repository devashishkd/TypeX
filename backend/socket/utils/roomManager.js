// socket/utils/roomManager.js
//
// this is our IN-MEMORY store for live game data
// its just a Map (like a JS object but better for this use case)
//
// WHY NOT USE THE DATABASE?
//   during a game, players send progress updates every ~300ms
//   thats like 3-4 updates PER SECOND per player
//   if 5 players are in a game, thats 15-20 writes per second
//   hitting MongoDB that fast would be slow and wasteful
//
//   instead, we keep the live game data in memory (RAM) — instant read/write
//   and only save the FINAL results to MongoDB when the game ends
//
// WHAT DOES IT STORE?
//   for each room that has an active game, we store:
//   {
//     text:       "the quick brown fox...",   ← the paragraph everyone is typing
//     players:    Map of { progress, wpm, accuracy, finished },
//     startTime:  when the game started,
//     status:     "countdown" | "playing" | "finished",
//     countdown:  seconds remaining before game starts,
//     timer:      reference to the countdown setInterval (so we can clear it)
//   }
//
// LIFECYCLE:
//   1. room:ready triggers countdown → createGame() → status: "countdown"
//   2. countdown hits 0 → status: "playing"
//   3. all players finish → status: "finished" → save to DB → deleteGame()

// the Map — key is roomId, value is the game state object
const games = new Map();

// ─── sample paragraphs for typing ─────────────────────────────────
// in a real app you'd fetch these from a DB or API
// for now, here are some fun ones to practice with
const paragraphs = [
  "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet at least once, making it a perfect typing test.",
  "Programming is like writing a book. You start with a blank page, add characters one at a time, and hope it all makes sense when you are done.",
  "The best way to predict the future is to create it. Every line of code you write today shapes the software of tomorrow. Keep building, keep learning.",
  "In the world of web development, JavaScript is everywhere. From the browser to the server, from mobile apps to desktop tools, it powers the modern internet.",
  "A good developer is not someone who writes code without bugs. A good developer is someone who writes code that other people can understand and maintain.",
  "The internet is a global network of computers connected together. When you visit a website, your computer sends a request to a server, which sends back the page you see.",
  "React makes it painless to create interactive user interfaces. Design simple views for each state, and React will efficiently update and render the right components.",
  "Typing speed matters, but accuracy matters more. A fast typist who makes lots of mistakes will always lose to a slower typist who gets every word right the first time.",
];

// ─── Pick a random paragraph ──────────────────────────────────────
function getRandomText() {
  return paragraphs[Math.floor(Math.random() * paragraphs.length)];
}

// ─── Create a new game for a room ─────────────────────────────────
// called when the countdown starts (all players ready)
function createGame(roomId, playerIds) {
  const text = getRandomText();

  // create a Map of all players and their initial stats
  const players = new Map();
  playerIds.forEach(({ userId, username }) => {
    players.set(userId, {
      username,
      progress: 0,       // how much of the text they've typed (0-100%)
      wpm: 0,            // words per minute
      accuracy: 100,     // percentage of correct keystrokes
      finished: false,    // have they completed the text?
      finishTime: null,   // when they finished (for ranking)
    });
  });

  const game = {
    text,
    players,
    startTime: null,      // set when countdown ends
    status: "countdown",  // countdown → playing → finished
    countdown: 15,        // seconds until game starts
    timer: null,          // setInterval reference
  };

  games.set(roomId, game);
  return game;
}

// ─── Get the game state for a room ────────────────────────────────
function getGame(roomId) {
  return games.get(roomId);
}

// ─── Update a player's progress ───────────────────────────────────
// called every time a player types (debounced on the client)
function updatePlayerProgress(roomId, userId, { progress, wpm, accuracy }) {
  const game = games.get(roomId);
  if (!game) return null;

  const player = game.players.get(userId);
  if (!player) return null;

  player.progress = progress;
  player.wpm = wpm;
  player.accuracy = accuracy;

  return player;
}

// ─── Mark a player as finished ────────────────────────────────────
function finishPlayer(roomId, userId) {
  const game = games.get(roomId);
  if (!game) return null;

  const player = game.players.get(userId);
  if (!player || player.finished) return null;

  player.finished = true;
  player.finishTime = Date.now();

  // check if ALL players are done
  const allFinished = [...game.players.values()].every((p) => p.finished);
  if (allFinished) {
    game.status = "finished";
  }

  return { player, allFinished };
}

// ─── Get the results (sorted by finish time) ─────────────────────
function getResults(roomId) {
  const game = games.get(roomId);
  if (!game) return [];

  return [...game.players.entries()]
    .map(([userId, data]) => ({
      userId,
      username: data.username,
      wpm: data.wpm,
      accuracy: data.accuracy,
      progress: data.progress,
      finished: data.finished,
      finishTime: data.finishTime,
    }))
    // sort: finished players first (by time), then unfinished by progress
    .sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
}

// ─── Remove a player from an active game (if they leave) ─────────────────
function removePlayerFromGame(roomId, userId) {
  const game = games.get(roomId);
  if (!game) return null;

  if (!game.players.has(userId)) return null;
  game.players.delete(userId);

  if (game.players.size === 0) {
    return { gameDeleted: true, allFinished: false };
  }

  const allFinished = [...game.players.values()].every((p) => p.finished);
  if (allFinished) {
    game.status = "finished";
  }

  return { gameDeleted: false, allFinished };
}

// ─── Delete the game when its over ────────────────────────────────
function deleteGame(roomId) {
  const game = games.get(roomId);
  if (game?.timer) {
    clearInterval(game.timer);
  }
  games.delete(roomId);
}

export {
  createGame,
  getGame,
  updatePlayerProgress,
  finishPlayer,
  getResults,
  deleteGame,
  getRandomText,
  removePlayerFromGame,
};

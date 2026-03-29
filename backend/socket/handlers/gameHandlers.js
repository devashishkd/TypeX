// socket/handlers/gameHandlers.js
//
// handles all the in-game socket events:
//   - game:progress → player sends their typing progress (wpm, accuracy, %)
//   - game:finish   → player completed the text
//
// the flow:
//   1. game starts → everyone has the same text to type
//   2. as each player types, their client emits "game:progress" every ~300ms
//   3. server updates the in-memory state (roomManager) and broadcasts to everyone
//   4. when a player finishes typing the whole text, they emit "game:finish"
//   5. server marks them as done and broadcasts the update
//   6. when ALL players finish → server emits "game:results" with final rankings
//
// all the live data lives in roomManager.js (in-memory Map)
// we only hit MongoDB at the very end to save the results

import {
  getGame,
  updatePlayerProgress,
  finishPlayer,
  getResults,
  deleteGame,
} from "../utils/roomManager.js";

export function registerGameHandlers(io, socket) {

  // ─── game:progress ────────────────────────────────────────────────
  // client sends this every ~300ms while the player is typing
  //
  // what the client sends:
  //   { roomId, progress: 45.2, wpm: 78, accuracy: 96.5 }
  //
  // what the server does:
  //   1. update this player's stats in the in-memory game state
  //   2. broadcast ALL players' stats to the room so everyone can
  //      see each other's progress bars moving in real-time
  //
  // we broadcast ALL players (not just the one who sent the update)
  // because each client needs the full picture to render progress bars

  socket.on("game:progress", ({ roomId, progress, wpm, accuracy }) => {
    const game = getGame(roomId);
    if (!game || game.status !== "playing") return;

    // update this player's stats in memory
    updatePlayerProgress(roomId, socket.user.id, {
      progress,
      wpm,
      accuracy,
    });

    // build a snapshot of ALL players' current stats
    const allPlayers = [];
    game.players.forEach((data, userId) => {
      allPlayers.push({
        userId,
        username: data.username,
        progress: data.progress,
        wpm: data.wpm,
        accuracy: data.accuracy,
        finished: data.finished,
      });
    });

    // broadcast to everyone in the room (including sender)
    // the client uses this to update all the progress bars
    io.to(roomId).emit("game:player_update", allPlayers);
  });

  // ─── game:finish ──────────────────────────────────────────────────
  // when a player finishes typing the entire text
  //
  // what the client sends:
  //   { roomId, wpm: 82, accuracy: 97.3 }
  //
  // what the server does:
  //   1. mark this player as finished (with timestamp for ranking)
  //   2. broadcast the update so others see "Player X finished!"
  //   3. if ALL players are done → emit final results

  socket.on("game:finish", ({ roomId, wpm, accuracy, progress = 100 }) => {
    const game = getGame(roomId);
    if (!game || game.status === "finished") return;

    // update their final stats
    updatePlayerProgress(roomId, socket.user.id, {
      progress,
      wpm,
      accuracy,
    });

    // mark them as finished
    const result = finishPlayer(roomId, socket.user.id);
    if (!result) return;

    // tell everyone this player finished
    io.to(roomId).emit("game:player_finished", {
      userId: socket.user.id,
      username: socket.user.username,
      wpm,
      accuracy,
    });

    console.log(`🏁 ${socket.user.username} finished in room ${roomId} (${wpm} WPM)`);

    // ─── Check if everyone is done ──────────────────────────────
    if (result.allFinished) {
      // get the sorted results (winner first)
      const results = getResults(roomId);

      // send final results to everyone
      io.to(roomId).emit("game:results", results);

      console.log(`🏆 Game over in room ${roomId}!`);
      console.log(`   Winner: ${results[0]?.username} (${results[0]?.wpm} WPM)`);

      // clean up the in-memory game state
      // the room still exists in MongoDB, players are still in the lobby
      deleteGame(roomId);
    }
  });
}

// socket/handlers/roomHandlers.js
//
// handles all the room-related socket events:
//   - room:join    → player joins a socket.io room and everyone gets notified
//   - room:leave   → player leaves and everyone gets notified
//   - room:ready   → player toggles ready status
//                    when ≥2 players are all ready → 15s countdown → game starts
//
// IMPORTANT: this is NOT the same as the REST room controller!
//   REST  = creates/deletes rooms in MongoDB (permanent stuff)
//   Socket = real-time notifications (telling everyone "hey, someone joined!")
//
// think of it like this:
//   REST: you register for a class (saved in the database)
//   Socket: you walk into the classroom and everyone sees you

import Room from "../../models/Room.js";
import { createGame, getGame, deleteGame, removePlayerFromGame, getResults } from "../utils/roomManager.js";

export function registerRoomHandlers(io, socket) {

  // ─── room:join ────────────────────────────────────────────────────
  // when a player enters the lobby page, they emit this event
  // we join them to the socket.io room so they can receive broadcasts
  // then we tell everyone in the room "this person joined"

  socket.on("room:join", async (roomId, callback) => {
    try {
      // check if the room actually exists in the db
      const room = await Room.findOne({ roomId }).select("-password");
      if (!room) {
        return callback({ error: "Room not found" });
      }

      // join the socket.io room (this is different from the db room!)
      // socket.io rooms are just groups of sockets that can receive
      // the same broadcast — super useful for sending updates
      socket.join(roomId);

      // save the roomId on the socket so we know which room they're in
      // useful for when they disconnect unexpectedly
      socket.roomId = roomId;

      // tell everyone ELSE in the room that a new player showed up
      // socket.to(roomId) = everyone in the room EXCEPT the sender
      socket.to(roomId).emit("room:player_joined", {
        userId: socket.user.id,
        username: socket.user.username,
      });

      // send the full room data back to the player who just joined
      callback({ room });

      console.log(`📥 ${socket.user.username} joined room ${roomId}`);

    } catch (error) {
      console.error("[room:join]", error);
      callback({ error: "Failed to join room" });
    }
  });

  // ─── room:ready ───────────────────────────────────────────────────
  // when a player clicks the "Ready" button in the lobby
  //
  // how the countdown works:
  //   1. player clicks Ready → their isReady flips to true
  //   2. server checks: are there ≥2 players AND are ALL of them ready?
  //   3. if yes → start a 15-second countdown
  //   4. every second, server emits "room:countdown" to the room
  //   5. when countdown hits 0 → server creates the game and emits "game:start"
  //   6. all clients navigate from LobbyPage to GamePage
  //
  // edge case: if a player un-readies during countdown, cancel it

  socket.on("room:ready", async (roomId, callback) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room) {
        return callback({ error: "Room not found" });
      }

      // find this player in the room
      const player = room.players.find(
        (p) => p.userId.toString() === socket.user.id
      );
      if (!player) {
        return callback({ error: "You are not in this room" });
      }

      // toggle their ready status (click once = ready, click again = not ready)
      player.isReady = !player.isReady;
      await room.save();

      // tell everyone in the room this player's ready status changed
      io.to(roomId).emit("room:player_ready", {
        userId: socket.user.id,
        isReady: player.isReady,
      });

      // ─── Check if we should start the countdown ─────────────────
      // conditions: at least 2 players AND all of them are ready
      const readyCount = room.players.filter((p) => p.isReady).length;
      const totalPlayers = room.players.length;
      const allReady = readyCount === totalPlayers && totalPlayers >= 2;

      if (allReady) {
        // start the countdown!
        startCountdown(io, roomId, room);
      } else {
        // someone un-readied — cancel any existing countdown
        cancelCountdown(roomId);
      }

      callback({ isReady: player.isReady });

    } catch (error) {
      console.error("[room:ready]", error);
      callback({ error: "Failed to toggle ready" });
    }
  });

  // ─── room:leave ───────────────────────────────────────────────────
  // when a player clicks "Leave Room" or navigates away
  // we remove them from the socket.io room and notify everyone

  socket.on("room:leave", async (roomId, callback) => {
    try {
      socket.leave(roomId);
      socket.roomId = null;
      cancelCountdown(roomId);

      await removePlayerFromRoom(socket, roomId);

      if (callback) callback({ success: true });
      console.log(`📤 ${socket.user.username} left room ${roomId}`);

    } catch (error) {
      console.error("[room:leave]", error);
      if (callback) callback({ error: "Failed to leave room" });
    }
  });

  // ─── disconnect ───────────────────────────────────────────────────
  // if the player closes the tab or loses internet, they disconnect
  // without calling room:leave. so we handle cleanup here too
  // this way the room doesnt keep a "ghost" player

  socket.on("disconnect", async () => {
    if (socket.roomId) {
      const roomId = socket.roomId;
      cancelCountdown(roomId);

      await removePlayerFromRoom(socket, roomId);
    }
  });
}

// ─── Shared helper: remove a player from a room ─────────────────────
// uses ATOMIC $pull so it doesnt conflict with other saves
//
// the old approach was:
//   1. Room.findOne() → get room
//   2. room.players = room.players.filter(...) → modify in JS
//   3. room.save() → save back
//   problem: if two operations do this at the same time, the second
//   save fails with a VersionError because the document changed
//
// the new approach:
//   Room.findOneAndUpdate($pull) → atomic, no version conflicts
//   MongoDB handles the concurrency for us

async function removePlayerFromRoom(socket, roomId) {
  try {
    // atomically remove the player from the room
    // $pull removes matching elements from the array in one step
    const room = await Room.findOneAndUpdate(
      { roomId },
      { $pull: { players: { userId: socket.user.id } } },
      { returnDocument: 'after' } // return the updated document
    );

    if (!room) return;

    // if the room is now empty, delete it
    if (room.players.length === 0) {
      await Room.deleteOne({ roomId });
      console.log(`🗑️  Room ${roomId} deleted (empty)`);
    } else {
      // tell the remaining players that someone left
      socket.to(roomId).emit("room:player_left", {
        userId: socket.user.id,
        username: socket.user.username,
      });
    }

    // remove from the active game in memory
    const gameUpdate = removePlayerFromGame(roomId, socket.user.id);
    if (gameUpdate) {
      if (gameUpdate.gameDeleted) {
        deleteGame(roomId);
      } else if (gameUpdate.allFinished) {
        const results = getResults(roomId);
        socket.to(roomId).emit("game:results", results);
        deleteGame(roomId);
      } else {
        const game = getGame(roomId);
        if (game) {
          const allPlayers = [];
          game.players.forEach((data, uId) => {
            allPlayers.push({
              userId: uId,
              username: data.username,
              progress: data.progress,
              wpm: data.wpm,
              accuracy: data.accuracy,
              finished: data.finished,
            });
          });
          socket.to(roomId).emit("game:player_update", allPlayers);
        }
      }
    }
  } catch (error) {
    console.error("[removePlayerFromRoom]", error);
  }
}

// ─── Countdown Logic ──────────────────────────────────────────────────
//
// we store active countdowns in a Map so we can cancel them
// key = roomId, value = setInterval reference
//
// the countdown ticks every 1 second:
//   15... 14... 13... 12... → each tick emits "room:countdown" to the room
//   when it hits 0 → create the game → emit "game:start" → everyone navigates

const countdowns = new Map();

function startCountdown(io, roomId, room) {
  // dont start a new countdown if one is already running
  if (countdowns.has(roomId)) return;

  let seconds = 5;

  console.log(`⏳ Countdown started for room ${roomId}`);

  // tell everyone the countdown started
  io.to(roomId).emit("room:countdown", { seconds });

  // tick every second
  const timer = setInterval(async () => {
    seconds--;

    if (seconds > 0) {
      // still counting — tell everyone the current number
      io.to(roomId).emit("room:countdown", { seconds });
    } else {
      // countdown is done! time to start the game
      clearInterval(timer);
      countdowns.delete(roomId);

      // get the latest room data from the db
      const freshRoom = await Room.findOne({ roomId });
      if (!freshRoom || freshRoom.players.length < 2) {
        io.to(roomId).emit("room:countdown_cancelled");
        return;
      }

      // build the player list for the game
      const playerIds = freshRoom.players.map((p) => ({
        userId: p.userId.toString(),
        username: p.username,
      }));

      // create the game in memory (roomManager.js)
      const game = createGame(roomId, playerIds);
      game.startTime = Date.now();
      game.status = "playing";

      // update room status in the database
      freshRoom.status = "in-progress";
      await freshRoom.save();

      // tell everyone: game is starting! here's the text to type
      io.to(roomId).emit("game:start", {
        text: game.text,
        startTime: game.startTime,
        players: playerIds,
      });

      console.log(`🎮 Game started in room ${roomId}`);
    }
  }, 1000);

  countdowns.set(roomId, timer);
}

function cancelCountdown(roomId) {
  const timer = countdowns.get(roomId);
  if (timer) {
    clearInterval(timer);
    countdowns.delete(roomId);
    console.log(`❌ Countdown cancelled for room ${roomId}`);
  }
}

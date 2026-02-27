// socket/handlers/roomHandlers.js
//
// handles all the room-related socket events:
//   - room:join    → player joins a socket.io room and everyone gets notified
//   - room:leave   → player leaves and everyone gets notified
//
// IMPORTANT: this is NOT the same as the REST room controller!
//   REST  = creates/deletes rooms in MongoDB (permanent stuff)
//   Socket = real-time notifications (telling everyone "hey, someone joined!")
//
// think of it like this:
//   REST: you register for a class (saved in the database)
//   Socket: you walk into the classroom and everyone sees you

import Room from "../../models/Room.js";

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

  // ─── room:leave ───────────────────────────────────────────────────
  // when a player clicks "Leave Room" or navigates away
  // we remove them from the socket.io room and notify everyone

  socket.on("room:leave", async (roomId, callback) => {
    try {
      // leave the socket.io room
      socket.leave(roomId);
      socket.roomId = null;

      // also remove them from the db room
      // (same thing the REST endpoint does)
      const room = await Room.findOne({ roomId });
      if (room) {
        room.players = room.players.filter(
          (p) => p.userId.toString() !== socket.user.id
        );

        // if the room is now empty, delete it from the db
        if (room.players.length === 0) {
          await Room.deleteOne({ roomId });
          console.log(`🗑️  Room ${roomId} deleted (empty)`);
        } else {
          await room.save();

          // tell the remaining players that someone left
          socket.to(roomId).emit("room:player_left", {
            userId: socket.user.id,
            username: socket.user.username,
          });
        }
      }

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
      // same cleanup as room:leave
      const room = await Room.findOne({ roomId: socket.roomId });
      if (room) {
        room.players = room.players.filter(
          (p) => p.userId.toString() !== socket.user.id
        );

        if (room.players.length === 0) {
          await Room.deleteOne({ roomId: socket.roomId });
        } else {
          await room.save();
          socket.to(socket.roomId).emit("room:player_left", {
            userId: socket.user.id,
            username: socket.user.username,
          });
        }
      }
    }
  });
}

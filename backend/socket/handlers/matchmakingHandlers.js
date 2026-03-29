// socket/handlers/matchmakingHandlers.js
import Room from "../../models/Room.js";

// simple in-memory queue of waiting players
const matchmakingQueue = [];

// generates a short room code like "XKTP-4829"
const generateRoomCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * 26)];
  code += '-';
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * 10)];
  return code;
};

export function registerMatchmakingHandlers(io, socket) {
  
  socket.on("matchmaking:join", async (callback) => {
    try {
      // don't add the exact same socket connection twice
      const existing = matchmakingQueue.find(s => s.id === socket.id);
      if (!existing) {
        matchmakingQueue.push(socket);
        console.log(`🔍 ${socket.user.username} joined 1v1 matchmaking (${matchmakingQueue.length} in queue)`);
      }

      // try to form a match
      if (matchmakingQueue.length >= 2) {
        const player1Socket = matchmakingQueue.shift();
        const player2Socket = matchmakingQueue.shift();

        // create a new room for them
        const roomCode = generateRoomCode();
        
        const roomName = `1v1 Match ${roomCode}`;
        
        const newRoom = await Room.create({
          roomId: roomCode,
          name: roomName,
          mode: '1v1',
          isPrivate: false,
          maxPlayers: 2,
          createdBy: player1Socket.user.id,
          players: [
            {
              userId: player1Socket.user.id,
              username: player1Socket.user.username,
              isReady: false,
            },
            {
              userId: player2Socket.user.id,
              username: player2Socket.user.username,
              isReady: false,
            }
          ]
        });

        console.log(`⚔️ Match found! Created room ${roomCode} for ${player1Socket.user.username} & ${player2Socket.user.username}`);

        // tell both players the match is found
        player1Socket.emit("matchmaking:found", { roomId: roomCode });
        player2Socket.emit("matchmaking:found", { roomId: roomCode });
      }

      if (callback) callback({ success: true });
    } catch (err) {
      console.error("[matchmaking:join]", err);
      if (callback) callback({ error: "Failed to join matchmaking" });
    }
  });

  socket.on("matchmaking:leave", (callback) => {
    const index = matchmakingQueue.findIndex(s => s.user.id === socket.user.id);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      console.log(`🚪 ${socket.user.username} left matchmaking`);
    }
    if (callback) callback({ success: true });
  });

  socket.on("disconnect", () => {
    const index = matchmakingQueue.findIndex(s => s.user.id === socket.user.id);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      console.log(`🔌 ${socket.user.username} disconnected while searching for match`);
    }
  });
}

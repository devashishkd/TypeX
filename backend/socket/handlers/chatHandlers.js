// socket/handlers/chatHandlers.js
//
// handles all chat-related socket events:
//   - chat:send    → player sends a message to the room
//   - chat:receive → everyone in the room gets the message (emitted by server)
//
// how it works:
//   1. player types a message and hits send
//   2. client emits "chat:send" with { roomId, message }
//   3. server receives it, adds the username + timestamp
//   4. server broadcasts "chat:receive" to everyone in the room
//   5. all clients in the room see the new message pop up
//
// we're NOT saving messages to the database — they're ephemeral
// when you leave the room, the chat history is gone
// (we could add persistence later if needed)

export function registerChatHandlers(io, socket) {

  // ─── chat:send ────────────────────────────────────────────────────
  // client sends: { roomId: "ABCD-1234", message: "hello everyone!" }
  // server broadcasts to the room: { username, message, timestamp, userId }

  socket.on("chat:send", ({ roomId, message }) => {
    // ignore empty messages or messages that are just whitespace
    if (!message || !message.trim()) return;

    // ignore if they're not in a room
    if (!roomId) return;

    // build the message object that everyone will receive
    const chatMessage = {
      userId: socket.user.id,
      username: socket.user.username,
      message: message.trim(),
      timestamp: new Date().toISOString(),
    };

    // broadcast to everyone in the room INCLUDING the sender
    // we use io.to() instead of socket.to() because socket.to() skips the sender
    // and we want the sender to also see their own message appear in the chat
    io.to(roomId).emit("chat:receive", chatMessage);

    console.log(`💬 [${roomId}] ${socket.user.username}: ${message.trim()}`);
  });
}

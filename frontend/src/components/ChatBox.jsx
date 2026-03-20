// components/ChatBox.jsx
//
// reusable chat component — works in both the lobby and the game page
// all it needs is a roomId from props
//
// how it works:
//   1. listens for "chat:receive" events from the server
//   2. when the user types a message and hits send (or Enter),
//      it emits "chat:send" with the roomId and message
//   3. the server broadcasts it back to everyone (including us)
//   4. the message appears in the chat list

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const ChatBox = ({ roomId }) => {
  const socket = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // ref to the bottom of the chat so we can auto-scroll
  const messagesEndRef = useRef(null);

  // auto-scroll to the newest message whenever messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ─── Listen for incoming messages ─────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // when the server sends a new message to the room
    const handleReceive = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on('chat:receive', handleReceive);

    // cleanup: stop listening when the component unmounts
    return () => {
      socket.off('chat:receive', handleReceive);
    };
  }, [socket]);

  // ─── Send a message ───────────────────────────────────────────────
  const sendMessage = (e) => {
    e.preventDefault();

    // dont send empty messages
    if (!input.trim() || !socket) return;

    // emit to the server — it will broadcast back to everyone
    socket.emit('chat:send', {
      roomId,
      message: input.trim(),
    });

    // clear the input
    setInput('');
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Chat</h2>

      {/* message list — fixed height, scrollable */}
      <div className="h-48 bg-gray-800 rounded-lg p-3 overflow-y-auto mb-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-gray-600 text-sm text-center mt-16">
            No messages yet. Say hi! 👋
          </p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="text-sm">
              {/* highlight our own messages with a different color */}
              <span className={`font-medium ${
                msg.userId === user?.id
                  ? 'text-violet-400'   // our messages
                  : 'text-cyan-400'     // other people's messages
              }`}>
                {msg.userId === user?.id ? 'You' : msg.username}
              </span>
              <span className="text-gray-500 text-xs ml-2">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <p className="text-gray-300 mt-0.5">{msg.message}</p>
            </div>
          ))
        )}
        {/* invisible div at the bottom that we scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* message input */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={200}
          className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors cursor-pointer"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatBox;

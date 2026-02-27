import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

// Create socket connection ONCE
const socket = io("http://localhost:4000");

function Messages() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  
  const { user } = useAuth(); 
  
  // Now you have the ID!
  const myUserId = user.id; 
  
  useEffect(() => {
    
    socket.on("receive_message", (data) => {
      console.log(`Message received from socketid::: ${socket.id}`,data);
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.off("receive_message");
    };
  }, []);

  const sendMessage = () => {
    if (!message.trim()) return;
    let payload = {
      message,
      sender: user,
    }
    socket.emit("send_message", payload);
    setMessage("");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6">
        
        <h2 className="text-2xl font-bold text-center mb-4">
          Socket Chat
        </h2>

        {/* Messages Box */}
        <div className="h-64 overflow-y-auto border rounded-lg p-3 mb-4 space-y-2 bg-gray-50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className="bg-blue-500 text-white px-3 py-2 rounded-lg w-fit"
            >
              {msg}
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type message..."
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  );
}

export default Messages;
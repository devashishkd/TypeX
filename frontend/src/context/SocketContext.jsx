// context/SocketContext.jsx
//
// creates a single socket.io connection shared across the entire app
// connects when the user logs in, disconnects when they log out
//
// how to use in any component:
//   const socket = useSocket();
//   socket.emit("room:join", roomId, (response) => { ... });
//   socket.on("room:player_joined", (data) => { ... });

import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// hook to grab the socket anywhere in the app
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // only connect if the user is logged in
    if (!user) {
      return;
    }

    // grab the token from localStorage (same one the axios interceptor uses)
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // create the socket connection
    // we pass the token in the auth object — the backend reads this
    // in socket/authMiddleware.js to verify who we are
    const newSocket = io('http://localhost:4000', {
      auth: { token },
    });

    // log connection status so we can debug easily
    newSocket.on('connect', () => {
      console.log('🔌 Socket connected:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Socket connection failed:', err.message);
    });

    setSocket(newSocket);

    // cleanup: disconnect when user logs out or component unmounts
    return () => {
      newSocket.disconnect();
      console.log('🔌 Socket disconnected');
    };
  }, [user]); // re-run when user changes (login/logout)

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

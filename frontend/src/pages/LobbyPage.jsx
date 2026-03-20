// pages/LobbyPage.jsx
//
// the lobby where players wait before a game starts
//
// what happens here:
//   1. player enters → socket joins the room → sees other players in real-time
//   2. players chat with each other (ChatBox component)
//   3. players click "Ready" → when all ≥2 are ready → 15s countdown starts
//   4. countdown reaches 0 → server emits "game:start" → everyone goes to GamePage

import { useState, useEffect, useRef   } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../api/axiosInstance';
import Navbar from '../components/Navbar';
import ChatBox from '../components/ChatBox';
import toast from 'react-hot-toast';

const LobbyPage = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  // track if we are navigating to the game so we don't accidentally leave the room
  const isStartingGame = useRef(false);


  // countdown state — null means no countdown is running
  const [countdown, setCountdown] = useState(null);

  // track if WE are ready (so the button shows the right state)
  const [isReady, setIsReady] = useState(false);

  // ─── Join room via socket when the page loads ─────────────────────

  useEffect(() => {
    if (!socket) return;

    const fetchAndJoinRoom = async () => {
      try {
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data.room);

        // check if we're already marked as ready in the db
        const me = data.room.players.find((p) => p.userId === user?.id);
        if (me) setIsReady(me.isReady);

        // join the socket.io room
        socket.emit('room:join', roomId, (response) => {
          if (response.error) {
            toast.error(response.error);
            navigate('/');
            return;
          }
          if (response.room) {
            setRoom(response.room);
          }
        });
      } catch {
        toast.error('Room not found');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchAndJoinRoom();

    // ─── Real-time listeners ──────────────────────────────────────

    // someone joined
    socket.on('room:player_joined', (player) => {
      toast.success(`${player.username} joined!`);
      setRoom((prev) => {
        if (!prev) return prev;
        const alreadyIn = prev.players.some((p) => p.userId === player.userId);
        if (alreadyIn) return prev;
        return {
          ...prev,
          players: [...prev.players, {
            userId: player.userId,
            username: player.username,
            isReady: false,
          }],
        };
      });
    });

    // someone left
    socket.on('room:player_left', (player) => {
      toast(`${player.username} left`, { icon: '👋' });
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter((p) => p.userId !== player.userId),
        };
      });
    });

    // someone toggled their ready status
    socket.on('room:player_ready', ({ userId, isReady: ready }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.userId === userId ? { ...p, isReady: ready } : p
          ),
        };
      });

      // if its us, update our local state too
      if (userId === user?.id) {
        setIsReady(ready);
      }
    });

    // countdown ticking (15... 14... 13...)
    socket.on('room:countdown', ({ seconds }) => {
      setCountdown(seconds);
    });

    // countdown was cancelled (someone un-readied or left)
    socket.on('room:countdown_cancelled', () => {
      setCountdown(null);
      toast('Countdown cancelled', { icon: '❌' });
    });

    // GAME IS STARTING! save game data and navigate to game page
    // we save to sessionStorage because GamePage wont be mounted yet
    // when this event fires — so it would miss the data otherwise
    socket.on('game:start', (gameData) => {
      isStartingGame.current = true;
      sessionStorage.setItem('gameData', JSON.stringify(gameData));
      toast.success('Game starting!');
      navigate(`/game/${roomId}`);
    });

    // cleanup
    return () => {
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('room:player_ready');
      socket.off('room:countdown');
      socket.off('room:countdown_cancelled');
      socket.off('game:start');
      if (!isStartingGame.current) { 
       socket.emit('room:leave', roomId);
      }
    };
  }, [socket, roomId, navigate, user?.id]);

  // ─── Ready button handler ─────────────────────────────────────────
  const handleReady = () => {
    if (!socket) return;
    socket.emit('room:ready', roomId, (response) => {
      if (response.error) {
        toast.error(response.error);
      }
    });
  };

  // ─── Leave room handler ───────────────────────────────────────────
  const handleLeave = () => {
    if (socket) {
      socket.emit('room:leave', roomId);
    }
    toast.success('Left room');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Loading lobby...</p>
        </div>
      </div>
    );
  }

  if (!room) return null;

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* countdown banner — shows when countdown is active */}
        {countdown !== null && (
          <div className="bg-violet-900/30 border border-violet-700 rounded-2xl p-6 mb-6 text-center">
            <p className="text-violet-300 text-sm mb-1">Game starting in</p>
            <p className="text-5xl font-bold text-white">{countdown}</p>
            <p className="text-violet-400 text-sm mt-2">Get ready to type!</p>
          </div>
        )}

        {/* room header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{room.name}</h1>
              <div className="flex gap-3 mt-2 text-sm text-gray-500">
                <span className="bg-gray-800 px-2 py-0.5 rounded-full text-xs">
                  {room.mode === '1v1' ? '1v1' : 'Multiplayer'}
                </span>
                <span>
                  {room.players.length}/{room.maxPlayers} players
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600 mb-1">Room Code</p>
              <p className="font-mono text-lg text-cyan-400 font-bold">{room.roomId}</p>
            </div>
          </div>
        </div>

        {/* players list */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Players ({room.players.length}/{room.maxPlayers})
          </h2>
          <div className="space-y-2">
            {room.players.map((player) => (
              <div
                key={player.userId}
                className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold">
                    {player.username[0].toUpperCase()}
                  </div>
                  <span className="text-white font-medium">{player.username}</span>
                  {player.userId === user?.id && (
                    <span className="text-xs text-gray-500">(you)</span>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  player.isReady
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {player.isReady ? 'Ready' : 'Not Ready'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* chat */}
        <div className="mb-6">
          <ChatBox roomId={roomId} />
        </div>

        {/* actions */}
        <div className="flex gap-3">
          <button
            onClick={handleLeave}
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors cursor-pointer"
          >
            Leave Room
          </button>
          <button
            onClick={handleReady}
            disabled={countdown !== null}
            className={`flex-1 py-3 font-medium rounded-xl transition-colors cursor-pointer ${
              isReady
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            } ${countdown !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {countdown !== null
              ? `Starting in ${countdown}...`
              : isReady
                ? '✓ Ready (click to unready)'
                : 'Ready Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;

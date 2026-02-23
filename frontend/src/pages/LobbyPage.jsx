import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axiosInstance';
import Navbar from '../components/Navbar';
import toast from 'react-hot-toast';

const LobbyPage = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  // fetch room details
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data.room);
      } catch {
        toast.error('Room not found');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId, navigate]);

  // leave room
  const handleLeave = async () => {
    try {
      await api.post('/rooms/leave', { roomId });
      toast.success('Left room');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to leave room');
    }
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
          <h2 className="text-lg font-semibold text-white mb-4">Players</h2>
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

        {/* chat placeholder — will be socket.io powered later */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Chat</h2>
          <div className="h-48 bg-gray-800 rounded-lg flex items-center justify-center">
            <p className="text-gray-600 text-sm">💬 Chat will come with Socket.IO</p>
          </div>
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
            disabled
            className="flex-1 py-3 bg-violet-800/50 text-violet-300/50 font-medium rounded-xl cursor-not-allowed"
          >
            Ready Up (soon)
          </button>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;

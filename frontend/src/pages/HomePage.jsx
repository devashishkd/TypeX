import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosInstance';
import Navbar from '../components/Navbar';
import toast from 'react-hot-toast';
import { useSocket } from '../context/SocketContext';

const HomePage = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // create room form state
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // join by code state
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining] = useState(false);

  // fetch available rooms
  const fetchRooms = async () => {
    try {
      const { data } = await api.get('/rooms');
      setRooms(data.rooms);
    } catch {
      toast.error('Failed to load rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const socket = useSocket();
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // listen for match found
    socket.on('matchmaking:found', ({ roomId }) => {
      setIsSearching(false);
      toast.success('Match found!');
      navigate(`/lobby/${roomId}`);
    });

    return () => {
      socket.off('matchmaking:found');
    };
  }, [socket, navigate]);

  const handlePlaySolo = () => {
    if (!socket) {
      toast.error('Connection not established. Please refresh.');
      return;
    }
    setIsSearching(true);
    socket.emit('matchmaking:join', (res) => {
      if (res?.error) {
        setIsSearching(false);
        toast.error(res.error);
      }
    });
  };

  const handleCancelSearch = () => {
    if (!socket) return;
    socket.emit('matchmaking:leave');
    setIsSearching(false);
  };

  // create a new room
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/rooms/create', {
        name: roomName,
        mode: 'multi',
        isPrivate,
        password: isPrivate ? roomPassword : undefined,
      });
      toast.success(`Room created! Code: ${data.room.roomId}`);
      navigate(`/lobby/${data.room.roomId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  // join a room by its code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    setJoining(true);
    try {
      const { data } = await api.post('/rooms/join', {
        roomId: joinCode.trim(),
        password: joinPassword || undefined,
      });
      toast.success('Joined room!');
      navigate(`/lobby/${data.room.roomId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to join room');
    } finally {
      setJoining(false);
    }
  };

  // join a room from the list
  const handleJoinRoom = async (roomId) => {
    try {
      await api.post('/rooms/join', { roomId });
      toast.success('Joined room!');
      navigate(`/lobby/${roomId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to join room');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-8">
        
        {/* play solo banner */}
        <div className="bg-violet-900/30 border border-violet-700 rounded-2xl p-8 mb-8 text-center flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold text-white mb-2">Want to play 1v1?</h2>
          <p className="text-violet-300 text-sm mb-6 max-w-md mx-auto">
            Test your typing speed against another player in a real-time battle.
          </p>
          
          {isSearching ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
              <p className="text-white font-medium mb-4">Searching for opponent...</p>
              <button
                onClick={handleCancelSearch}
                className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel Search
              </button>
            </div>
          ) : (
            <button
              onClick={handlePlaySolo}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-lg rounded-xl transition-colors cursor-pointer shadow-lg shadow-violet-900/50"
            >
              Play Solo (1v1)
            </button>
          )}
        </div>

        {/* top actions */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {/* join by code */}
          <form onSubmit={handleJoinByCode} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Join by Code</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABCD-1234"
                required
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                type="submit"
                disabled={joining}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                Join
              </button>
            </div>
            <input
              type="text"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder="Room password (if private)"
              className="mt-2 w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
            />
          </form>

          {/* create room toggle */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Create Room</h2>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="text-sm text-violet-400 hover:text-violet-300 cursor-pointer"
              >
                {showCreate ? 'Cancel' : '+ New Room'}
              </button>
            </div>

            {showCreate && (
              <form onSubmit={handleCreate} className="space-y-3">
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Room name"
                  required
                  maxLength={30}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                />

                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="accent-violet-500"
                  />
                  Private room
                </label>

                {isPrivate && (
                  <input
                    type="text"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="Room password"
                    required
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Room'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* available rooms list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Available Rooms</h2>
            <button
              onClick={fetchRooms}
              className="text-sm text-gray-400 hover:text-white cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>

          {loadingRooms ? (
            <p className="text-gray-500">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-gray-500">No rooms available. Create one!</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {rooms.map((room) => (
                <div
                  key={room.roomId}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-white font-medium">{room.name}</h3>
                    <div className="flex gap-3 mt-1 text-sm text-gray-500">
                      <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full">
                        {room.mode === '1v1' ? '1v1' : 'Multi'}
                      </span>
                      <span>
                        {room.players.length}/{room.maxPlayers} players
                      </span>
                      <span className="font-mono text-gray-600">{room.roomId}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinRoom(room.roomId)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;

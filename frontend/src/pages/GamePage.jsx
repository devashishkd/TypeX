// pages/GamePage.jsx
//
// the actual typing game!
//
// how it works:
//   1. server sent us the text to type via "game:start"
//   2. we show the text and let the player type in an input
//   3. as they type, we compare what they typed vs the correct text
//   4. every 300ms we send our progress (wpm, accuracy, %) to the server
//   5. the server broadcasts everyone's stats back
//   6. we show progress bars for all players
//   7. when we finish typing, we emit "game:finish"
//   8. when everyone finishes, server sends "game:results" → we show the podium

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ChatBox from '../components/ChatBox';
import Navbar from '../components/Navbar';

const GamePage = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  // the text everyone has to type
  const [text, setText] = useState('');

  // what the player has typed so far
  const [typed, setTyped] = useState('');

  // all players' live stats (comes from server every ~300ms)
  const [players, setPlayers] = useState([]);

  // game timing
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0); // seconds since start

  // game state
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState(null);

  // ref to the input so we can auto-focus it
  const inputRef = useRef(null);

  // ref for the progress emit timer
  const progressTimerRef = useRef(null);

  // ─── Calculate WPM and accuracy ─────────────────────────────────
  // WPM = (characters typed / 5) / minutes elapsed
  //   (5 characters = 1 "word" — this is the standard formula)
  // accuracy = correct characters / total characters typed * 100

  const calculateStats = useCallback(() => {
    if (!startTime || typed.length === 0) return { wpm: 0, accuracy: 100 };

    const minutesElapsed = (Date.now() - startTime) / 60000;
    if (minutesElapsed === 0) return { wpm: 0, accuracy: 100 };

    // count correct characters
    let correctChars = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] === text[i]) correctChars++;
    }

    // WPM based on correct characters only (net WPM)
    const wpm = Math.round((correctChars / 5) / minutesElapsed);
    const accuracy = Math.round((correctChars / typed.length) * 100);

    return { wpm, accuracy };
  }, [typed, text, startTime]);

  // ─── Listen for game events ─────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    // the server sends us the text and player list when game starts
    // this might fire before we mount (if we navigated here from lobby)
    // so we also check if we already have the data
    socket.on('game:start', ({ text: gameText, startTime: gameStart, players: gamePlayers }) => {
      setText(gameText);
      setStartTime(gameStart);
      setPlayers(gamePlayers.map((p) => ({
        ...p,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
      })));
    });

    // live progress updates from all players
    socket.on('game:player_update', (allPlayers) => {
      setPlayers(allPlayers);
    });

    // someone finished typing
    socket.on('game:player_finished', ({ username }) => {
      // just a toast, the progress update will handle the UI
    });

    // game over! final results
    socket.on('game:results', (finalResults) => {
      setResults(finalResults);
    });

    // if we dont have the text yet, ask the server
    // (this handles the case where we refresh the page mid-game)
    // for now, if text is empty after mount, go back to home
    const timeout = setTimeout(() => {
      if (!text) {
        // no game data — maybe they refreshed or navigated directly
        // navigate('/');
      }
    }, 3000);

    return () => {
      socket.off('game:start');
      socket.off('game:player_update');
      socket.off('game:player_finished');
      socket.off('game:results');
      clearTimeout(timeout);
    };
  }, [socket, text, navigate]);

  // ─── Timer (counts seconds since game started) ──────────────────

  useEffect(() => {
    if (!startTime || finished) return;

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, finished]);

  // ─── Auto-focus the input ───────────────────────────────────────

  useEffect(() => {
    if (text && !finished) {
      inputRef.current?.focus();
    }
  }, [text, finished]);

  // ─── Send progress to server every 300ms ────────────────────────
  // we dont send on every keystroke — that would flood the server
  // instead we debounce: update at most every 300ms

  useEffect(() => {
    if (!socket || !text || finished) return;

    progressTimerRef.current = setInterval(() => {
      const progress = (typed.length / text.length) * 100;
      const { wpm, accuracy } = calculateStats();

      socket.emit('game:progress', {
        roomId,
        progress: Math.min(progress, 100),
        wpm,
        accuracy,
      });
    }, 300);

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [socket, typed, text, finished, roomId, calculateStats]);

  // ─── Handle typing ──────────────────────────────────────────────
  // this fires on every keystroke
  // we check if they've finished typing the entire text

  const handleInput = (e) => {
    if (finished) return;

    const value = e.target.value;

    // dont let them type more than the text length
    if (value.length > text.length) return;

    setTyped(value);

    // check if they finished
    if (value.length === text.length) {
      setFinished(true);
      const { wpm, accuracy } = calculateStats();

      // tell the server we're done
      socket.emit('game:finish', {
        roomId,
        wpm,
        accuracy,
      });
    }
  };

  // ─── Format time as mm:ss ───────────────────────────────────────
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Waiting for game data ──────────────────────────────────────

  if (!text) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Waiting for game to start...</p>
        </div>
      </div>
    );
  }

  // ─── Results screen ─────────────────────────────────────────────

  if (results) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-center text-white mb-8">
            🏆 Game Results
          </h1>

          <div className="space-y-3 mb-8">
            {results.map((player, index) => (
              <div
                key={player.userId}
                className={`flex items-center justify-between rounded-xl px-5 py-4 ${
                  index === 0
                    ? 'bg-yellow-900/20 border border-yellow-700'
                    : index === 1
                      ? 'bg-gray-800 border border-gray-600'
                      : index === 2
                        ? 'bg-amber-900/20 border border-amber-800'
                        : 'bg-gray-900 border border-gray-800'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold text-gray-400 w-8">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </span>
                  <div>
                    <p className="text-white font-medium">
                      {player.username}
                      {player.userId === user?.id && (
                        <span className="text-gray-500 text-sm ml-2">(you)</span>
                      )}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {player.finished ? 'Finished' : `${Math.round(player.progress)}% complete`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-lg">{player.wpm} WPM</p>
                  <p className="text-gray-500 text-sm">{player.accuracy}% accuracy</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-colors cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ─── Main game UI ───────────────────────────────────────────────

  const { wpm, accuracy } = calculateStats();
  const progress = text.length > 0 ? (typed.length / text.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* stats bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-6">
            <div>
              <p className="text-gray-500 text-xs">WPM</p>
              <p className="text-2xl font-bold text-white">{wpm}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Accuracy</p>
              <p className="text-2xl font-bold text-white">{accuracy}%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Progress</p>
              <p className="text-2xl font-bold text-white">{Math.round(progress)}%</p>
            </div>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Time</p>
            <p className="text-2xl font-bold font-mono text-white">{formatTime(elapsed)}</p>
          </div>
        </div>

        {/* typing area — the text to type with character highlighting */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <p className="text-lg leading-relaxed font-mono">
            {text.split('').map((char, i) => {
              let className = 'text-gray-600'; // not typed yet

              if (i < typed.length) {
                // character has been typed — green if correct, red if wrong
                className = typed[i] === char
                  ? 'text-green-400'    // correct
                  : 'text-red-400 bg-red-900/30'; // wrong
              } else if (i === typed.length) {
                // this is the next character to type — highlight it
                className = 'text-white bg-gray-700 rounded-sm';
              }

              return (
                <span key={i} className={className}>
                  {char}
                </span>
              );
            })}
          </p>
        </div>

        {/* hidden input — captures keystrokes */}
        {/* we use a real input instead of onKeyDown so mobile keyboards work too */}
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={handleInput}
          disabled={finished}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono focus:outline-none focus:border-violet-500 transition-colors mb-6"
          placeholder={finished ? 'Finished! Waiting for others...' : 'Start typing here...'}
        />

        {/* players progress bars */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Players</h2>
          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.userId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white">
                    {player.username}
                    {player.userId === user?.id && (
                      <span className="text-gray-500 ml-1">(you)</span>
                    )}
                    {player.finished && <span className="text-green-400 ml-2">✓</span>}
                  </span>
                  <span className="text-xs text-gray-500">
                    {player.wpm || 0} WPM
                  </span>
                </div>
                {/* progress bar */}
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      player.userId === user?.id
                        ? 'bg-violet-500'    // our bar is violet
                        : 'bg-cyan-500'      // others are cyan
                    }`}
                    style={{ width: `${player.progress || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* chat — still available during the game */}
        <ChatBox roomId={roomId} />
      </div>
    </div>
  );
};

export default GamePage;

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Activity, LogOut } from 'lucide-react';
import { clearToken } from '../components/ProtectedRoute';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_DATA_POINTS = 30;

const formatTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/* ========== Gauge Component ========== */
function Gauge({ value, max, label, unit, color }) {
  const pct = Math.min(Math.max((value || 0) / max, 0), 1) * 100;
  const angle = (pct / 100) * 180; // 0 to 180 degrees
  const rad = (angle - 90) * (Math.PI / 180);
  const r = 40;
  const cx = 50, cy = 55;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 70" className="w-32 h-24">
        <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
        <path d={`M10 55 A40 40 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          style={{ transition: 'all 0.5s ease' }} />
        <circle cx={x} cy={y} r="4" fill={color} />
        <text x="50" y="66" textAnchor="middle" fill="#94a3b8" fontSize="10">{value ?? '--'} {unit}</text>
      </svg>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

/* ========== Main Dashboard ========== */
export default function Dashboard() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);

  const [latest, setLatest] = useState({ distance_cm: 0, weight_g: 0, dwell_time_sec: 0, timestamp: null });
  const [distanceSeries, setDistanceSeries] = useState([]);
  const [weightSeries, setWeightSeries] = useState([]);
  const [history, setHistory] = useState([]);

  const [aiCategory, setAiCategory] = useState(null);
  const [isAnomaly, setIsAnomaly] = useState(false);
  const [anomalyReason, setAnomalyReason] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [stats, setStats] = useState({ total: 0, anomalies: 0 });

  const connectedRef = useRef(false);

  /* ───── Fetch history from Firebase ───── */
  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      const items = [];
      for (const [deviceId, entries] of Object.entries(data)) {
        for (const [ts, entry] of Object.entries(entries)) {
          items.push({ deviceId, ...entry, _key: ts });
        }
      }
      items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setHistory(items.slice(0, 20));
    } catch (_) { /* Firebase may not be configured */ }
  };

  /* ───── Socket.io ───── */
  useEffect(() => {
    const sock = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    sock.on('connect', () => {
      setConnected(true);
      connectedRef.current = true;
      fetchHistory();
      sock.emit('request-history', 50);
    });

    sock.on('disconnect', () => {
      setConnected(false);
      connectedRef.current = false;
    });

    sock.on('sensor-data', (payload) => {
      setLatest({
        distance_cm: payload.distance_cm ?? 0,
        weight_g: payload.weight_g ?? 0,
        dwell_time_sec: payload.dwell_time_sec ?? 0,
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      const t = formatTime(payload.timestamp || new Date().toISOString());

      setDistanceSeries((prev) => {
        const next = [...prev, { time: t, distance: payload.distance_cm ?? 0 }];
        return next.length > MAX_DATA_POINTS ? next.slice(-MAX_DATA_POINTS) : next;
      });

      setWeightSeries((prev) => {
        const next = [...prev, { time: t, weight: payload.weight_g ?? 0 }];
        return next.length > MAX_DATA_POINTS ? next.slice(-MAX_DATA_POINTS) : next;
      });

      setStats((prev) => ({ ...prev, total: prev.total + 1 }));
    });

    sock.on('sensor-ai-update', (payload) => {
      setAiCategory(payload.category || null);
      setIsAnomaly(!!payload.is_anomaly);
      setAnomalyReason(payload.anomaly_reason || '');
      setRecommendedAction(payload.recommended_action || '');
      if (payload.is_anomaly) {
        setStats((prev) => ({ ...prev, anomalies: prev.anomalies + 1 }));
      }
    });

    const interval = setInterval(fetchHistory, 10000);

    return () => {
      sock.disconnect();
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  /* ───── Render ───── */
  return (
    <div className="min-h-screen bg-gray-950 p-3 md:p-4 space-y-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Smart Warehouse Monitor</h1>
          <p className="text-gray-400 text-xs">IoT Dashboard — Real-time Sensor Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full
            ${connected ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-red-900/40 text-red-400 border border-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          {latest.timestamp && <span className="text-xs text-gray-500">{formatTime(latest.timestamp)}</span>}
          <button onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg
              bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Anomaly Banner */}
      {isAnomaly && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium
          bg-red-950/50 border-red-500 text-red-300 animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-bold">ANOMALY:</span> {anomalyReason}
          <span className="text-red-500">→ {recommendedAction}</span>
        </div>
      )}

      {/* Gauges + Sensor Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <Gauge value={latest.distance_cm} max={100} label="Distance" unit="cm" color="#22d3ee" />
        <Gauge value={latest.weight_g} max={1200} label="Weight" unit="g" color="#34d399" />
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-violet-400">{latest.dwell_time_sec}s</span>
          <span className="text-xs text-gray-500 mt-1">Dwell Time</span>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${isAnomaly ? 'text-red-400' : 'text-yellow-400'}`}>
            {aiCategory || '--'}
          </span>
          <span className="text-xs text-gray-500 mt-1">AI Classify</span>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-emerald-400">{stats.total}</span>
          <span className="text-xs text-gray-500 mt-1">Readings</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Distance Over Time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tick={{ fill: '#94a3b8' }} angle={-30} textAnchor="end" height={40} />
              <YAxis stroke="#94a3b8" fontSize={9} tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px' }} />
              <Line type="monotone" dataKey="distance" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Weight Over Time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tick={{ fill: '#94a3b8' }} angle={-30} textAnchor="end" height={40} />
              <YAxis stroke="#94a3b8" fontSize={9} tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px' }} />
              <Line type="monotone" dataKey="weight" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* History Table from Firebase */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" /> Firebase History (last 20)
          </h3>
          <button onClick={fetchHistory} className="text-xs text-gray-500 hover:text-gray-300">↻ Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-300">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="pb-2 pr-3 font-medium">Time</th>
                <th className="pb-2 pr-3 font-medium">Device</th>
                <th className="pb-2 pr-3 font-medium text-right">Distance</th>
                <th className="pb-2 pr-3 font-medium text-right">Weight</th>
                <th className="pb-2 font-medium text-right">Dwell</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-gray-600">No data in Firebase yet — start the simulator</td></tr>
              ) : (
                history.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{formatTime(row.timestamp)}</td>
                    <td className="py-1.5 pr-3">{row.deviceId}</td>
                    <td className="py-1.5 pr-3 text-right text-cyan-400">{row.distance_cm} cm</td>
                    <td className="py-1.5 pr-3 text-right text-emerald-400">{row.weight_g} g</td>
                    <td className="py-1.5 text-right text-violet-400">{row.dwell_time_sec}s</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

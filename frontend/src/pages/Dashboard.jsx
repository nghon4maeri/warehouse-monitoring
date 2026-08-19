import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Activity, LogOut, ShieldAlert, DoorOpen, DoorClosed, Bell, BellOff } from 'lucide-react';
import { clearToken, getToken } from '../components/ProtectedRoute';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_DATA_POINTS = 30;

const formatTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/* ========== Gauge Component ========== */
function Gauge({ value, max, label, unit, color }) {
  const pct = Math.min(Math.max((value || 0) / max, 0), 1);
  const circumference = 2 * Math.PI * 38;
  const filled = pct * circumference * 0.5;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 70" className="w-32 h-24">
        {/* Background half-circle */}
        <path d="M12 55 A38 38 0 0 1 88 55" fill="none" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
        {/* Foreground filled arc */}
        <path
          d="M12 55 A38 38 0 0 1 88 55"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        {/* Value text */}
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
  const [, setHistory] = useState([]);

  const [aiCategory, setAiCategory] = useState(null);
  const [isAnomaly, setIsAnomaly] = useState(false);
  const [anomalyReason, setAnomalyReason] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [stats, setStats] = useState({ total: 0, anomalies: 0 });
  const [categoryCounts, setCategoryCounts] = useState({ Light: 0, Medium: 0, Heavy: 0, Anomaly: 0 });
  const [gateOpen, setGateOpen] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  const socketRef = useRef(null);

  const connectedRef = useRef(false);
  const historyLoadedRef = useRef(false);

  const classifyWeight = (w) => {
    if (w == null || w <= 0) return 'Anomaly';
    if (w < 250) return 'Light';
    if (w < 750) return 'Medium';
    return 'Heavy';
  };

  const fetchHistory = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/history`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      const items = [];
      for (const [deviceId, entries] of Object.entries(data)) {
        for (const [ts, entry] of Object.entries(entries)) {
          items.push({ deviceId, ...entry, _key: ts });
        }
      }
      items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setHistory(items.slice(0, 20));

      if (!historyLoadedRef.current && items.length > 0) {
        historyLoadedRef.current = true;
        const sorted = [...items].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        const recent = sorted.slice(-MAX_DATA_POINTS);

        setDistanceSeries(recent.map((r) => ({
          time: formatTime(r.timestamp),
          distance: r.distance_cm ?? 0,
        })));

        setWeightSeries(recent.map((r) => ({
          time: formatTime(r.timestamp),
          weight: r.weight_g ?? 0,
        })));

        const counts = { Light: 0, Medium: 0, Heavy: 0, Anomaly: 0 };
        for (const r of sorted) {
          const cat = classifyWeight(r.weight_g);
          counts[cat] = (counts[cat] || 0) + 1;
        }
        setCategoryCounts(counts);
        setStats((prev) => ({ ...prev, total: sorted.length }));
      }
    } catch (err) {
      console.error('[Dashboard] Fetch history error:', err.message);
    }
  };

  useEffect(() => {
    const sock = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    sock.on('connect', () => {
      setConnected(true);
      connectedRef.current = true;
      socketRef.current = sock;
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
        setCategoryCounts((prev) => ({ ...prev, Anomaly: prev.Anomaly + 1 }));
      } else if (payload.category) {
        setCategoryCounts((prev) => ({ ...prev, [payload.category]: (prev[payload.category] || 0) + 1 }));
      }
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

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
          <span className="font-bold">Alert:</span> {anomalyReason}
          <span className="text-red-400 font-semibold">
            → {recommendedAction === 'INSPECT_STATION'
              ? 'Please inspect the station'
              : 'Check the sorting gate'}
          </span>
        </div>
      )}

      {/* Actuator Control Panel */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" /> Actuator Controls
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { socketRef.current?.emit('gate-trigger', 'open'); setGateOpen(true); }}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors
              ${gateOpen ? 'bg-emerald-900/40 text-emerald-400 border-emerald-600' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'}`}>
            <DoorOpen className="w-3.5 h-3.5" /> Open Gate
          </button>
          <button
            onClick={() => { socketRef.current?.emit('gate-trigger', 'close'); setGateOpen(false); }}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors
              ${!gateOpen ? 'bg-orange-900/40 text-orange-400 border-orange-600' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'}`}>
            <DoorClosed className="w-3.5 h-3.5" /> Close Gate
          </button>
          <span className="text-gray-600 mx-1">|</span>
          <button
            onClick={() => { socketRef.current?.emit('alarm-toggle', true); setAlarmOn(true); }}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors
              ${alarmOn ? 'bg-red-900/40 text-red-400 border-red-600' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'}`}>
            <Bell className="w-3.5 h-3.5" /> Alarm On
          </button>
          <button
            onClick={() => { socketRef.current?.emit('alarm-toggle', false); setAlarmOn(false); }}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors
              ${!alarmOn ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'}`}>
            <BellOff className="w-3.5 h-3.5" /> Alarm Off
          </button>
          <span className="text-gray-600 mx-1">|</span>
          <button
            onClick={() => { socketRef.current?.emit('emergency-stop'); setGateOpen(false); setAlarmOn(true); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg border
              bg-red-700 hover:bg-red-600 text-white border-red-500 transition-colors animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" /> EMERGENCY STOP
          </button>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span>Gate: <span className={gateOpen ? 'text-emerald-400' : 'text-orange-400'}>{gateOpen ? 'OPEN' : 'CLOSED'}</span></span>
          <span>Alarm: <span className={alarmOn ? 'text-red-400' : 'text-slate-400'}>{alarmOn ? 'ACTIVE' : 'OFF'}</span></span>
        </div>
      </div>

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

      {/* Classification Distribution Bar Chart */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Classification Distribution</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={Object.entries(categoryCounts).map(([name, count]) => ({ name, count }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} />
            <YAxis stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px' }} />
            <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Clock,
  Gauge,
  LogOut,
  Scale,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { clearToken } from '../components/ProtectedRoute';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_DATA_POINTS = 30;

const formatTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  const [latest, setLatest] = useState({
    distance_cm: '--',
    weight_g: '--',
    dwell_time_sec: '--',
    timestamp: null,
  });

  const [distanceSeries, setDistanceSeries] = useState([]);
  const [weightSeries, setWeightSeries] = useState([]);

  const [aiCategory, setAiCategory] = useState(null);
  const [isAnomaly, setIsAnomaly] = useState(false);
  const [anomalyReason, setAnomalyReason] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');

  const [forecast, setForecast] = useState(null);

  const [stats, setStats] = useState({ total: 0, anomalies: 0 });

  const connectedRef = useRef(false);

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
      sock.emit('request-history', 50);
    });

    sock.on('disconnect', () => {
      setConnected(false);
      connectedRef.current = false;
    });

    sock.on('sensor-data', (payload) => {
      setLatest({
        distance_cm: payload.distance_cm ?? '--',
        weight_g: payload.weight_g ?? '--',
        dwell_time_sec: payload.dwell_time_sec ?? '--',
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      const now = payload.timestamp || new Date().toISOString();
      const t = formatTime(now);

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

      setLatest({
        distance_cm: payload.distance_cm ?? '--',
        weight_g: payload.weight_g ?? '--',
        dwell_time_sec: payload.dwell_time_sec ?? '--',
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      if (payload.is_anomaly) {
        setStats((prev) => ({ ...prev, anomalies: prev.anomalies + 1 }));
      }
    });

    sock.on('forecast-update', (data) => {
      setForecast(data);
    });

    setSocket(sock);

    return () => sock.disconnect();
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
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            Smart Warehouse Monitor
          </h1>
          <p className="text-gray-400 text-xs">IoT Dashboard — Real-time Sensor Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full
              ${connected ? 'bg-green-900/40 text-green-400 border border-green-700'
                         : 'bg-red-900/40 text-red-400 border border-red-700'}`}
          >
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          {latest.timestamp && (
            <span className="text-xs text-gray-500">Updated: {formatTime(latest.timestamp)}</span>
          )}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg
              bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Anomaly Banner */}
      {isAnomaly && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium
          bg-red-950/50 border-red-500 text-red-300 animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <div className="flex items-center gap-2">
            <span className="font-bold">ANOMALY:</span>
            <span>{anomalyReason}</span>
            <span className="text-red-500">→ {recommendedAction}</span>
          </div>
        </div>
      )}

      {/* Sensor Cards */}
      <div className="grid grid-cols-4 gap-3">
        <SensorCard icon={<Gauge className="w-5 h-5" />} label="Distance" value={`${latest.distance_cm} cm`}
          color="text-cyan-400" bg="bg-cyan-950/30 border-cyan-700" />
        <SensorCard icon={<Scale className="w-5 h-5" />} label="Weight"
          value={latest.weight_g !== '--' ? `${latest.weight_g} g` : '-- g'}
          color="text-emerald-400" bg="bg-emerald-950/30 border-emerald-700" />
        <SensorCard icon={<Clock className="w-5 h-5" />} label="Dwell Time"
          value={latest.dwell_time_sec !== '--' ? `${latest.dwell_time_sec} s` : '-- s'}
          color="text-violet-400" bg="bg-violet-950/30 border-violet-700" />
        <SensorCard icon={<Activity className="w-5 h-5" />} label="AI Classification"
          value={aiCategory || '--'}
          color={isAnomaly ? 'text-red-400' : 'text-yellow-400'}
          bg={isAnomaly ? 'bg-red-950/40 border-red-700' : 'bg-yellow-950/30 border-yellow-700'} />
      </div>

      {/* Charts + Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Distance Over Time (cm)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} angle={-30} textAnchor="end" height={50} />
              <YAxis stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }} />
              <Legend />
              <Line type="monotone" dataKey="distance" stroke="#22d3ee" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Distance (cm)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weight Over Time (g)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} angle={-30} textAnchor="end" height={50} />
              <YAxis stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }} />
              <Legend />
              <Line type="monotone" dataKey="weight" stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Weight (g)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Throughput Forecast */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" /> Throughput Forecast
          </h3>
          {forecast && forecast.data_points >= 3 ? (
            <div className="space-y-2 text-sm">
              <Row label="Current rate" value={`${forecast.current_rate} /min`} />
              <Row label="Trend">
                <span className={
                  forecast.trend === 'up' ? 'text-emerald-400' :
                  forecast.trend === 'down' ? 'text-red-400' : 'text-amber-400'
                }>
                  {forecast.trend === 'up' ? '↑ Rising' : forecast.trend === 'down' ? '↓ Falling' : '→ Stable'}
                </span>
              </Row>
              <Row label="Next 10 min"
                value={`~${Math.round(forecast.predictions.reduce((s, p) => s + p.predicted_packages, 0))} packages`}
                color="text-cyan-400" />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Collecting data ({forecast?.data_points || 0} minutes)...</p>
          )}
        </div>

        {/* Live Stats */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> Live Statistics
          </h3>
          <div className="space-y-2 text-sm">
            <Row label="Total readings" value={stats.total} />
            <Row label="Anomalies" value={stats.anomalies} color={stats.anomalies > 0 ? 'text-red-400' : 'text-emerald-400'} />
            <Row label="Last classified" value={aiCategory || '--'} color="text-yellow-400" />
            <Row label="Connection" value={connected ? 'OK' : 'Offline'} color={connected ? 'text-emerald-400' : 'text-red-400'} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Sub-components ───── */

function SensorCard({ icon, label, value, color = 'text-white', bg = 'bg-gray-900 border-gray-700' }) {
  return (
    <div className={`rounded-xl border p-3 ${bg} transition-all hover:brightness-110`}>
      <div className="flex items-center gap-1.5 mb-1.5 text-gray-400 text-xs font-medium uppercase tracking-wider">
        {icon} {label}
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

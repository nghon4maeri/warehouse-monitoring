import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Activity,
  AlertTriangle,
  DoorOpen,
  DoorClosed,
  Gauge,
  Palette,
  Thermometer,
  Droplets,
  Power,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/* ───── Constants ───── */
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_DATA_POINTS = 30;

/* ───── Helper: format timestamp for x-axis ───── */
const formatTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/* ───── Dashboard Component ───── */
export default function Dashboard() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  // Latest sensor snapshot
  const [latest, setLatest] = useState({
    distance_cm: '--',
    color: 'unknown',
    temperature: '--',
    humidity: '--',
    timestamp: null,
  });

  // Time-series arrays for charts
  const [distanceSeries, setDistanceSeries] = useState([]);
  const [colorCounts, setColorCounts] = useState({ red: 0, green: 0, blue: 0, yellow: 0, unknown: 0 });
  const [temperatureSeries, setTemperatureSeries] = useState([]);
  const [alertMessage, setAlertMessage] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);

  // Connection status ref (avoids stale closure)
  const connectedRef = useRef(false);

  /* ───── Socket.io lifecycle ───── */
  useEffect(() => {
    const sock = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    sock.on('connect', () => {
      setConnected(true);
      connectedRef.current = true;
      console.log('[Socket] Connected:', sock.id);
      sock.emit('request-history', 50);
    });

    sock.on('disconnect', () => {
      setConnected(false);
      connectedRef.current = false;
    });

    sock.on('sensor-data', (payload) => {
      setLatest({
        distance_cm: payload.distance_cm ?? '--',
        color: payload.color ?? 'unknown',
        temperature: payload.temperature ?? '--',
        humidity: payload.humidity ?? '--',
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      const now = payload.timestamp || new Date().toISOString();
      const t = formatTime(now);

      setDistanceSeries((prev) => {
        const next = [...prev, { time: t, distance: payload.distance_cm ?? 0 }];
        return next.length > MAX_DATA_POINTS ? next.slice(-MAX_DATA_POINTS) : next;
      });

      setTemperatureSeries((prev) => {
        const next = [
          ...prev,
          {
            time: t,
            temperature: payload.temperature ?? 0,
            humidity: payload.humidity ?? 0,
          },
        ];
        return next.length > MAX_DATA_POINTS ? next.slice(-MAX_DATA_POINTS) : next;
      });

      // Color counter for bar chart
      const c = (payload.color || 'unknown').toLowerCase();
      setColorCounts((prev) => ({ ...prev, [c]: (prev[c] || 0) + 1 }));
    });

    setSocket(sock);

    return () => {
      sock.disconnect();
    };
  }, []);

  /* ───── Alert system ───── */
  useEffect(() => {
    const dist = parseFloat(latest.distance_cm);
    if (!isNaN(dist) && dist < 10) {
      setAlertMessage('Obstacle too close — possible collision risk!');
    } else if (!isNaN(dist) && dist < 30) {
      setAlertMessage('Proximity warning — object approaching.');
    } else {
      setAlertMessage(null);
    }
  }, [latest.distance_cm]);

  /* ───── Actuator Commands ───── */
  const sendCommand = useCallback(
    (command, extra = {}) => {
      if (!socket || !connectedRef.current) {
        console.warn('Socket not connected');
        return;
      }
      socket.emit('actuator-command', { command, ...extra });
    },
    [socket],
  );

  const handleEmergencyStop = () => {
    socket?.emit('emergency-stop');
    setAlertMessage('EMERGENCY STOP issued!');
    setTimeout(() => setAlertMessage(null), 5000);
  };

  const handleGateToggle = () => {
    const action = gateOpen ? 'close' : 'open';
    socket?.emit('gate-trigger', action);
    setGateOpen(!gateOpen);
  };

  /* ───── Render ───── */
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 space-y-6">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Smart Warehouse Monitor
          </h1>
          <p className="text-gray-400 text-sm">IoT Dashboard — Real-time Sensor Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full
              ${connected ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-red-900/40 text-red-400 border border-red-700'}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
            />
            {connected ? 'Live' : 'Offline'}
          </span>
          {latest.timestamp && (
            <span className="text-xs text-gray-500">
              Updated: {formatTime(latest.timestamp)}
            </span>
          )}
        </div>
      </header>

      {/* ── Alert Banner ── */}
      {alertMessage && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium
            ${alertMessage.includes('EMERGENCY') ? 'bg-red-950/40 border-red-500 text-red-300' : 'bg-amber-950/30 border-amber-600 text-amber-300'}`}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {alertMessage}
        </div>
      )}

      {/* ── Sensor Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SensorCard
          icon={<Gauge className="w-5 h-5" />}
          label="Distance"
          value={`${latest.distance_cm} cm`}
          color="text-cyan-400"
          bg="bg-cyan-950/30 border-cyan-700"
        />
        <SensorCard
          icon={<Palette className="w-5 h-5" />}
          label="Detected Color"
          value={latest.color}
          color="text-purple-400"
          bg="bg-purple-950/30 border-purple-700"
        />
        <SensorCard
          icon={<Thermometer className="w-5 h-5" />}
          label="Temperature"
          value={latest.temperature !== '--' ? `${latest.temperature} °C` : '-- °C'}
          color="text-orange-400"
          bg="bg-orange-950/30 border-orange-700"
        />
        <SensorCard
          icon={<Droplets className="w-5 h-5" />}
          label="Humidity"
          value={latest.humidity !== '--' ? `${latest.humidity} %` : '-- %'}
          color="text-blue-400"
          bg="bg-blue-950/30 border-blue-700"
        />
      </div>

      {/* ── Control Buttons ── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleEmergencyStop}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white
            font-semibold rounded-lg transition-colors text-sm shadow-lg shadow-red-900/30"
        >
          <PowerOff className="w-4 h-4" />
          Emergency Stop
        </button>

        <button
          onClick={handleGateToggle}
          className={`inline-flex items-center gap-2 px-6 py-2.5 font-semibold rounded-lg transition-colors text-sm
            ${gateOpen
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
        >
          {gateOpen ? <DoorClosed className="w-4 h-4" /> : <DoorOpen className="w-4 h-4" />}
          {gateOpen ? 'Close Gate' : 'Open Gate'}
        </button>

        <button
          onClick={() => {
            // Request actuator command via REST fallback
            fetch('/api/actuators', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: 'refresh_status' }),
            }).catch(console.error);
          }}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white
            font-semibold rounded-lg transition-colors text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Status
        </button>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distance Line Chart */}
        <ChartCard title="Distance Over Time (cm)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tick={{ fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="distance"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                name="Distance (cm)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Temperature / Humidity Line Chart */}
        <ChartCard title="Temperature &amp; Humidity">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={temperatureSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                fontSize={11}
                tick={{ fill: '#94a3b8' }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tick={{ fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#fb923c"
                strokeWidth={2}
                dot={false}
                name="Temp (°C)"
              />
              <Line
                type="monotone"
                dataKey="humidity"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                name="Humidity (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Color Detection Bar Chart */}
        <ChartCard title="Detected Colors (cumulative)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={Object.entries(colorCounts).map(([color, count]) => ({ color, count }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="color" stroke="#94a3b8" fontSize={12} tick={{ fill: '#94a3b8' }} />
              <YAxis stroke="#94a3b8" fontSize={12} tick={{ fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                }}
              />
              <Bar dataKey="count" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* System Health Card */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col justify-center">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            System Health
          </h3>
          <div className="space-y-3 text-sm">
            <StatusRow label="MQTT Broker" ok />
            <StatusRow label="PostgreSQL" ok />
            <StatusRow label="Firebase RTDB" ok />
            <StatusRow label="AI Service" ok />
            <StatusRow
              label={`Gate ${gateOpen ? 'OPEN' : 'CLOSED'}`}
              ok={!gateOpen}
              warn={gateOpen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Sub-components ───── */

function SensorCard({ icon, label, value, color = 'text-white', bg = 'bg-gray-900 border-gray-700' }) {
  return (
    <div className={`rounded-xl border p-4 ${bg} transition-all hover:brightness-110`}>
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
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

function StatusRow({ label, ok, warn }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
          ${ok ? 'bg-green-900/30 text-green-400' : ''}
          ${warn && !ok ? 'bg-amber-900/30 text-amber-400' : ''}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}
        />
        {ok ? (warn ? 'WARN' : 'OK') : 'DOWN'}
      </span>
    </div>
  );
}

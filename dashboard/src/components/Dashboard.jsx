import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, AlertTriangle, Users, ArrowLeft, ShieldAlert, Camera, MapPin, Zap, AlertCircle } from 'lucide-react';

const Dashboard = ({ zone, onBack }) => {
  const [frameData, setFrameData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [sriHistory, setSriHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const logsRef = useRef([]);
  const lastBand = useRef(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8000/ws/analyze');

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(JSON.stringify({ video_filename: zone.video }));
      pushLog('System connected. Analyzing stream for ' + zone.name, 'info');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) { pushLog('Error: ' + data.error, 'error'); return; }
      if (data.type !== 'update') return;

      const m = data.metrics;
      setFrameData(data.frame);
      setMetrics(m);

      setSriHistory(prev => {
        const next = [...prev, { time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), sri: m.sri }];
        return next.length > 40 ? next.slice(-40) : next;
      });

      // Band change alert
      if (lastBand.current && lastBand.current !== m.risk_band) {
        pushLog(`Risk band changed: ${lastBand.current} → ${m.risk_band}`, m.sri > 55 ? 'critical' : 'warning');
      }
      lastBand.current = m.risk_band;

      // Threshold proximity warning
      const pct = (m.headcount / zone.capacity) * 100;
      if (pct >= 90) pushLog(`⚠️ CRITICAL: ${pct.toFixed(0)}% capacity reached (${m.headcount}/${zone.capacity})`, 'critical');
      else if (pct >= 75) pushLog(`⚠️ WARNING: ${pct.toFixed(0)}% capacity (${m.headcount}/${zone.capacity})`, 'warning');

      if (m.sri > 75) pushLog(`🚨 HIGH SRI: ${m.sri} — Stampede risk elevated`, 'critical');
      if (m.is_overloaded) pushLog('🏗️ STRUCTURAL OVERLOAD DETECTED', 'critical');
      if (m.has_fallen) pushLog('🚑 Fallen person detected in frame!', 'critical');
    };

    socket.onclose = () => setIsConnected(false);
    socket.onerror = () => pushLog('WebSocket error — check backend is running', 'error');

    return () => socket.close();
  }, [zone]);

  const pushLog = (msg, type = 'info') => {
    const entry = { time: new Date().toLocaleTimeString(), msg, type, id: Date.now() + Math.random() };
    logsRef.current = [entry, ...logsRef.current].slice(0, 60);
    setLogs([...logsRef.current]);
  };

  const getRiskStyle = (band) => {
    const map = {
      GREEN:  { cls: 'text-emerald-400', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
      YELLOW: { cls: 'text-yellow-400',  bg: 'rgba(234,179,8,0.1)',  border: 'rgba(234,179,8,0.3)' },
      ORANGE: { cls: 'text-orange-500',  bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
      RED:    { cls: 'text-red-500',     bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)' },
      BLACK:  { cls: 'text-purple-400',  bg: 'rgba(168,85,247,0.15)',border: 'rgba(168,85,247,0.5)' },
    };
    return map[band] || { cls: 'text-gray-400', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' };
  };

  const capacityPct = metrics ? Math.min(100, (metrics.headcount / zone.capacity) * 100) : 0;
  const rs = getRiskStyle(metrics?.risk_band);

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4" style={{ background: '#0f172a' }}>

      {/* ─── Header ─── */}
      <header className="glass-panel flex items-center justify-between" style={{ padding: '12px 16px' }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full transition-colors hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <span className="text-2xl">{zone.icon}</span>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              {zone.name}
              <span className="text-xs font-normal text-gray-500 flex items-center gap-1">
                <Camera size={11} />{zone.camera}
              </span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span>
              {isConnected ? 'Live Feed Active' : 'Connecting…'}
              <span>•</span>
              <ShieldAlert size={11} /> Anonymous Monitoring
            </div>
          </div>
        </div>
        {metrics && (
          <div className="px-4 py-2 rounded-lg font-bold text-sm" style={{ background: rs.bg, border: `1px solid ${rs.border}`, color: rs.cls.replace('text-', '') }}>
            <span className={rs.cls}>Status: {metrics.risk_band}</span>
          </div>
        )}
      </header>

      {/* ─── Main Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">

        {/* Left 2 cols: Video + Chart */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Video Feed */}
          <div className="glass-panel overflow-hidden relative" style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', padding: 0 }}>
            {frameData
              ? <img src={frameData} alt="Live Analysis" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Activity className="animate-spin" size={32} />
                  <span className="text-sm">Waiting for video stream…</span>
                </div>
              )}

            {/* Overlays */}
            {metrics && (
              <>
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded text-sm text-white" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Users size={13} />
                    {metrics.headcount} / {zone.capacity} ppl
                  </div>
                  <div className="px-2.5 py-1 rounded text-xs" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    {zone.movementType}
                  </div>
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded font-bold text-sm" style={{ background: rs.bg, border: `1px solid ${rs.border}` }}>
                  <span className={rs.cls}>SRI {metrics.sri}</span>
                </div>
              </>
            )}
          </div>

          {/* Capacity Bar */}
          {metrics && (
            <div className="glass-panel" style={{ padding: '12px 16px' }}>
              <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
                <span className="font-semibold text-white">Capacity</span>
                <span className={capacityPct >= 90 ? 'text-red-400 font-bold' : capacityPct >= 75 ? 'text-orange-400' : 'text-emerald-400'}>
                  {capacityPct.toFixed(0)}% ({metrics.headcount} / {zone.capacity})
                </span>
              </div>
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
                <div
                  className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${capacityPct}%`,
                    background: capacityPct >= 90 ? '#ef4444' : capacityPct >= 75 ? '#f97316' : '#10b981'
                  }}
                />
                {/* Threshold marker at 75% */}
                <div className="absolute top-0 h-full w-0.5 bg-yellow-400 opacity-80" style={{ left: '75%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0%</span>
                <span className="text-yellow-500">⚠ 75% threshold</span>
                <span>100% cap</span>
              </div>
            </div>
          )}

          {/* SRI Timeline */}
          <div className="glass-panel flex-1" style={{ minHeight: 200 }}>
            <h2 className="text-xs font-bold mb-2 flex items-center gap-2 text-gray-400 uppercase tracking-wider">
              <Activity size={13} /> SRI Timeline
            </h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={sriHistory} margin={{ top: 4, right: 16, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#334155" fontSize={10} tick={{ fill: '#64748b' }} interval="preserveStartEnd" />
                <YAxis stroke="#334155" domain={[0, 100]} fontSize={10} tick={{ fill: '#64748b' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                <ReferenceLine y={76} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'RED', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                <ReferenceLine y={56} stroke="#f97316" strokeDasharray="3 3" label={{ value: 'ORANGE', fill: '#f97316', fontSize: 10, position: 'right' }} />
                <Line type="monotone" dataKey="sri" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            {metrics?.forecast_seconds > 0 && (
              <p className="text-xs text-orange-400 text-right mt-1">
                ⏱ Forecast: Critical in ~{Math.ceil(metrics.forecast_seconds / 60)} min at {zone.name}
              </p>
            )}
          </div>
        </div>

        {/* Right col: Zone Info + Actions + Metrics + Log */}
        <div className="flex flex-col gap-4">

          {/* Zone Info Card */}
          <div className="glass-panel space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <MapPin size={13} /> Zone Profile
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p className="text-xs text-gray-500 mb-0.5">Area</p>
                <p className="font-bold text-white">{zone.areaSize}</p>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p className="text-xs text-gray-500 mb-0.5">Max Capacity</p>
                <p className="font-bold text-white">{zone.capacity.toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-lg p-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-xs text-gray-500 mb-0.5">Movement Type</p>
              <p className="font-semibold text-white">{zone.movementType}</p>
            </div>
            <div className="rounded-lg p-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs text-red-400 mb-0.5 flex items-center gap-1"><AlertTriangle size={11} /> Possible Disaster</p>
              <p className="font-bold text-red-300">{zone.overcrowdDisaster}</p>
            </div>
          </div>

          {/* AI Insights */}
          <div className="glass-panel">
            <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-3 flex items-center gap-2">
              <Zap size={13} /> Crowd AI Insights
            </h2>
            <div className="space-y-3">
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-xs text-gray-500 mb-1">Detected Event Profile</p>
                {metrics?.event_archetype ? (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white text-sm">{metrics.event_archetype.emoji} {metrics.event_archetype.name}</span>
                      <span className="text-xs text-purple-400 font-mono">{(metrics.event_archetype.confidence * 100).toFixed(0)}% Match</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">{metrics.event_archetype.risk_profile}</p>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-gray-600">Analyzing...</span>
                )}
              </div>
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-xs text-gray-500 mb-1">Dynamics State</p>
                {metrics?.dynamics_state ? (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white text-sm">{metrics.dynamics_state.state}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                        metrics.dynamics_state.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                        metrics.dynamics_state.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                        metrics.dynamics_state.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>{metrics.dynamics_state.severity}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">{metrics.dynamics_state.definition}</p>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-gray-600">Analyzing...</span>
                )}
              </div>
            </div>
          </div>

          {/* Live Metrics */}
          <div className="glass-panel">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
              <Activity size={13} /> Live Metrics
            </h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Density', value: metrics ? `${metrics.density.toFixed(2)} ppl/m²` : '--', color: '#6366f1' },
                { label: 'Flow Variance', value: metrics ? metrics.velocity_variance.toFixed(2) : '--', color: '#8b5cf6' },
                { label: 'Mean Velocity', value: metrics ? `${metrics.mean_velocity.toFixed(1)} px/s` : '--', color: '#a78bfa' },
                { label: 'Struct. Load', value: metrics ? `${metrics.structural_load_pct.toFixed(0)}%` : '--', color: metrics?.is_overloaded ? '#ef4444' : '#10b981' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Threshold Actions */}
          <div className="glass-panel">
            <h2 className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-3 flex items-center gap-2">
              <Zap size={13} /> Actions at Threshold
            </h2>
            <ol className="space-y-2">
              {zone.thresholdActions.map((action, i) => (
                <li key={i} className="flex gap-2 items-start text-xs text-gray-300">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full text-yellow-400 font-bold flex items-center justify-center mt-0.5" style={{ background: 'rgba(234,179,8,0.15)' }}>
                    {i + 1}
                  </span>
                  {action}
                </li>
              ))}
            </ol>
          </div>

          {/* Incident Log */}
          <div className="glass-panel flex flex-col flex-1" style={{ minHeight: 200 }}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
              <AlertCircle size={13} /> Incident Log
            </h2>
            <div className="overflow-y-auto space-y-1.5 pr-1 flex-1" style={{ maxHeight: 220 }}>
              {logs.map((log) => (
                <div key={log.id} className={`px-2 py-1.5 rounded text-xs border-l-2 ${
                  log.type === 'critical' ? 'border-red-500 bg-red-500/10 text-red-200' :
                  log.type === 'warning'  ? 'border-orange-500 bg-orange-500/10 text-orange-200' :
                  log.type === 'error'    ? 'border-red-700 bg-red-900/20 text-red-300' :
                  'border-blue-500 bg-blue-500/10 text-blue-200'
                }`}>
                  <span className="opacity-50 mr-1">{log.time}</span>{log.msg}
                </div>
              ))}
              {logs.length === 0 && <div className="text-gray-600 text-center py-4">No events yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

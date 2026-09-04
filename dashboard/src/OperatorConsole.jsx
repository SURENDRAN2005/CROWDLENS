import React, { useState, useEffect, useRef } from 'react';

/* ========== ZONE METADATA ========== */
const INITIAL_ZONES = [
  { id: 'zone-a', name: 'Zone A', video: 'crowd10.mp4', status: 'RED',
    area_m2: 120, capacity: 200 },
  { id: 'zone-b', name: 'Zone B', video: 'crowd5.mp4', status: 'BLACK',
    area_m2: 500, capacity: 800 },
  { id: 'zone-c', name: 'Zone C', video: 'crowd1.mp4', status: 'ORANGE',
    area_m2: 80, capacity: 150 },
  { id: 'zone-d', name: 'Zone D', video: 'crowd16.mp4', status: 'YELLOW',
    area_m2: 200, capacity: 350 },
  { id: 'zone-e', name: 'Zone E', video: 'crowd2.mp4', status: 'GREEN',
    area_m2: 300, capacity: 500 },
  { id: 'zone-f', name: 'Zone F', video: 'crowd3.mp4', status: 'GREEN',
    area_m2: 150, capacity: 250 },
];

const STATUS_COLORS = {
  RED:    { text: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-300',    dot: 'bg-red-600' },
  BLACK:  { text: 'text-black',      bg: 'bg-gray-200',   border: 'border-gray-400',   dot: 'bg-black' },
  ORANGE: { text: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300', dot: 'bg-orange-500' },
  YELLOW: { text: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300', dot: 'bg-yellow-500' },
  GREEN:  { text: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300',  dot: 'bg-green-500' },
};

/* ========== SMART ANALYSIS FUNCTIONS ========== */
function getMovementType(metrics) {
  if (!metrics) return { type: 'Unknown', desc: 'Awaiting data...' };
  const v = metrics.mean_velocity || 0;
  const vv = metrics.velocity_variance || 0;
  const state = metrics.dynamics_state?.state || 'Passive';

  if (state === 'Panic' || state === 'Dispersing')
    return { type: 'Chaotic Dispersal', desc: 'Crowd is scattering in multiple directions with high velocity variance. Evacuation pattern detected.' };
  if (v < 0.5 && vv < 1.0)
    return { type: 'Static / Stationary', desc: 'Crowd is mostly still. Minimal body movement. Typical of seated or waiting groups.' };
  if (v < 1.5 && vv < 2.0)
    return { type: 'Laminar Flow', desc: 'Orderly, unidirectional movement at walking pace. Low turbulence. Normal pedestrian behavior.' };
  if (v < 3.0 && vv < 4.0)
    return { type: 'Turbulent Flow', desc: 'Moderate speed with inconsistent directions. Crowd members are weaving and changing course. Early warning sign.' };
  if (vv >= 4.0)
    return { type: 'Stop-and-Go Waves', desc: 'High velocity variance indicates compression waves propagating through crowd. Precursor to crush events.' };
  return { type: 'Active Movement', desc: 'Purposeful movement with moderate energy. Watch for acceleration.' };
}

function getPossibleDisasters(metrics, zone) {
  const disasters = [];
  if (!metrics) return [{ name: 'Awaiting data', severity: 'LOW', desc: 'No live metrics yet.' }];
  
  const density = metrics.density || 0;
  const sri = metrics.sri || 0;
  const headcount = metrics.headcount || 0;
  const occupancy = (headcount / zone.capacity) * 100;
  const loadPct = metrics.structural_load_pct || 0;

  if (density > 6) disasters.push({ name: 'Crowd Crush', severity: 'CRITICAL', desc: `Density at ${density.toFixed(1)} ppm² exceeds the 6 ppm² lethal threshold. Asphyxiation risk imminent.` });
  else if (density > 4) disasters.push({ name: 'Crowd Crush Risk', severity: 'HIGH', desc: `Density at ${density.toFixed(1)} ppm² approaching dangerous levels. Compression forces increasing.` });

  if (sri > 76) disasters.push({ name: 'Stampede', severity: 'CRITICAL', desc: `SRI at ${sri.toFixed(0)} — panic-level risk. Counter-flow and fallen persons likely.` });
  else if (sri > 56) disasters.push({ name: 'Stampede Risk', severity: 'HIGH', desc: `SRI at ${sri.toFixed(0)} — volatile crowd dynamics. Sudden trigger could cause mass flight.` });

  if (loadPct > 95) disasters.push({ name: 'Structural Failure', severity: 'CRITICAL', desc: `Load at ${loadPct}% of rated capacity. Risk of platform/bridge collapse.` });
  else if (loadPct > 80) disasters.push({ name: 'Structural Overload', severity: 'HIGH', desc: `Load at ${loadPct}% — approaching structural limits. Resonance amplification possible.` });

  if (occupancy > 100) disasters.push({ name: 'Overcapacity', severity: 'HIGH', desc: `Zone is at ${occupancy.toFixed(0)}% of safe capacity (${headcount}/${zone.capacity}).` });

  if (metrics.has_fallen) disasters.push({ name: 'Fallen Person', severity: 'CRITICAL', desc: 'Horizontal body detected in crowd. Immediate trampling risk.' });

  if (disasters.length === 0) disasters.push({ name: 'No Immediate Threat', severity: 'LOW', desc: 'All indicators within safe operating parameters.' });
  return disasters;
}

function getRecommendedActions(metrics, zone) {
  if (!metrics) return ['Awaiting live data feed...'];
  const headcount = metrics.headcount || 0;
  const occupancy = (headcount / zone.capacity) * 100;
  const sri = metrics.sri || 0;
  const actions = [];

  if (sri >= 76) {
    actions.push('🔴 HALT all entry gates immediately');
    actions.push('🔴 Activate emergency PA — announce calm evacuation');
    actions.push('🔴 Deploy crowd marshals to all exits');
    actions.push('🔴 Notify local emergency services (fire, ambulance)');
  } else if (sri >= 56) {
    actions.push('🟠 Restrict entry to 50% flow rate');
    actions.push('🟠 Position crowd marshals at chokepoints');
    actions.push('🟠 Pre-stage medical team near exits');
    actions.push('🟠 Monitor for fallen persons and counter-flow');
  } else if (occupancy >= 80) {
    actions.push('🟡 Begin metering entry — one-in-one-out policy');
    actions.push('🟡 Open auxiliary exit routes');
    actions.push('🟡 Announce via PA: crowd advisory');
  } else if (occupancy >= 60) {
    actions.push('🟢 Standard monitoring — increase camera sweep rate');
    actions.push('🟢 Brief crowd marshals on current density');
  } else {
    actions.push('✅ Normal operations — no intervention required');
  }

  if (metrics.has_fallen) {
    actions.unshift('🔴 IMMEDIATE: Fallen person detected — dispatch rescue team');
  }
  if (metrics.structural_load_pct > 90) {
    actions.unshift('🔴 STRUCTURAL: Evacuate load-bearing area immediately');
  }

  return actions;
}

/* ========== WebSocket Hook ========== */
function useZoneMonitor(zone, zoneIndex = 0) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    if (!zone) return;
    // Stagger connections: each zone waits (index * 800ms) before connecting.
    // This prevents all 6 zones from hitting the backend simultaneously.
    const delay = zoneIndex * 800;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      ws.current = new WebSocket('ws://localhost:8000/ws/analyze');
      ws.current.onopen = () => {
        setConnected(true);
        ws.current.send(JSON.stringify({ video_filename: zone.video }));
      };
      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'update') setData(msg);
        } catch (e) { console.error("Parse error", e); }
      };
      ws.current.onclose = () => setConnected(false);
      ws.current.onerror = () => setConnected(false);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (ws.current) ws.current.close();
    };
  }, [zone?.id, zone?.video, zoneIndex]);

  return { data, connected };
}

/* ========== ZONE CARD ========== */
function ZoneCard({ zone, monitor, isActive, onClick, onDelete }) {
  const metrics = monitor.data?.metrics;
  const headcount = metrics?.headcount || 0;
  const occupancy = Math.min(100, Math.round((headcount / zone.capacity) * 100));
  const sc = STATUS_COLORS[zone.status] || STATUS_COLORS.GREEN;
  const src = monitor.data?.frame;

  return (
    <div
      onClick={onClick}
      className={`rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border-2 ${isActive ? 'border-black ring-2 ring-black/20 scale-[1.01]' : `${sc.border} hover:border-black/40`} bg-white/60`}
    >
      {/* Camera preview */}
      <div className="relative h-36 bg-black">
        {src ? (
          <img src={src} className="w-full h-full object-cover opacity-90" alt="feed"/>
        ) : (
          <div className="flex items-center justify-center h-full text-[#555] text-[12px]">
            <div className="w-3 h-3 border-2 border-[#555] border-t-transparent rounded-full animate-spin mr-2"></div>
            CONNECTING
          </div>
        )}
        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="bg-[#deedd9]/90 border border-[#b8ceb1] px-1.5 py-0.5 text-[13px] text-black font-extrabold rounded">{zone.name}</span>
          <span className={`${sc.bg} ${sc.text} border ${sc.border} px-1.5 py-0.5 text-[13px] font-extrabold rounded`}>{zone.status}</span>
        </div>
        {/* Delete button — top right */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(zone.id); }}
          title="Remove zone"
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center text-[14px] font-extrabold leading-none transition-colors cursor-pointer z-10"
        >×</button>
        {/* Live dot — hidden when delete button is showing, space taken by it */}
        {monitor.connected && <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
        {/* Density overlay */}
        <div className="absolute bottom-2 left-2 bg-black/70 text-white px-1.5 py-0.5 rounded text-[13px] font-extrabold">
          {metrics?.density?.toFixed(1) || '0.0'} ppm²
        </div>
      </div>
      
      {/* Card body */}
      <div className="p-3">
        <div className="flex justify-between items-center mb-2">
          <div>
            <div className="text-black font-extrabold text-sm">{zone.name}</div>
          </div>
          <div className="text-right">
            <div className="text-black font-extrabold text-sm">{headcount}</div>
            <div className="text-[#1a3314] text-[13px]">/{zone.capacity}</div>
          </div>
        </div>
        {/* Occupancy bar */}
        <div className="w-full h-1.5 bg-[#b8ceb1] rounded overflow-hidden">
          <div className={`h-full transition-all duration-300 rounded ${occupancy > 90 ? 'bg-red-600' : occupancy > 70 ? 'bg-orange-500' : occupancy > 50 ? 'bg-yellow-500' : 'bg-green-600'}`}
            style={{ width: `${occupancy}%` }}></div>
        </div>
        <div className="text-[13px] text-[#1a3314] mt-1">{occupancy}% capacity · {zone.area_m2}m²</div>
      </div>
    </div>
  );
}

/* ========== INFO TABS (bottom section) ========== */
function InfoTabs({ metrics, movement, disasters, actions, severityColor }) {
  const [infoTab, setInfoTab] = React.useState('MOVEMENT');

  const tabs = [
    { id: 'MOVEMENT', label: 'CROWD MOVEMENT TYPE' },
    { id: 'DISASTERS', label: 'POSSIBLE DISASTERS' },
    { id: 'ACTIONS', label: 'RECOMMENDED ACTIONS' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#e5f2e0] rounded-xl overflow-hidden min-h-0">
      {/* Tab bar */}
      <div className="flex gap-1 p-2 bg-[#cbe1c4] flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setInfoTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-[12px] font-extrabold transition-all duration-150 cursor-pointer
              ${infoTab === tab.id
                ? 'bg-[#1a3314] text-[#deedd9] shadow'
                : 'text-[#1a3314] hover:bg-[#b8ceb1]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — full width */}
      <div className="flex-1 overflow-y-auto p-5">

        {infoTab === 'MOVEMENT' && (
          <div className="max-w-3xl space-y-4">
            <div className="bg-white/70 rounded-xl p-4 border border-[#b8ceb1]">
              <div className="text-black font-extrabold text-base normal-case mb-1">{movement.type}</div>
              <div className="text-[#0f2209] text-[13px] normal-case tracking-normal leading-relaxed">{movement.desc}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/70 rounded-xl p-4 border border-[#b8ceb1]">
                <div className="text-[#1a3314] text-[12px] mb-2">DYNAMICS STATE</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-3 py-1 rounded-lg text-[12px] font-extrabold border ${severityColor[metrics?.dynamics_state?.severity || 'LOW']}`}>
                    {metrics?.dynamics_state?.state || 'PASSIVE'}
                  </span>
                  <span className="text-[#1a3314] text-[12px] normal-case">sev: {metrics?.dynamics_state?.severity || 'LOW'}</span>
                </div>
                <div className="text-[#0f2209] text-[12px] normal-case tracking-normal leading-relaxed">
                  {metrics?.dynamics_state?.definition || 'Awaiting classification...'}
                </div>
              </div>
              <div className="bg-white/70 rounded-xl p-4 border border-[#b8ceb1]">
                <div className="text-[#1a3314] text-[12px] mb-2">VISUAL BIOMARKERS</div>
                <div className="text-[#0f2209] text-[12px] normal-case tracking-normal italic leading-relaxed">
                  {metrics?.dynamics_state?.visual_biomarkers || '—'}
                </div>
                <div className="text-[#1a3314] text-[12px] mt-3 mb-1">EVENT ARCHETYPE</div>
                <div className="text-black font-extrabold text-sm normal-case">
                  {metrics?.event_archetype?.emoji || '👥'} {metrics?.event_archetype?.name || 'Detecting...'}
                  <span className="text-green-700 text-[12px] ml-2">conf {metrics?.event_archetype?.confidence || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {infoTab === 'DISASTERS' && (
          <div className="max-w-3xl space-y-3">
            {disasters.map((d, i) => (
              <div key={i} className={`rounded-xl p-4 border ${severityColor[d.severity]}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-extrabold text-sm normal-case">{d.name}</span>
                  <span className={`text-[12px] font-extrabold px-2 py-0.5 rounded-lg border ${severityColor[d.severity]}`}>{d.severity}</span>
                </div>
                <div className="text-[13px] normal-case tracking-normal leading-relaxed opacity-90">{d.desc}</div>
              </div>
            ))}
          </div>
        )}

        {infoTab === 'ACTIONS' && (
          <div className="max-w-3xl space-y-3">
            {actions.map((action, i) => (
              <div key={i} className="bg-white/70 rounded-xl px-4 py-3 border border-[#b8ceb1] text-[14px] text-black font-extrabold normal-case tracking-normal leading-relaxed">
                {action}
              </div>
            ))}
            {/* Threshold gauge */}
            <div className="bg-white/70 rounded-xl p-4 border border-[#b8ceb1] mt-2">
              <div className="text-[#1a3314] text-[13px] mb-3">THRESHOLD PROXIMITY</div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-3 bg-[#b8ceb1] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${(metrics?.sri || 0) > 76 ? 'bg-red-600' : (metrics?.sri || 0) > 56 ? 'bg-orange-500' : (metrics?.sri || 0) > 30 ? 'bg-yellow-500' : 'bg-green-600'}`}
                    style={{ width: `${Math.min(100, metrics?.sri || 0)}%` }}></div>
                </div>
                <span className="text-black font-extrabold text-base min-w-[45px] text-right">{Math.round(metrics?.sri || 0)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-[#1a3314] font-extrabold">
                <span>SAFE</span><span>CAUTION</span><span>VOLATILE</span><span>PANIC</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ========== DETAIL PANEL ========== */
function ZoneDetailPanel({ zone, monitor, activeTab }) {
  const metrics = monitor?.data?.metrics;
  const movement = getMovementType(metrics);
  const disasters = getPossibleDisasters(metrics, zone);
  const actions = getRecommendedActions(metrics, zone);
  const headcount = metrics?.headcount || 0;
  const occupancy = Math.min(100, Math.round((headcount / zone.capacity) * 100));
  const src = activeTab === 'TURBULENCE' || activeTab === 'RISK' ? monitor?.data?.frame_heatmap : monitor?.data?.frame;
  const sc = STATUS_COLORS[zone.status] || STATUS_COLORS.GREEN;

  const severityColor = { LOW: 'text-green-700 bg-green-100 border-green-300', MEDIUM: 'text-yellow-700 bg-yellow-100 border-yellow-300', HIGH: 'text-orange-700 bg-orange-100 border-orange-300', CRITICAL: 'text-red-700 bg-red-100 border-red-300' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-3 p-3 bg-[#d6e8d0] min-h-0">
      {/* Top: Feed + Zone Info side by side — fixed height so tabs get enough room */}
      <div className="flex gap-3 flex-shrink-0" style={{ height: '200px' }}>
        {/* Camera Feed */}
        <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
          {src ? (
            <img src={src} className="w-full h-full object-cover" alt="feed"/>
          ) : (
            <div className="flex items-center justify-center h-full text-[#555]">CONNECTING...</div>
          )}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="bg-[#deedd9]/90 border border-[#b8ceb1] px-2 py-1 text-[12px] text-black font-extrabold rounded">{zone.name}</span>
            <span className={`${sc.bg} ${sc.text} border ${sc.border} px-2 py-1 text-[12px] font-extrabold rounded`}>{zone.status}</span>
          </div>
          <div className="absolute bottom-3 left-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-[12px] flex justify-between font-extrabold">
            <span>{metrics?.density?.toFixed(1) || '0.0'} ppm²</span>
            <span>SRI {Math.round(metrics?.sri || 0)}</span>
            <span>{headcount} people</span>
          </div>
        </div>
        
        {/* Zone Info */}
        <div className="w-[320px] flex-shrink-0 p-4 bg-[#e5f2e0] rounded-xl overflow-y-auto">
          <div className="text-[#1a3314] text-[12px] mb-3">ZONE INFORMATION</div>
          <table className="w-full text-[13px] normal-case tracking-normal">
            <tbody>
              <tr className="border-b border-[#b8ceb1]">
                <td className="py-2 text-[#1a3314] font-extrabold pr-3">Area Size</td>
                <td className="py-2 text-black font-extrabold">{zone.area_m2} m²</td>
              </tr>
              <tr className="border-b border-[#b8ceb1]">
                <td className="py-2 text-[#1a3314] font-extrabold pr-3">Max Capacity</td>
                <td className="py-2 text-black font-extrabold">{zone.capacity} persons</td>
              </tr>
              <tr className="border-b border-[#b8ceb1]">
                <td className="py-2 text-[#1a3314] font-extrabold pr-3">Current Count</td>
                <td className="py-2">
                  <span className={`font-extrabold ${occupancy > 90 ? 'text-red-700' : occupancy > 70 ? 'text-orange-700' : 'text-black'}`}>
                    {headcount} ({occupancy}%)
                  </span>
                </td>
              </tr>
              <tr className="border-b border-[#b8ceb1]">
                <td className="py-2 text-[#1a3314] font-extrabold pr-3">Density</td>
                <td className="py-2 text-black font-extrabold">{metrics?.density?.toFixed(2) || '—'} ppm²</td>
              </tr>
              <tr>
                <td className="py-2 text-[#1a3314] font-extrabold pr-3">Struct. Load</td>
                <td className="py-2 text-black font-extrabold">{metrics?.structural_load_pct || '—'}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom: Tabbed info panel — takes all remaining vertical space */}
      <InfoTabs metrics={metrics} movement={movement} disasters={disasters} actions={actions} severityColor={severityColor} />
    </div>
  );
}

/* ========== MAIN CONSOLE ========== */
export default function OperatorConsole() {
  const [zones, setZones] = useState(INITIAL_ZONES);
  const [activeZoneId, setActiveZoneId] = useState('zone-a');
  const [activeTab, setActiveTab] = useState('DENSITY');
  const [currentTime, setCurrentTime] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0').slice(0, 1));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const activeZone = zones.find(z => z.id === activeZoneId);

  // Monitors for up to 8 zones — staggered by index to avoid simultaneous connection burst
  const m0 = useZoneMonitor(zones[0], 0);
  const m1 = useZoneMonitor(zones[1], 1);
  const m2 = useZoneMonitor(zones[2], 2);
  const m3 = useZoneMonitor(zones[3], 3);
  const m4 = useZoneMonitor(zones[4], 4);
  const m5 = useZoneMonitor(zones[5], 5);
  const m6 = useZoneMonitor(zones[6] || null, 6);
  const m7 = useZoneMonitor(zones[7] || null, 7);
  const allMonitors = [m0, m1, m2, m3, m4, m5, m6, m7];
  const monitors = allMonitors.slice(0, zones.length);

  const activeIdx = zones.findIndex(z => z.id === activeZoneId);
  const activeMonitor = activeIdx >= 0 ? monitors[activeIdx] : monitors[0];

  // Upload handler
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('Please select a valid video file.'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.filename) {
        const newId = `zone-${String.fromCharCode(97 + zones.length)}`;
        const newZone = {
          id: newId,
          name: `Zone ${String.fromCharCode(65 + zones.length)}`,
          video: data.filename,
          status: 'GREEN',
          area_m2: 100,
          capacity: 200,
        };
        setZones(prev => [...prev, newZone]);
        setActiveZoneId(newId);
        alert(`Video "${file.name}" uploaded → streaming as ${newZone.name}`);
      }
    } catch (err) {
      alert(err.name === 'AbortError' ? 'Upload timed out.' : `Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#deedd9] text-[#0a0f0a] font-mono text-[13px] uppercase overflow-hidden select-none font-extrabold">
      
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#b8ceb1] bg-[#cbe1c4]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-600"></div>
          <span className="text-black tracking-widest text-sm font-extrabold">CROWDLENS</span>
          <span className="text-[#0f2209]">OPERATOR CONSOLE v0.9</span>
        </div>
        <div className="flex items-center gap-4 text-[#0f2209]">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse"></div>
            <span>FEED {String(zones.length).padStart(2, '0')} LIVE</span>
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 bg-[#2d4a22] text-[#deedd9] px-3 py-1.5 rounded hover:bg-[#1a3314] transition-colors cursor-pointer disabled:opacity-50">
            {uploading ? (
              <><div className="w-3 h-3 border-2 border-[#deedd9] border-t-transparent rounded-full animate-spin"></div><span>UPLOADING...</span></>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>UPLOAD VIDEO</span></>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleUpload} className="hidden"/>
          <div className="text-[#b45309] font-extrabold">{currentTime} <span className="text-[#1a3314]">IST</span></div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden gap-3 p-3 pt-0">
        
        {/* LEFT: SCROLLABLE ZONE CARDS */}
        <aside className="w-[260px] flex flex-col bg-[#d1e2cb] rounded-2xl overflow-hidden flex-shrink-0">
          <div className="p-3 border-b border-[#b8ceb1] text-[#1a3314] flex justify-between items-center rounded-t-2xl bg-[#c2d9bb]">
            <span>ZONE CARDS</span>
            <span className="text-black font-extrabold">{zones.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {zones.map((zone, idx) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                monitor={monitors[idx]}
                isActive={activeZoneId === zone.id}
                onClick={() => setActiveZoneId(zone.id)}
                onDelete={(id) => {
                  const remaining = zones.filter(z => z.id !== id);
                  setZones(remaining);
                  if (activeZoneId === id) {
                    setActiveZoneId(remaining[0]?.id || null);
                  }
                }}
              />
            ))}
          </div>
        </aside>

        {/* CENTER + RIGHT: DETAIL VIEW */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#d6e8d0] rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#b8ceb1] bg-[#cbe1c4]">
            <div className="flex items-center gap-3">
              <span className="text-[#1a3314]">ZONE DETAIL</span>
              <span className="text-black font-extrabold">{activeZone?.name}</span>
            </div>
            <div className="flex gap-4">
              {['DENSITY', 'TURBULENCE', 'RISK'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`${activeTab === tab ? 'text-black border-b-2 border-black' : 'text-[#1a3314] hover:text-black'} pb-1 transition-colors font-extrabold`}>
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          {activeZone && activeMonitor && (
            <ZoneDetailPanel zone={activeZone} monitor={activeMonitor} activeTab={activeTab} />
          )}
        </div>
      </div>


    </div>
  );
}

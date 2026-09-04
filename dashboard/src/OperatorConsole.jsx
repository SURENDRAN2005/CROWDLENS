import React, { useState, useEffect, useRef } from 'react';
import { Camera, AlertTriangle, MapPin, Activity, ShieldAlert } from 'lucide-react';

const ZONES = [
  { id: 'zone-a', name: 'Zone A', desc: 'Bridge Approach N', video: 'crowd10.mp4', status: 'RED' },
  { id: 'zone-b', name: 'Zone B', desc: 'Central Deck', video: 'crowd5.mp4', status: 'BLACK' },
  { id: 'zone-c', name: 'Zone C', desc: 'North Exit Gate', video: 'crowd1.mp4', status: 'ORANGE' },
  { id: 'zone-d', name: 'Zone D', desc: 'Queue Terminal', video: 'crowd16.mp4', status: 'YELLOW' },
  { id: 'zone-e', name: 'Zone E', desc: 'South Landing', video: 'crowd2.mp4', status: 'GREEN' },
];

const COLORS = {
  RED: 'text-red-700 font-extrabold',
  BLACK: 'text-white bg-black px-2 py-0.5 rounded font-extrabold',
  ORANGE: 'text-orange-700 font-extrabold',
  YELLOW: 'text-yellow-700 font-extrabold',
  GREEN: 'text-green-700 font-extrabold'
};

function useZoneMonitor(zone) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    if (!zone) return;
    ws.current = new WebSocket('ws://localhost:8000/ws/analyze');
    
    ws.current.onopen = () => {
      setConnected(true);
      ws.current.send(JSON.stringify({ video_filename: zone.video }));
    };
    
    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'update') {
          setData(msg);
        }
      } catch (e) {
        console.error("Parse error", e);
      }
    };

    ws.current.onclose = () => setConnected(false);

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [zone]);

  return { data, connected };
}

export default function OperatorConsole() {
  const [activeZoneId, setActiveZoneId] = useState('zone-b');
  const [activeTab, setActiveTab] = useState('DENSITY');
  const [currentTime, setCurrentTime] = useState('');
  
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0').slice(0, 1));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const activeZone = ZONES.find(z => z.id === activeZoneId);
  const mosaicZones = ZONES.slice(0, 4);
  
  const m1 = useZoneMonitor(mosaicZones[0]);
  const m2 = useZoneMonitor(mosaicZones[1]);
  const m3 = useZoneMonitor(mosaicZones[2]);
  const m4 = useZoneMonitor(mosaicZones[3]);
  const monitors = [m1, m2, m3, m4];

  const activeMonitor = monitors.find((_, i) => mosaicZones[i].id === activeZoneId) || m2; 
  const amData = activeMonitor.data?.metrics || {};

  return (
    <div className="flex flex-col h-screen bg-[#deedd9] text-[#111827] font-mono text-[11px] uppercase overflow-hidden select-none font-bold">
      
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#b8ceb1] bg-[#cbe1c4]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-600"></div>
          <span className="text-black tracking-widest text-sm font-extrabold">CROWDLENS</span>
          <span className="text-[#2d4a22]">OPERATOR CONSOLE v0.9</span>
        </div>
        <div className="flex items-center gap-6 text-[#2d4a22]">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse"></div>
            <span>FEED 04 LIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600"></div>
            <span>LINK 12ms</span>
          </div>
          <div className="text-[#b45309] min-w-[80px] text-right font-extrabold">{currentTime} <span className="text-[#3f6333]">IST</span></div>
          <div>OPERATOR - R. DESHMUKH</div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL - ZONE RAIL */}
        <aside className="w-[240px] flex flex-col border-r border-[#b8ceb1] bg-[#cbe1c4]">
          <div className="p-4 border-b border-[#b8ceb1] text-[#3f6333]">ZONE RAIL</div>
          <div className="flex-1 overflow-y-auto pt-2">
            {ZONES.map(zone => (
              <div 
                key={zone.id}
                onClick={() => setActiveZoneId(zone.id)}
                className={`px-4 py-3 cursor-pointer flex justify-between items-start transition-colors ${activeZoneId === zone.id ? 'bg-[#b8ceb1] border-l-2 border-black' : 'hover:bg-[#c2d9bb] border-l-2 border-transparent'}`}
              >
                <div>
                  <div className="text-black font-extrabold mb-1">{zone.name}</div>
                  <div className="text-[#2d4a22] normal-case tracking-normal">{zone.desc}</div>
                </div>
                <div className={`font-extrabold ${COLORS[zone.status] || 'text-[#2d4a22]'} ${zone.status === 'BLACK' && activeZoneId !== zone.id ? 'bg-transparent text-black' : ''}`}>
                  {zone.status}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-[#b8ceb1]">
            <div className="text-[#3f6333] mb-2">EVENT ARCHETYPE</div>
            <div className="text-black text-sm mb-1 font-extrabold normal-case">
              Temple Festival <span className="text-green-700 font-mono text-[10px] ml-1 uppercase">conf 0.91</span>
            </div>
            <div className="text-[#2d4a22] normal-case">Dynamics · Aggressive</div>
          </div>
        </aside>

        {/* CENTER PANEL - CAMERA MOSAIC */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#dbe8d6]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#b8ceb1] bg-[#cbe1c4]">
            <span className="text-[#3f6333]">CAMERA MOSAIC</span>
            <div className="flex gap-4">
              {['DENSITY', 'TURBULENCE', 'RISK'].map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`${activeTab === tab ? 'text-black border-b-2 border-black' : 'text-[#3f6333] hover:text-black'} pb-1 transition-colors font-extrabold`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-[2px] bg-[#b8ceb1]">
            {monitors.map((m, idx) => {
              const zone = mosaicZones[idx];
              const src = activeTab === 'TURBULENCE' || activeTab === 'RISK' ? m.data?.frame_heatmap : m.data?.frame;
              const pressureText = m.data?.metrics?.tension > 5 ? 'pressure rising' : 'queue forming';
              
              return (
                <div key={idx} className="relative bg-black flex flex-col overflow-hidden group">
                  {/* Video Fill (Black background makes screens visible) */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    {src ? (
                      <img src={src} className="w-full h-full object-cover opacity-90" alt="feed"/>
                    ) : (
                      <div className="text-[#555]">CONNECTING...</div>
                    )}
                  </div>
                  
                  {/* Grid overlay for aesthetics */}
                  <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20% 20%', opacity: 1 }}></div>

                  {/* Badges (Light Theme) */}
                  <div className="absolute top-4 left-4 flex gap-2">
                    <div className="bg-[#deedd9] border border-[#b8ceb1] px-2 py-1 text-black font-extrabold">CAM 0{idx+1}</div>
                    <div className={`bg-[#deedd9] border border-[#b8ceb1] px-2 py-1 ${COLORS[zone.status]?.replace('bg-black', '') || 'text-black'} font-extrabold`}>{zone.name}</div>
                  </div>

                  {/* Bottom Stats */}
                  <div className="absolute bottom-4 left-4 flex gap-2 text-white bg-black/60 px-2 py-1 rounded">
                    <span>{m.data?.metrics?.density || '0.0'} ppm²</span>
                    <span>·</span>
                    <span className="normal-case font-bold">{pressureText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* RIGHT PANEL - METRICS ENGINE */}
        <aside className="w-[360px] flex flex-col border-l border-[#b8ceb1] bg-[#cbe1c4] overflow-y-auto">
          
          {/* SRI Section */}
          <div className="p-6 border-b border-[#b8ceb1]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#3f6333]">STAMPEDE RISK INDEX</span>
              <span className="text-[#3f6333] normal-case">90s horizon</span>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-6xl font-extrabold text-black">{Math.round(amData?.sri || 93)}</span>
              <span className="text-xl text-[#2d4a22] font-extrabold">/ {amData?.risk_band || 'BLACK'}</span>
            </div>
            
            <div className="text-black mb-1 normal-case tracking-normal">Critical in {amData?.forecast_seconds ? Math.round(amData.forecast_seconds/60) : '4'} min · {activeZone?.name}</div>
            <div className="text-[#3f6333] normal-case tracking-normal">Immediate evacuation · notify disaster response</div>
          </div>

          {/* Structural Section */}
          <div className="p-6 border-b border-[#b8ceb1]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#3f6333]">STRUCTURAL LOAD</span>
              <span className="text-orange-700 font-extrabold">{amData?.structural_load_pct || 99}%</span>
            </div>
            <div className="w-full h-2 bg-[#b8ceb1] mb-4 relative overflow-hidden rounded">
              <div className="absolute top-0 left-0 h-full bg-orange-600 transition-all duration-300" style={{ width: `${amData?.structural_load_pct || 99}%` }}></div>
            </div>
            <div className="flex justify-between text-[#2d4a22]">
              <span>5.7 kN/m² / 5.0</span>
              <span>DLF 1.62</span>
              <span className="text-orange-700 font-extrabold">RESONANCE</span>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="p-6 border-b border-[#b8ceb1]">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[#3f6333]">SRI TIMELINE</span>
              <span className="text-[#3f6333] normal-case">last 90s · forecast</span>
            </div>
            
            {/* Mock Bar Chart matching the visual */}
            <div className="flex items-end gap-1 h-16 mb-2">
              {[20, 25, 20, 30, 45, 50, 60, 75, 80, 95].map((val, i) => {
                const isRed = val >= 75;
                const isOrange = val >= 60 && !isRed;
                const isYellow = val >= 45 && !isOrange && !isRed;
                const isGreen = !isRed && !isYellow && !isOrange;
                let bg = 'bg-[#a1b89a]';
                if (isGreen) bg = 'bg-green-600';
                if (isYellow) bg = 'bg-yellow-500';
                if (isOrange) bg = 'bg-orange-500';
                if (isRed) bg = 'bg-red-600';
                return (
                  <div key={i} className={`flex-1 ${bg}`} style={{ height: `${val}%` }}></div>
                );
              })}
              {/* Forecast bars */}
              {[95, 95, 90, 80].map((val, i) => (
                <div key={`f-${i}`} className="flex-1 bg-transparent border-2 border-dashed border-[#8fa888]" style={{ height: `${val}%` }}></div>
              ))}
            </div>
            
            <div className="flex justify-between text-[#3f6333] text-[9px] normal-case font-bold">
              <span>-90s</span>
              <span>now</span>
              <span>+forecast</span>
            </div>
          </div>

          {/* Crowd State & Incident Log */}
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex items-center gap-4 mb-8">
              <span className="text-[#3f6333]">CROWD STATE</span>
              <span className="bg-red-100 text-red-700 border-2 border-red-200 px-2 py-0.5 rounded font-extrabold">{amData?.dynamics_state?.state || 'AGGRESSIVE'}</span>
              <span className="text-[#3f6333] normal-case">conf 0.77</span>
            </div>

            <div className="flex justify-between items-center mb-4">
              <span className="text-[#3f6333]">INCIDENT LOG</span>
              <span className="text-red-700 font-extrabold">3 ACTIVE</span>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 normal-case tracking-normal text-xs">
              <div className="border-l-4 border-red-600 pl-3">
                <div className="flex justify-between mb-1 uppercase tracking-widest text-[10px]">
                  <span className="text-red-700 font-extrabold">20:46:58</span>
                  <span className="text-red-700 font-extrabold">CRITICAL</span>
                </div>
                <div className="text-black font-extrabold mb-1">{activeZone?.name} · SRI crossed 76 · halt entry</div>
                <div className="text-[#2d4a22]">snap: density {amData?.density || 8.1} · pressure 0.92</div>
              </div>
              
              <div className="border-l-4 border-orange-500 pl-3">
                <div className="flex justify-between mb-1 uppercase tracking-widest text-[10px]">
                  <span className="text-orange-700 font-extrabold">20:46:41</span>
                  <span className="text-orange-700 font-extrabold">WARN</span>
                </div>
                <div className="text-black font-extrabold mb-1">Structural DLF 1.62 · resonance near</div>
                <div className="text-[#2d4a22]">snap: load {amData?.structural_load_pct || 84}% · freq 2.1Hz</div>
              </div>

              <div className="border-l-4 border-orange-500 pl-3">
                <div className="flex justify-between mb-1 uppercase tracking-widest text-[10px]">
                  <span className="text-orange-700 font-extrabold">20:46:20</span>
                  <span className="text-orange-700 font-extrabold">WARN</span>
                </div>
                <div className="text-black font-extrabold mb-1">Zone C · gate flow -34%/min</div>
                <div className="text-[#2d4a22]">snap: bottleneck 210 p/min</div>
              </div>
              
              <div className="border-l-4 border-yellow-500 pl-3">
                <div className="flex justify-between mb-1 uppercase tracking-widest text-[10px]">
                  <span className="text-yellow-700 font-extrabold">20:45:52</span>
                  <span className="text-yellow-700 font-extrabold">ADVISORY</span>
                </div>
                <div className="text-black font-extrabold mb-1">Zone D · queue disorder rising</div>
                <div className="text-[#2d4a22]">snap: disorder 0.41</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="h-8 border-t border-[#b8ceb1] bg-[#deedd9] flex items-center px-4 text-[#3f6333] gap-4 normal-case tracking-normal">
        <span className="text-green-700 uppercase font-extrabold tracking-widest">AGGREGATE ONLY</span>
        <span className="font-bold">No facial recognition · ephemeral IDs only · Zone history active · Consent signage active at all gates</span>
      </footer>
    </div>
  );
}

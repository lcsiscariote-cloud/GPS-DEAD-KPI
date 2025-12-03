
import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import { Maximize2, Minimize2, Info, ArrowRight, Clock, AlertTriangle, Zap, Signal, ZapOff } from 'lucide-react';
import { EnrichedChangeLog } from '../types'; // Changed import
import L from 'leaflet';

interface MapBoardProps {
  logs: EnrichedChangeLog[];
}

// Helper to generate stable colors from strings
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};

// Create custom icons dynamically
const createIcon = (color: string, shape: 'circle' | 'triangle', isRisk: boolean = false) => {
  const fillColor = isRisk ? '#ef4444' : color; // Red if risk
  const strokeColor = isRisk ? '#b91c1c' : 'white';

  const svg = shape === 'circle' 
    ? `<svg viewBox="0 0 24 24" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"><path d="M12 2L22 22H2L12 2Z"/></svg>`;

  return L.divIcon({
    className: 'custom-map-icon',
    html: `<div class="w-6 h-6 drop-shadow-md transition-transform hover:scale-110">${svg}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

const BoundsFitter: React.FC<{ markers: [number, number][] }> = ({ markers }) => {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m[0], m[1]]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markers, map]);
  return null;
};

const MapBoard: React.FC<MapBoardProps> = ({ logs }) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [domReady, setDomReady] = React.useState(false);

  useEffect(() => {
    setDomReady(true);
  }, []);

  const validLogs = useMemo(() => logs.filter(
    (log) => 
      (log.last?.lat && log.last?.lon) ||
      (log.first_after?.lat && log.first_after?.lon)
  ), [logs]);

  const allCoordinates: [number, number][] = [];
  validLogs.forEach(log => {
    if (log.last?.lat && log.last?.lon) allCoordinates.push([log.last.lat, log.last.lon]);
    if (log.first_after?.lat && log.first_after?.lon) allCoordinates.push([log.first_after.lat, log.first_after.lon]);
  });

  const centerLat = allCoordinates.length > 0 ? allCoordinates[0][0] : 21.14;
  const centerLon = allCoordinates.length > 0 ? allCoordinates[0][1] : -101.68;

  const mapContent = (
    <div className={`relative bg-slate-100 border border-slate-300 overflow-hidden shadow-inner ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'h-[600px] rounded-xl'}`}>
       <div className="absolute top-4 right-4 z-[1000]">
        <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-white p-2 rounded-md shadow-md hover:bg-slate-50 border border-slate-200"
        >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="absolute bottom-6 left-6 z-[1000] bg-white/95 backdrop-blur p-4 rounded-lg shadow-xl border border-slate-200 text-xs text-slate-700 pointer-events-none min-w-[200px]">
        <h4 className="font-bold mb-3 flex items-center gap-2 text-slate-900"><Info className="w-3 h-3"/> Map Forensics</h4>
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-slate-800 rounded-full border-2 border-white shadow-sm flex items-center justify-center"></div>
                <span>Last Signal (Old)</span>
            </div>
             <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-red-600 rounded-full border-2 border-white shadow-sm flex items-center justify-center"></div>
                <span>Power Cut / High Risk</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[14px] border-b-slate-800 drop-shadow-sm"></div>
                <span>First Signal (New)</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-blue-500/20 rounded-full border border-blue-500"></div>
                <span>GPS Precision (HDOP)</span>
            </div>
        </div>
      </div>

      <MapContainer
        key={isFullscreen ? 'full' : 'embed'}
        center={[centerLat, centerLon]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsFitter markers={allCoordinates} />

        {validLogs.map((log, idx) => {
            const color = stringToColor(log.unidad);
            const hasLast = log.last?.lat && log.last?.lon;
            const hasFirst = log.first_after?.lat && log.first_after?.lon;

            return (
                <React.Fragment key={`${log.unit_id}-${idx}`}>
                    {hasLast && hasFirst && (
                         <Polyline 
                            positions={[
                                [log.last!.lat!, log.last!.lon!],
                                [log.first_after!.lat!, log.first_after!.lon!]
                            ]}
                            pathOptions={{ color: log.isPowerCut ? 'red' : color, dashArray: '6, 8', weight: 2, opacity: 0.6 }}
                        />
                    )}

                    {hasLast && (
                        <>
                            {/* HDOP Circle - Multiplied by 10 for visibility radius, real logic would vary */}
                            {log.last?.hdop && (
                                <Circle 
                                    center={[log.last!.lat!, log.last!.lon!]}
                                    radius={Math.max(log.last.hdop * 10, 20)} 
                                    pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1, stroke: false }}
                                />
                            )}
                            
                            <Marker 
                                position={[log.last!.lat!, log.last!.lon!]} 
                                icon={createIcon(color, 'circle', log.isPowerCut)}
                            >
                                <Popup>
                                    <div className="p-1 min-w-[220px]">
                                        <div className="font-bold text-slate-900 border-b pb-1 mb-2 flex justify-between items-center">
                                            {log.unidad}
                                            {log.isPowerCut && <span className="bg-red-600 text-white text-[10px] px-1 rounded uppercase">Power Cut</span>}
                                        </div>
                                        <div className="text-xs space-y-1.5">
                                            <div className="flex justify-between"><span className="text-slate-500">Event:</span> <span className="font-semibold text-red-600">Last Signal</span></div>
                                            <div className="flex justify-between"><span className="text-slate-500">Time:</span> <span className="font-mono">{new Date(log.last!.time || log.cambio_time).toLocaleString()}</span></div>
                                            
                                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                                                <div className="flex items-center gap-1" title="External Voltage">
                                                    {log.isPowerCut ? <ZapOff className="w-3 h-3 text-red-500"/> : <Zap className="w-3 h-3 text-slate-400"/>}
                                                    <span className={`font-mono ${log.isPowerCut ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                                        {log.last?.pwr_ext ?? '-'}V
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 justify-end" title="GSM Signal">
                                                    <Signal className="w-3 h-3 text-slate-400"/>
                                                    <span className="font-mono text-slate-600">{log.last?.gsm ?? '-'}</span>
                                                </div>
                                            </div>
                                            {log.last?.hdop && (
                                                <div className="text-[10px] text-slate-400 text-center">GPS Precision (HDOP): {log.last.hdop}</div>
                                            )}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        </>
                    )}

                    {hasFirst && (
                        <Marker position={[log.first_after!.lat!, log.first_after!.lon!]} icon={createIcon(color, 'triangle')}>
                            <Popup>
                                <div className="p-1 min-w-[200px]">
                                    <div className="font-bold text-slate-900 border-b pb-1 mb-2">{log.unidad}</div>
                                    <div className="text-xs space-y-1">
                                        <div className="flex justify-between"><span className="text-slate-500">Event:</span> <span className="font-semibold text-emerald-600">First Signal</span></div>
                                        <div className="flex justify-between"><span className="text-slate-500">Time:</span> <span className="font-mono">{new Date(log.first_after!.time || log.cambio_time).toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-500">New IMEI:</span> <span className="font-mono">{log.imei_nuevo}</span></div>
                                        
                                        {log.isSimChange && (
                                            <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-center font-bold mt-1 border border-indigo-100">
                                                SIM Card Changed
                                            </div>
                                        )}
                                        
                                        {log.downtime_seconds && (
                                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-slate-700 font-bold">
                                                <Clock className="w-3 h-3"/> Gap: {log.downtime_seconds}s
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )}
                </React.Fragment>
            );
        })}

      </MapContainer>
    </div>
  );

  if (!isFullscreen) return mapContent;
  
  return (
    <>
        <div className="h-[600px] w-full bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400">
            <span className="flex items-center gap-2"><Maximize2 className="w-5 h-5"/> Viewing in Fullscreen...</span>
        </div>
        {domReady && createPortal(mapContent, document.body)}
    </>
  );
};

export default MapBoard;

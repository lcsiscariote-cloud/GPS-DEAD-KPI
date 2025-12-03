

import React, { useState, useMemo, useRef } from 'react';
import { Upload, Database, Map as MapIcon, RefreshCw, AlertCircle, Calendar, Filter, Clock, FileText, PieChart, Layers, PlusCircle, Zap, ZapOff } from 'lucide-react';
import { ImeiLog, EnrichedChangeLog, UnitHistory, FilterState } from './types';
import MapBoard from './components/MapBoard';
import AnalysisView from './components/StatsTable';
import MetricsView from './components/MetricsView';

function App() {
  const [rawData, setRawData] = useState<ImeiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View State
  const [activeTab, setActiveTab] = useState<'changes' | 'lifespan' | 'map' | 'metrics'>('changes');

  // Filter State
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    dateFrom: '',
    dateTo: '',
    minDowntime: '',
    maxDowntime: '',
    onlyWithDowntime: false,
    hideInstallations: false,
    onlyMultipleChanges: false,
    onlyPowerCuts: false,
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target?.result as string;
        processNdjson(text);
    };
    reader.readAsText(file);
  };

  const processNdjson = (text: string) => {
    const lines = text.split('\n');
    const logs: ImeiLog[] = [];
    let errors = 0;

    lines.forEach(line => {
        if (!line.trim()) return;
        try {
            const json = JSON.parse(line);
            if (json.status === 'ok') {
                logs.push(json as ImeiLog);
            } else {
                errors++;
            }
        } catch (e) {
            errors++;
        }
    });

    setRawData(logs);
    setErrorCount(errors);
    setLoading(false);
  };

  // ---------------------------------------------------------------------------
  // PROCESS DATA
  // ---------------------------------------------------------------------------

  // Pre-calculate lifespan from full history before filtering
  const lifespanMap = useMemo(() => {
    const map = new Map<string, number>();
    const tempGroups = new Map<string, ImeiLog[]>();

    // 1. Group by unit
    rawData.forEach(log => {
        if (!tempGroups.has(log.unidad)) tempGroups.set(log.unidad, []);
        tempGroups.get(log.unidad)!.push(log);
    });

    // 2. Calculate deltas in each group
    tempGroups.forEach((logs) => {
        // Sort chronologically ascending
        logs.sort((a, b) => a.cambio_ts - b.cambio_ts);

        for (let i = 1; i < logs.length; i++) {
            const current = logs[i];
            const prev = logs[i - 1];
            
            // The time the previous IMEI lived is the diff between current change and previous change
            const lifespan = current.cambio_ts - prev.cambio_ts;
            
            // Use a composite key to retrieve this data later
            const key = `${current.unidad}-${current.cambio_ts}-${current.imei_nuevo}`;
            map.set(key, lifespan);
        }
    });

    return map;
  }, [rawData]);
  
  // Calculate unit counts for the "Multiple Changes" filter
  const unitChangeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rawData.forEach(log => {
        counts.set(log.unidad, (counts.get(log.unidad) || 0) + 1);
    });
    return counts;
  }, [rawData]);

  const filteredLogs = useMemo(() => {
    return rawData.filter(log => {
        // Search Filter
        if (filters.search && !log.unidad.toLowerCase().includes(filters.search.toLowerCase())) return false;
        
        // Hide New Installations (Empty old IMEI)
        if (filters.hideInstallations && (!log.imei_ant || log.imei_ant.trim() === '')) return false;

        // Date Range
        if (filters.dateFrom && new Date(log.cambio_time) < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && new Date(log.cambio_time) > new Date(filters.dateTo)) return false;
        
        // Multiple Changes Only
        if (filters.onlyMultipleChanges) {
            const count = unitChangeCounts.get(log.unidad) || 0;
            if (count <= 1) return false;
        }

        // Power Cut Filter logic (replicated from enrichment logic roughly for speed, or strict check)
        if (filters.onlyPowerCuts) {
             const pwr = log.last?.pwr_ext;
             const isCut = (typeof pwr === 'number' && pwr < 5); // Threshold: 5V
             if (!isCut) return false;
        }
        
        // Downtime Logic
        const effectiveDowntime = log.downtime_seconds ?? (
            (log.first_after?.ts && log.last?.ts) ? (log.first_after.ts - log.last.ts) : null
        );

        if (filters.onlyWithDowntime && effectiveDowntime === null) return false;
        if (filters.minDowntime !== '' && (effectiveDowntime || 0) < Number(filters.minDowntime)) return false;
        if (filters.maxDowntime !== '' && (effectiveDowntime || 0) > Number(filters.maxDowntime)) return false;

        return true;
    });
  }, [rawData, filters, unitChangeCounts]);

  // Derived: Enriched Change Logs with Forensic Data
  const enrichedChanges: EnrichedChangeLog[] = useMemo(() => {
    return filteredLogs.map((log, idx) => {
        const getEffectiveIccid = (loc: any) => {
            if (!loc) return '';
            if (loc.iccid && loc.iccid !== '00000000000') return loc.iccid;
            // Reconstruction logic: combine io_11 + io_14 if present
            if (loc.io_11 && loc.io_14) return `${loc.io_11}${loc.io_14}`;
            return '';
        };

        const oldIccid = getEffectiveIccid(log.last);
        const newIccid = getEffectiveIccid(log.first_after);

        // FORENSIC LOGIC
        // 1. Power Cut: If external power was < 5V just before the swap.
        // Handling potential mV (e.g., 4000) or V (4.0). Threshold: 5.
        const pwr = log.last?.pwr_ext;
        const isPowerCut = (typeof pwr === 'number' && pwr >= 0 && pwr < 5);

        // 2. SIM Change: If we have both ICCIDs and they differ
        const isSimChange = (!!oldIccid && !!newIccid && oldIccid !== newIccid);

        // 3. Low Signal / Jamming: If GSM < 2 (on scale 0-5) or < 6 (CSQ scale 0-31)
        // Adjust threshold based on your typical data range. Assuming 0-31 CSQ here.
        const gsm = log.last?.gsm;
        const isLowSignal = (typeof gsm === 'number' && gsm < 10 && gsm > 0); 

        // 4. GPS Precision
        const hdop = log.last?.hdop;
        const hasGpsPrecisionIssue = (typeof hdop === 'number' && hdop > 2.5);

        // Downtime Calculation
        let finalDowntime = log.downtime_seconds;
        if (finalDowntime === null && log.last?.ts && log.first_after?.ts) {
            finalDowntime = log.first_after.ts - log.last.ts;
        }

        // Risk Level Calculation
        let risk: 'safe' | 'warning' | 'critical' | 'unknown' = 'unknown';
        if (isPowerCut) risk = 'critical'; // Sabotage indicator
        else if (finalDowntime !== null) {
            if (finalDowntime < 300) risk = 'safe';
            else if (finalDowntime < 3600) risk = 'warning';
            else risk = 'critical';
        }

        const isInstallation = !log.imei_ant || log.imei_ant.trim() === '';

        // Retrieve Calculated Lifespan
        const uniqueKey = `${log.unidad}-${log.cambio_ts}-${log.imei_nuevo}`;
        const previousLifespan = lifespanMap.get(uniqueKey) || null;

        return {
            ...log,
            downtime_seconds: finalDowntime,
            id: `${log.unit_id}-${idx}`,
            derivedIccid: newIccid || oldIccid,
            previousIccid: oldIccid,
            riskLevel: risk,
            isInstallation,
            isPowerCut,
            isSimChange,
            isLowSignal,
            hasGpsPrecisionIssue,
            previousImeiLifespanSeconds: previousLifespan
        };
    }).sort((a, b) => b.cambio_ts - a.cambio_ts);
  }, [filteredLogs, lifespanMap]);

  // Derived: Lifespan Intervals
  const unitHistories: UnitHistory[] = useMemo(() => {
      const grouped = new Map<string, ImeiLog[]>();
      
      const sourceData = filters.search 
        ? rawData.filter(l => l.unidad.toLowerCase().includes(filters.search.toLowerCase()))
        : rawData;

      sourceData.forEach(log => {
          if (!grouped.has(log.unidad)) grouped.set(log.unidad, []);
          grouped.get(log.unidad)!.push(log);
      });

      const histories: UnitHistory[] = [];
      const nowTs = Math.floor(Date.now() / 1000);

      grouped.forEach((logs, unidad) => {
          const sorted = logs.sort((a, b) => a.cambio_ts - b.cambio_ts);
          const historyIntervals: any[] = [];
          
          for (let i = 0; i < sorted.length; i++) {
              const currentChange = sorted[i];
              const nextChange = sorted[i+1];
              const startTs = currentChange.cambio_ts;
              
              if (nextChange) {
                  historyIntervals.push({
                      imei: currentChange.imei_nuevo,
                      start_ts: startTs,
                      start_date: currentChange.cambio_time,
                      end_ts: nextChange.cambio_ts,
                      end_date: nextChange.cambio_time,
                      duration_seconds: nextChange.cambio_ts - startTs
                  });
              }
          }

          const lastEvent = sorted[sorted.length - 1];
          const currentDuration = nowTs - lastEvent.cambio_ts;
          
          // Calculate "Lemon Index" (Changes per year approx)
          const firstSeen = sorted[0].cambio_ts;
          const totalTime = nowTs - firstSeen;
          const years = Math.max(totalTime / (365 * 24 * 3600), 0.1); // Avoid div by zero
          const changesPerYear = sorted.length / years;

          histories.push({
              unidad,
              current_imei: lastEvent.imei_nuevo,
              current_start_date: lastEvent.cambio_time,
              current_duration_seconds: currentDuration,
              history: historyIntervals.reverse(),
              failure_rate_index: changesPerYear
          });
      });
      
      return histories.sort((a, b) => b.current_duration_seconds - a.current_duration_seconds);
  }, [rawData, filters.search]); 

  const allLifespanIntervals = useMemo(() => {
      return unitHistories.flatMap(h => h.history);
  }, [unitHistories]);

  // Statistics
  const uniqueUnits = new Set(filteredLogs.map(l => l.unidad)).size;
  const avgDowntime = filteredLogs.length ? Math.floor(filteredLogs.reduce((acc, curr) => acc + (curr.downtime_seconds || 0), 0) / filteredLogs.length) : 0;
  const powerCutCount = enrichedChanges.filter(l => l.isPowerCut).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top Navigation Bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-200">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-tight">IMEI Analyst <span className="text-indigo-600">Forensics</span></h1>
                        <p className="text-xs text-slate-500">Sabotage Detection & Lifecycle</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden xl:flex items-center gap-6 mr-4 text-sm text-slate-600">
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Total Units</span>
                            <span className="font-mono font-bold text-slate-900">{uniqueUnits}</span>
                         </div>
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Suspected Sabotage</span>
                            <span className={`font-mono font-bold flex items-center gap-1 ${powerCutCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                {powerCutCount > 0 && <ZapOff className="w-3 h-3" />}
                                {powerCutCount}
                            </span>
                         </div>
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Events</span>
                            <span className="font-mono font-bold text-slate-900">{filteredLogs.length}</span>
                         </div>
                    </div>

                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                        Load Stream
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".ndjson,.json,.txt"
                        className="hidden" 
                    />
                </div>
            </div>
            
            {/* Filters Toolbar */}
            <div className="border-t border-slate-100 bg-slate-50/50 backdrop-blur px-4 py-3">
                <div className="max-w-[1920px] mx-auto flex flex-wrap items-center gap-3">
                     <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                        <Filter className="w-4 h-4" /> 
                     </div>
                     <input 
                        type="text" 
                        placeholder="Search Unit ID..." 
                        className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-40"
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
                     />
                     
                     <div className="h-6 w-px bg-slate-300 mx-1"></div>

                     <label className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer transition-colors border select-none ${filters.hideInstallations ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input 
                            type="checkbox" 
                            checked={filters.hideInstallations}
                            onChange={(e) => setFilters(prev => ({...prev, hideInstallations: e.target.checked}))}
                            className="hidden" 
                        />
                        Hide Installs
                     </label>

                     <label className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer transition-colors border select-none ${filters.onlyMultipleChanges ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input 
                            type="checkbox" 
                            checked={filters.onlyMultipleChanges}
                            onChange={(e) => setFilters(prev => ({...prev, onlyMultipleChanges: e.target.checked}))}
                            className="hidden" 
                        />
                        Multi-Change
                     </label>
                     
                     <label className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer transition-colors border select-none ${filters.onlyPowerCuts ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input 
                            type="checkbox" 
                            checked={filters.onlyPowerCuts}
                            onChange={(e) => setFilters(prev => ({...prev, onlyPowerCuts: e.target.checked}))}
                            className="hidden" 
                        />
                        <ZapOff className="w-3 h-3" />
                        Power Cuts
                     </label>

                     <div className="h-6 w-px bg-slate-300 mx-1"></div>

                     <div className="flex items-center gap-2 bg-white border border-slate-300 rounded px-2 py-1.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <input 
                            type="datetime-local" 
                            className="text-xs text-slate-600 outline-none bg-transparent"
                            value={filters.dateFrom}
                            onChange={(e) => setFilters(prev => ({...prev, dateFrom: e.target.value}))}
                        />
                        <span className="text-slate-300">-</span>
                        <input 
                            type="datetime-local" 
                            className="text-xs text-slate-600 outline-none bg-transparent"
                            value={filters.dateTo}
                            onChange={(e) => setFilters(prev => ({...prev, dateTo: e.target.value}))}
                        />
                     </div>
                </div>
            </div>

            {/* View Tabs */}
            <div className="bg-white px-4 border-b border-slate-200">
                <div className="max-w-[1920px] mx-auto flex items-center gap-6">
                    <button 
                        onClick={() => setActiveTab('changes')}
                        className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'changes' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <FileText className="w-4 h-4" /> Audit Log
                    </button>
                    <button 
                        onClick={() => setActiveTab('lifespan')}
                        className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'lifespan' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Clock className="w-4 h-4" /> Lifecycle
                    </button>
                    <button 
                        onClick={() => setActiveTab('map')}
                        className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'map' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <MapIcon className="w-4 h-4" /> Forensic Map
                    </button>
                    <button 
                        onClick={() => setActiveTab('metrics')}
                        className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'metrics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <PieChart className="w-4 h-4" /> Risk Metrics
                    </button>
                </div>
            </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-[1920px] mx-auto w-full p-6">
            {errorCount > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-lg flex items-center gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                        <span className="font-bold">Parsing Errors Detected:</span> {errorCount} lines were invalid and skipped.
                    </div>
                </div>
            )}

            {filteredLogs.length === 0 && !loading ? (
                <div className="text-center py-20">
                    <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700">No Forensic Data Loaded</h3>
                    <p className="text-slate-500 mt-2">Upload an NDJSON file to start analyzing sabotage and swap patterns.</p>
                </div>
            ) : (
                <>
                    {activeTab === 'changes' && (
                        <AnalysisView 
                            changeLogs={enrichedChanges} 
                            lifespanIntervals={allLifespanIntervals} 
                            viewMode="changes" 
                        />
                    )}
                    
                    {activeTab === 'lifespan' && (
                        <AnalysisView 
                            changeLogs={enrichedChanges} 
                            lifespanIntervals={allLifespanIntervals} 
                            viewMode="lifespan" 
                        />
                    )}

                    {activeTab === 'map' && (
                        <MapBoard logs={enrichedChanges} />
                    )}

                    {activeTab === 'metrics' && (
                        <MetricsView logs={enrichedChanges} unitHistories={unitHistories} />
                    )}
                </>
            )}
        </main>
    </div>
  );
}

export default App;
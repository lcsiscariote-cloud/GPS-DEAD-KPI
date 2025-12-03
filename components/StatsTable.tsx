

import React, { useState, useMemo } from 'react';
import { EnrichedChangeLog, LifespanInterval } from '../types';
import { Clock, AlertTriangle, CheckCircle, ArrowRight, Download, ChevronLeft, ChevronRight, Activity, Calendar, Layers, List as ListIcon, Zap, ZapOff, Signal, SignalLow, Smartphone, Cpu, ChevronDown, ChevronUp, History } from 'lucide-react';

interface AnalysisViewProps {
  changeLogs: EnrichedChangeLog[];
  lifespanIntervals: LifespanInterval[];
  viewMode: 'changes' | 'lifespan';
}

const formatDuration = (seconds: number | null, compact = false) => {
    if (seconds === null || seconds === undefined) return 'N/A';
    if (seconds === 0) return '0s';
    
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (compact) {
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m ${seconds % 60}s`;
    }
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
};

const formatLifespan = (seconds: number | null) => {
    if (!seconds) return null;
    const days = Math.floor(seconds / (3600 * 24));
    if (days > 365) return `${(days / 365).toFixed(1)}y`;
    if (days > 0) return `${days}d`;
    const hours = Math.floor(seconds / 3600);
    return `${hours}h`;
};

// --- Forensic Badges ---

const PowerBadge: React.FC<{ log: EnrichedChangeLog }> = ({ log }) => {
    const pwr = log.last?.pwr_ext;
    
    if (log.isPowerCut) {
         return (
             <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100" title={`Voltage Drop detected: ${pwr}V before swap`}>
                 <ZapOff className="w-3 h-3" />
                 <span className="text-xs font-bold">Cut ({pwr}V)</span>
             </div>
         );
    }
    
    if (typeof pwr === 'number') {
        return (
            <div className="flex items-center gap-1.5 text-slate-500" title={`Stable Voltage: ${pwr}V`}>
                <Zap className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-mono">{pwr}V</span>
            </div>
        );
    }
    return <span className="text-slate-300">-</span>;
};

const SimBadge: React.FC<{ log: EnrichedChangeLog }> = ({ log }) => {
    if (log.isSimChange) {
        return (
            <div className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100" title="SIM Card ICCID Changed">
                <Cpu className="w-3 h-3" />
                <span className="text-xs font-bold">New SIM</span>
            </div>
        );
    }
    if (log.derivedIccid) {
         return (
            <div className="flex items-center gap-1.5 text-slate-500" title="Hardware swap only (Same SIM)">
                <Smartphone className="w-3 h-3 text-slate-400" />
                <span className="text-xs">Same SIM</span>
            </div>
        );
    }
    return null;
};

const SignalBadge: React.FC<{ log: EnrichedChangeLog }> = ({ log }) => {
    const gsm = log.last?.gsm;
    if (log.isLowSignal) {
         return (
            <div className="flex items-center gap-1 text-amber-600" title={`Weak Signal detected (${gsm}). Possible Jamming or Deadzone.`}>
                <SignalLow className="w-3 h-3" />
                <span className="text-xs font-mono">{gsm}</span>
            </div>
        );
    }
    if (typeof gsm === 'number') {
         return (
            <div className="flex items-center gap-1 text-slate-400" title={`GSM Signal: ${gsm}`}>
                <Signal className="w-3 h-3" />
                <span className="text-xs font-mono">{gsm}</span>
            </div>
        );
    }
    return null;
};


const RiskBadge: React.FC<{ log: EnrichedChangeLog }> = ({ log }) => {
    const seconds = log.downtime_seconds;
    
    let tooltip = "Downtime";
    if (log.last?.time && log.first_after?.time) {
        tooltip = `Signal Lost: ${new Date(log.last.time).toLocaleString()}\nSignal Regained: ${new Date(log.first_after.time).toLocaleString()}\nDuration: ${seconds}s`;
    }

    if (seconds === null) return <span className="text-slate-300 text-xs italic">Unknown Gap</span>;
    if (seconds > 3600) return <span title={tooltip} className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1 w-fit cursor-help border border-red-200"><AlertTriangle className="w-3 h-3"/> {formatDuration(seconds, true)}</span>;
    if (seconds > 300) return <span title={tooltip} className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1 w-fit cursor-help border border-amber-200"><Clock className="w-3 h-3"/> {formatDuration(seconds, true)}</span>;
    return <span title={tooltip} className="bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-1 rounded flex items-center gap-1 w-fit cursor-help border border-emerald-100"><CheckCircle className="w-3 h-3"/> {formatDuration(seconds, true)}</span>;
};

// --- Sub-Components ---

const GroupedUnitRow: React.FC<{ unidad: string, logs: EnrichedChangeLog[] }> = ({ unidad, logs }) => {
    const [expanded, setExpanded] = useState(false);

    // Group Statistics
    const totalChanges = logs.length;
    const powerCuts = logs.filter(l => l.isPowerCut).length;
    const simSwaps = logs.filter(l => l.isSimChange).length;
    const lastEvent = logs[0]; // Assumes sorted desc
    
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
            <div 
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${expanded ? 'bg-slate-50' : 'bg-white'}`}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-700">
                        <History className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-lg">{unidad}</h3>
                            <span className="text-xs font-mono text-slate-400">#{lastEvent.unit_id}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs mt-1">
                            <span className="text-slate-500">{totalChanges} Change Events</span>
                            {powerCuts > 0 && (
                                <span className="flex items-center gap-1 text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                    <ZapOff className="w-3 h-3" /> {powerCuts} Power Cuts
                                </span>
                            )}
                            {simSwaps > 0 && (
                                <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    <Cpu className="w-3 h-3" /> {simSwaps} SIM Swaps
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-slate-400 uppercase font-bold">Latest Event</div>
                        <div className="text-sm font-mono text-slate-700">{new Date(lastEvent.cambio_time).toLocaleDateString()}</div>
                    </div>
                    {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-2">Date</th>
                                    <th className="px-4 py-2">Transition</th>
                                    <th className="px-4 py-2">Downtime</th>
                                    <th className="px-4 py-2">Analysis</th>
                                    <th className="px-4 py-2 text-right">Telemetry</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <div className="font-mono text-xs">{new Date(log.cambio_time).toLocaleString()}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col items-end">
                                                     <span className="font-mono text-xs text-slate-400 strike-through">{log.imei_ant ? log.imei_ant.slice(-6) : 'NEW'}</span>
                                                     {log.previousImeiLifespanSeconds && (
                                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded">
                                                            {formatLifespan(log.previousImeiLifespanSeconds)}
                                                        </span>
                                                    )}
                                                </div>
                                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                                <span className="font-mono text-xs font-bold text-slate-700">{log.imei_nuevo.slice(-6)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3"><RiskBadge log={log} /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <PowerBadge log={log} />
                                                <SimBadge log={log} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <SignalBadge log={log} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const ChangesTable: React.FC<{ data: EnrichedChangeLog[] }> = ({ data }) => {
    const [page, setPage] = useState(1);
    const [isGrouped, setIsGrouped] = useState(false); // Toggle State
    const pageSize = 15;

    // Grouping Logic
    const groupedData = useMemo(() => {
        if (!isGrouped) return null;
        const groups: Record<string, EnrichedChangeLog[]> = {};
        data.forEach(log => {
            if (!groups[log.unidad]) groups[log.unidad] = [];
            groups[log.unidad].push(log);
        });
        // Sort units by latest change date desc
        return Object.entries(groups).sort((a, b) => {
            return b[1][0].cambio_ts - a[1][0].cambio_ts;
        });
    }, [data, isGrouped]);

    const totalPages = isGrouped 
        ? Math.ceil((groupedData?.length || 0) / pageSize)
        : Math.ceil(data.length / pageSize);
        
    const currentData = isGrouped 
        ? groupedData?.slice((page - 1) * pageSize, page * pageSize)
        : data.slice((page - 1) * pageSize, page * pageSize);

    const downloadCsv = () => {
        const headers = ['Unidad', 'ID', 'Date', 'Old IMEI', 'New IMEI', 'Previous Lifespan (days)', 'Downtime (s)', 'Is Power Cut', 'Is Sim Swap', 'Voltage', 'Signal', 'ICCID'];
        const rows = data.map(d => [
            d.unidad, d.unit_id, d.cambio_time, d.imei_ant, d.imei_nuevo, 
            d.previousImeiLifespanSeconds ? (d.previousImeiLifespanSeconds / 86400).toFixed(2) : '',
            d.downtime_seconds || '', 
            d.isPowerCut ? 'YES' : 'NO', d.isSimChange ? 'YES' : 'NO', d.last?.pwr_ext || '', d.last?.gsm || '', d.derivedIccid
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "imei_audit_forensics.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-3 rounded-lg border border-slate-200 gap-4 shadow-sm">
                <div className="flex items-center gap-4">
                     <span className="text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                        {data.length} Records Found
                     </span>
                     
                     <div className="h-6 w-px bg-slate-300"></div>

                     {/* View Toggle */}
                     <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button 
                            onClick={() => { setIsGrouped(false); setPage(1); }}
                            className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-md transition-all ${!isGrouped ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <ListIcon className="w-3 h-3" /> List
                        </button>
                        <button 
                            onClick={() => { setIsGrouped(true); setPage(1); }}
                            className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-md transition-all ${isGrouped ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Layers className="w-3 h-3" /> Grouped
                        </button>
                     </div>
                </div>

                <button onClick={downloadCsv} className="flex items-center gap-2 text-sm text-indigo-600 font-bold hover:bg-indigo-50 px-3 py-1.5 rounded transition-colors border border-transparent hover:border-indigo-100">
                    <Download className="w-4 h-4" /> Export Audit CSV
                </button>
            </div>
            
            {/* Content Area */}
            {isGrouped ? (
                // --- GROUPED VIEW ---
                <div className="space-y-4">
                    {groupedData && groupedData.length > 0 ? (
                        (currentData as [string, EnrichedChangeLog[]][]).map(([unidad, logs]) => (
                            <GroupedUnitRow key={unidad} unidad={unidad} logs={logs} />
                        ))
                    ) : (
                        <div className="text-center py-10 text-slate-400">No records match filter.</div>
                    )}
                </div>
            ) : (
                // --- LIST VIEW (Legacy) ---
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Unit / ID</th>
                                    <th className="px-4 py-3">Event Time</th>
                                    <th className="px-4 py-3 text-center">IMEI Swap</th>
                                    <th className="px-4 py-3">Gap (Downtime)</th>
                                    <th className="px-4 py-3">Audit Flags</th>
                                    <th className="px-4 py-3 text-right">Telemetry (Last)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(currentData as EnrichedChangeLog[]).map((log) => (
                                    <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${log.isPowerCut ? 'bg-red-50/30' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800">{log.unidad}</div>
                                            <div className="text-xs text-slate-400 font-mono">#{log.unit_id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-slate-700 font-medium">{new Date(log.cambio_time).toLocaleDateString()}</div>
                                            <div className="text-xs text-slate-500 font-mono">{new Date(log.cambio_time).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3 justify-center">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-xs text-slate-500 strike-through">{log.imei_ant ? log.imei_ant.slice(-6) : 'NEW'}</span>
                                                    {log.previousImeiLifespanSeconds && (
                                                        <div className="flex items-center gap-1 mt-1" title={`Old IMEI was active for ${formatDuration(log.previousImeiLifespanSeconds)}`}>
                                                            <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-1.5 rounded-full whitespace-nowrap">
                                                                {formatLifespan(log.previousImeiLifespanSeconds)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                                <div className="flex flex-col items-start">
                                                    <span className="font-mono text-xs text-slate-900 font-bold">{log.imei_nuevo.slice(-6)}</span>
                                                    {/* Spacer to align arrow */}
                                                    {log.previousImeiLifespanSeconds && <div className="h-4"></div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <RiskBadge log={log} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <PowerBadge log={log} />
                                                <SimBadge log={log} />
                                                {log.hasGpsPrecisionIssue && (
                                                    <span title="Poor GPS Precision (HDOP > 2.5)" className="text-xs text-amber-600 border border-amber-200 bg-amber-50 px-1 rounded font-bold">HDOP</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-3">
                                                <SignalBadge log={log} />
                                                {log.derivedIccid && (
                                                    <div className="text-xs font-mono text-slate-400" title={`ICCID: ${log.derivedIccid}`}>
                                                        SIM...{log.derivedIccid.slice(-4)}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-white rounded-lg shadow-sm">
                    <button 
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="p-2 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-slate-600 font-medium">Page {page} of {totalPages}</span>
                    <button 
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="p-2 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

const LifespanTable: React.FC<{ data: LifespanInterval[] }> = ({ data }) => {
    // Sort by Duration Desc
    const sortedData = useMemo(() => [...data].sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0)), [data]);
    
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedData.slice(0, 20).map((interval, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-400 transition-all">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-slate-800">{interval.unidad}</h3>
                                <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">
                                    {interval.imei.slice(-6)}
                                </span>
                            </div>
                            <div className="space-y-2 mt-3">
                                <div className="flex items-center gap-2 text-xs">
                                    <Calendar className="w-3 h-3 text-emerald-500" />
                                    <span className="text-slate-600">Start: {new Date(interval.start_date).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <Activity className="w-3 h-3 text-red-400" />
                                    <span className="text-slate-600">
                                        End: {interval.end_date ? new Date(interval.end_date).toLocaleDateString() : 'Active Now'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100">
                             <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400 uppercase font-bold">Lifespan</span>
                                <span className={`text-sm font-bold font-mono ${!interval.duration_seconds ? 'text-indigo-600' : 'text-slate-700'}`}>
                                    {interval.duration_seconds 
                                        ? formatDuration(interval.duration_seconds, true) 
                                        : 'Ongoing'
                                    }
                                </span>
                             </div>
                             {/* Mini Bar */}
                             <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full ${!interval.duration_seconds ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'}`} 
                                    style={{ width: '100%' }} // Just visual filler
                                ></div>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AnalysisView: React.FC<AnalysisViewProps> = ({ changeLogs, lifespanIntervals, viewMode }) => {
  return (
    <div className="min-h-[500px]">
        {viewMode === 'changes' ? (
            <ChangesTable data={changeLogs} />
        ) : (
            <LifespanTable data={lifespanIntervals} />
        )}
    </div>
  );
};

export default AnalysisView;
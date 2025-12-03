
import React, { useMemo } from 'react';
import { EnrichedChangeLog, UnitHistory } from '../types';
import { BarChart2, MapPin, Clock, AlertTriangle, Activity, TrendingUp, Hash, ZapOff, RefreshCcw } from 'lucide-react';

interface MetricsViewProps {
  logs: EnrichedChangeLog[];
  unitHistories?: UnitHistory[];
}

const formatDuration = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
};

const MetricsView: React.FC<MetricsViewProps> = ({ logs, unitHistories = [] }) => {
    const stats = useMemo(() => {
        const withDowntime = logs.filter(l => l.downtime_seconds !== null && l.downtime_seconds > 0);
        const downtimes = withDowntime.map(l => l.downtime_seconds!).sort((a, b) => a - b);
        
        // Percentiles
        const p50 = downtimes[Math.floor(downtimes.length * 0.5)] || 0;
        const p90 = downtimes[Math.floor(downtimes.length * 0.9)] || 0;

        // Buckets
        const buckets = {
            under5m: 0,
            under1h: 0,
            under24h: 0,
            over24h: 0
        };

        withDowntime.forEach(l => {
            const s = l.downtime_seconds!;
            if (s < 300) buckets.under5m++;
            else if (s < 3600) buckets.under1h++;
            else if (s < 86400) buckets.under24h++;
            else buckets.over24h++;
        });

        // Top Units by Total Downtime
        const unitDowntimeMap = new Map<string, number>();
        withDowntime.forEach(l => {
            const current = unitDowntimeMap.get(l.unidad) || 0;
            unitDowntimeMap.set(l.unidad, current + l.downtime_seconds!);
        });

        const topUnits = Array.from(unitDowntimeMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Power Cut Stats
        const powerCuts = logs.filter(l => l.isPowerCut).length;
        const simChanges = logs.filter(l => l.isSimChange).length;
        
        // Lemon Analysis (Units with high failure rate index)
        const lemons = unitHistories
            .sort((a, b) => b.failure_rate_index - a.failure_rate_index)
            .slice(0, 5);

        return {
            totalEvents: logs.length,
            eventsWithDowntime: withDowntime.length,
            p50, p90,
            buckets,
            topUnits,
            powerCuts,
            simChanges,
            lemons
        };
    }, [logs, unitHistories]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
                    <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium">
                        <ZapOff className="w-4 h-4 text-red-500" /> Sabotage Suspicion
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{stats.powerCuts}</div>
                    <div className="text-xs text-slate-400 mt-1">Events with Power Cut before swap</div>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-500">
                    <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium">
                        <RefreshCcw className="w-4 h-4 text-indigo-500" /> Full SIM Swaps
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{stats.simChanges}</div>
                    <div className="text-xs text-slate-400 mt-1">Both IMEI and ICCID changed</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium">
                        <Activity className="w-4 h-4 text-blue-500" /> Median Gap
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{formatDuration(stats.p50)}</div>
                    <div className="text-xs text-slate-400 mt-1">Typical installation downtime</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> P90 Gap
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{formatDuration(stats.p90)}</div>
                    <div className="text-xs text-slate-400 mt-1">10% of swaps take longer than this</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Failure Analysis / Lemons */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" /> "Lemon" Units (High Failure Rate)
                    </h3>
                    <div className="overflow-hidden rounded-lg border border-slate-100">
                         <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-2 text-left">Unit</th>
                                    <th className="px-4 py-2 text-right">Changes/Year</th>
                                    <th className="px-4 py-2 text-right">History</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats.lemons.map((unit) => (
                                    <tr key={unit.unidad} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-800">{unit.unidad}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                                            {unit.failure_rate_index.toFixed(1)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-slate-400">
                                            {unit.history.length + 1} devices used
                                        </td>
                                    </tr>
                                ))}
                                {stats.lemons.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-400">Not enough data for trend analysis</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-slate-400 mt-3 bg-slate-50 p-2 rounded">
                        * Estimated annual replacement rate based on observed history. High values indicate electrical issues or recurrent sabotage.
                    </p>
                </div>

                {/* Downtime Distribution */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-slate-500" /> Downtime Distribution
                    </h3>
                    <div className="space-y-4">
                        {[
                            { label: '< 5 Minutes', count: stats.buckets.under5m, color: 'bg-emerald-500' },
                            { label: '5 - 60 Minutes', count: stats.buckets.under1h, color: 'bg-blue-500' },
                            { label: '1 - 24 Hours', count: stats.buckets.under24h, color: 'bg-amber-500' },
                            { label: '> 24 Hours', count: stats.buckets.over24h, color: 'bg-red-500' }
                        ].map((item, idx) => {
                            const max = Math.max(stats.buckets.under5m, stats.buckets.under1h, stats.buckets.under24h, stats.buckets.over24h);
                            const percent = max > 0 ? (item.count / max) * 100 : 0;
                            
                            return (
                                <div key={idx}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-600 font-medium">{item.label}</span>
                                        <span className="text-slate-900 font-bold">{item.count}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${item.color}`} 
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MetricsView;

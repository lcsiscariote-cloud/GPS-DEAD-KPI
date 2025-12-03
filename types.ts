

export interface LocationData {
    ts?: number;
    time?: string;
    lat?: number;
    lon?: number;
    iccid?: string | null;
    io_11?: number | null; // ICCID fragment 1
    io_14?: number | null; // ICCID fragment 2
    pwr_ext?: number | null; // External Voltage
    pwr_int?: number | null; // Internal Battery
    gsm?: number | null; // GSM Signal Strength (0-5 or CSQ)
    hdop?: number | null; // GPS Precision
  }
  
  export interface LastLocation extends LocationData {}
  export interface FirstLocation extends LocationData {}
  
  export interface ImeiLog {
    unidad: string;
    unit_id: number;
    imei_ant: string;
    imei_nuevo: string;
    cambio_ts: number;
    cambio_time: string;
    last?: LastLocation;
    first_after?: FirstLocation;
    downtime_seconds: number | null;
    status: string;
    error?: string;
  }

  // Used for the Changes List Tab
  export interface EnrichedChangeLog extends ImeiLog {
    id: string; // Unique key
    derivedIccid: string;
    previousIccid: string; // From 'last' message
    
    // Risk Analysis
    riskLevel: 'critical' | 'warning' | 'safe' | 'unknown';
    
    // Forensic Flags
    isInstallation: boolean;
    isPowerCut: boolean; // pwr_ext dropped significantly
    isSimChange: boolean; // ICCID changed between last and first_after
    isLowSignal: boolean; // Low GSM before swap (jamming potential)
    hasGpsPrecisionIssue: boolean; // High HDOP

    // New field: Lifespan of the previous IMEI before this change event
    previousImeiLifespanSeconds: number | null;
  }

  // Used for the Lifespan Tab
  export interface UnitHistory {
    unidad: string;
    current_imei: string;
    current_start_date: string;
    current_duration_seconds: number;
    history: LifespanInterval[];
    failure_rate_index: number; // Normalized frequency of changes
  }

  export interface LifespanInterval {
    imei: string;
    start_ts: number;
    start_date: string;
    end_ts: number;
    end_date: string;
    duration_seconds: number;
  }
  
  export interface FilterState {
    search: string;
    dateFrom: string;
    dateTo: string;
    minDowntime: number | '';
    maxDowntime: number | '';
    onlyWithDowntime: boolean;
    hideInstallations: boolean;
    onlyMultipleChanges: boolean;
    onlyPowerCuts: boolean; // New filter
  }
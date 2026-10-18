export type Role = "operator" | "driver" | "passenger";

export interface Pt {
  x: number;
  y: number;
}

export interface Telemetry {
  bus_id: string;
  location: Pt;
  speed: number; // cm/s
  crash: boolean;
  obstacle: boolean;
  obstacle_cm?: number;
  motor_enabled: boolean;
  force_stopped: boolean;
  ts: number;
}

export interface BusMeta {
  name: string;
  plate: string;
  routeId: string;
  seats: number;
  color: string;
  driverUid?: string;
  driverName?: string;
}

export interface Bus {
  id: string;
  meta?: BusMeta;
  telemetry?: Telemetry;
  online: boolean;
}

export interface Route {
  /** RTDB key — set client-side when reading */
  id: string;
  name: string;
  tolerance: number;
  closed?: boolean;
  points: Pt[];
  stops?: (Pt & { name: string })[];
}

export interface Alert {
  busId: string;
  type: "crash" | "deviation";
  msg: string;
  ts: number;
  active: boolean;
}

export interface Geofence {
  /** RTDB push key — set client-side when reading */
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  busId?: string;
  ts?: number;
}

export interface AppSettings {
  /** "arena" = custom 2D map (default); "google" = OpenStreetMap (real GPS: x=lng, y=lat) */
  mapMode?: "arena" | "google";
  /** optional key override; falls back to NEXT_PUBLIC_GOOGLE_MAPS_KEY */
  gmapsKey?: string;
}

export interface BusEvent {
  type: string;
  value?: number;
  ts: number;
}

export interface SeatInfo {
  seat: string;
  taken: boolean;
  by?: string;
}

export interface Rating {
  stars: number;
  uid?: string;
  name?: string;
  comment?: string;
  ts: number;
}

export interface Warning {
  id: string;
  msg: string;
  ts?: number;
  by?: string;
}

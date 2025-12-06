// Core asset directories
export const DATA_ROOT = "./src/8155_shp";
export const BOUNDARY_ROOT = "./src/boundaries";

// GeoJSON sources
export const POINTS_URL = `${DATA_ROOT}/8155.json`;
export const COUNTRY_BOUNDARY_URL = `${BOUNDARY_ROOT}/admin0.json`;
export const PROVINCE_BOUNDARY_URL = `${BOUNDARY_ROOT}/admin1.json`;
export const SESSION_SUMMARY_URL = "./src/monitoring_summary.json";

// Point animation timings + sizing
export const APPEAR_DURATION = 6000; // legacy fallback (unused for batches)
export const FADE_IN_DURATION = 1500; // ms for each point's fade-in
export const POINT_RADIUS_METERS = 4500;
export const FLICKER_INTENSITY = 0.9;
export const MIN_FLICKER = 0.05;
export const BATCH_REVEAL_DURATION = 4200; // ms to reveal all batches sequentially
export const FLICKER_RAMP_DURATION = 1000; // ms to ramp into flicker after reveal
export const SESSION_REVEAL_INTERVAL = 1200; // ms between monitoring highlights
export const SESSION_POINT_RADIUS = 15000; // meters for monitoring highlight base size
export const SESSION_POINT_COLOR_FADE = 0.08;
export const SESSION_AUTO_FLY_ZOOM = 4; // zoom level for automatic animation (when new session appears)
export const SESSION_CLICK_FLY_ZOOM = 11; // zoom level for click-triggered animation
export const SESSION_FLY_TO_DURATION = 1200; // ms for fly-to animation
// Ordered batch names for purple gradient
export const BATCH_LEVELS = [
  { name: "Batch 1", label: "Batch 1 – 2012", year: "2012", key: "一" },
  { name: "Batch 2", label: "Batch 2 – 2013", year: "2013", key: "二" },
  { name: "Batch 3", label: "Batch 3 – 2014", year: "2014", key: "三" },
  { name: "Batch 4", label: "Batch 4 – 2015", year: "2015", key: "四" },
  { name: "Batch 5", label: "Batch 5 – 2017", year: "2017", key: "五" },
  { name: "Batch 6", label: "Batch 6 – 2019", year: "2019", key: "六" },
];

// Legend circle sizes (px)
export const LEGEND_RADIUS_MAX = 16;
export const LEGEND_RADIUS_MIN = 8;

// Mapbox 配置
export const MAPBOX_STYLE_URL = "mapbox://styles/tianmingliu/cmiuak4tz003j01qv2n6576de";

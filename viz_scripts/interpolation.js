// viz_scripts/interpolation.js

/**
 * 将时间对象（ISO 字符串、数字、[Y,M,D,h,m,s]）转为 Unix 秒
 */
export function toUnixSeconds(timeObj) {
  if (timeObj == null) return NaN;

  // 数字：可能是秒，也可能是毫秒
  if (typeof timeObj === "number") {
    if (timeObj > 2000000000) return timeObj / 1000; // ms → s
    return timeObj;
  }

  // ISO 字符串
  if (typeof timeObj === "string") {
    const t = Date.parse(timeObj);
    return Number.isFinite(t) ? t / 1000 : NaN;
  }

  // [Y, M, D, h, m, s]
  if (Array.isArray(timeObj)) {
    const [y, m, d, h = 0, mi = 0, s = 0] = timeObj;
    const t = new Date(y, (m ?? 1) - 1, d ?? 1, h, mi, s).getTime();
    return Number.isFinite(t) ? t / 1000 : NaN;
  }

  return NaN;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * trajectoryData: [{timestamp, latitude, longitude, altitude}]
 * sensorData: [{timestamp/local_time + sensor_fields}]
 *
 * 输出：每条数据附带 latitude, longitude, altitude（插值后）
 */
export function interpolateSensorPositions(trajectoryData, sensorData, opts = {}) {
  const { altitudeMedianSmooth = false, outlierAltJump = 0 } = opts;

  if (!Array.isArray(trajectoryData) || !trajectoryData.length ||
    !Array.isArray(sensorData) || !sensorData.length) {
    console.warn("❗ Empty trajectory or sensor dataset");
    return [];
  }

  // Normalize trajectory
  const traj = trajectoryData.map(p => ({
    t: toUnixSeconds(p.timestamp_ms),
    lat: Number(p.latitude),
    lon: Number(p.longitude),
    alt: Number(p.altitude ?? 0),
  }))
    .filter(p =>
      Number.isFinite(p.t) &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Number.isFinite(p.alt)
    )
    .sort((a, b) => a.t - b.t);

  if (!traj.length) {
    console.warn("❗ No valid trajectory points after filtering");
    return [];
  }

  const trajTimes = traj.map(p => p.t);
  const trajLat = traj.map(p => p.lat);
  const trajLon = traj.map(p => p.lon);
  const trajAlt = traj.map(p => p.alt);

  const tMin = trajTimes[0];
  const tMax = trajTimes[trajTimes.length - 1];

  const raw = [];

  for (const s of sensorData) {
    const t = toUnixSeconds(s.timestamp);

    if (!Number.isFinite(t)) continue;
    if (t < tMin || t > tMax) continue;

    let idx = trajTimes.findIndex(tt => tt > t);
    if (idx <= 0) idx = 1;
    if (idx >= trajTimes.length) idx = trajTimes.length - 1;

    const t0 = trajTimes[idx - 1];
    const t1 = trajTimes[idx];
    const r = Math.min(Math.max((t - t0) / (t1 - t0 || 1), 0), 1);

    const lat = lerp(trajLat[idx - 1], trajLat[idx], r);
    const lon = lerp(trajLon[idx - 1], trajLon[idx], r);
    const alt = lerp(trajAlt[idx - 1], trajAlt[idx], r);

    raw.push({
      ...s,
      latitude: lat,
      longitude: lon,
      altitude: alt,
      _t: t
    });
  }

  if (!raw.length) {
    console.warn("❗ No interpolated sensor points produced");
    return [];
  }

  if (altitudeMedianSmooth) {
    const med = median(raw.map(p => p.altitude));
    for (const p of raw) {
      p.altitude = 0.7 * p.altitude + 0.3 * med;
    }
  }

  if (outlierAltJump > 0) {
    const filtered = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const prev = filtered[filtered.length - 1];
      const cur = raw[i];
      if (Math.abs(cur.altitude - prev.altitude) <= outlierAltJump) {
        filtered.push(cur);
      }
    }
    console.log(`Interpolated ${filtered.length} sensor points. (filtered from ${raw.length})`);
    return filtered;
  }

  console.log(`Interpolated ${raw.length} sensor points.`);
  return raw;
}

import {
  POINT_RADIUS_METERS,
  FLICKER_INTENSITY,
  MIN_FLICKER,
  FADE_IN_DURATION,
  BATCH_REVEAL_DURATION,
  FLICKER_RAMP_DURATION,
  BATCH_LEVELS,
  SESSION_POINT_RADIUS,
} from "./constants.js";

const COLOR_STOPS = [
  [51, 15, 69],       // #1b062aff
  [115, 3, 192],    // #7303c0
  [236, 56, 188],   // #ec38bc
  [253, 239, 249],  // #fdeff9
];
export const MAX_RADIUS_MULTIPLIER = 1.65;
export const MIN_RADIUS_MULTIPLIER = 0.65;

export const getBatchRatio = (batchValue) => {
  const idx = BATCH_LEVELS.findIndex((b) => b.key === batchValue || b.name === batchValue);
  if (idx === -1 || BATCH_LEVELS.length === 1) {
    return 0;
  }
  return idx / (BATCH_LEVELS.length - 1);
};

export const getBatchColor = (ratio) => {
  if (COLOR_STOPS.length === 1) {
    return COLOR_STOPS[0];
  }
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const segment = 1 / (COLOR_STOPS.length - 1);
  const index = Math.min(
    COLOR_STOPS.length - 2,
    Math.floor(clamped / segment)
  );
  const localT = (clamped - index * segment) / segment;
  const start = COLOR_STOPS[index];
  const end = COLOR_STOPS[index + 1];
  return start.map((value, i) =>
    Math.round(value + (end[i] - value) * localT)
  );
};

export const getRadiusFromBatch = (ratio) => {
  const scale =
    MAX_RADIUS_MULTIPLIER -
    (MAX_RADIUS_MULTIPLIER - MIN_RADIUS_MULTIPLIER) * ratio;
  return POINT_RADIUS_METERS * scale;
};

export const computeOpacity = (properties, elapsed, appearEnd) => {
  const sinceStart = elapsed - properties.startDelay;
  if (sinceStart <= 0) {
    return 0;
  }
  if (sinceStart < FADE_IN_DURATION) {
    return sinceStart / FADE_IN_DURATION;
  }
  const steadyValue = 1;
  const flickerTime = sinceStart / 1000;
  const seed = properties.flickerSeed || 0;
  const flickerSpeed = properties.flickerSpeed || 1;
  const waveA =
    Math.sin(flickerTime * (flickerSpeed * 1.2 + 0.4) + properties.flickerPhase) *
    0.75;
  const waveB = Math.sin(flickerTime * 3.8 + seed * 0.02) * 0.2;
  const waveC = Math.sin(flickerTime * 6.2 + seed * 0.01) * 0.05;
  const noise = (waveA + waveB + waveC + 1) / 2;
  const flickerValue =
    MIN_FLICKER + noise * (properties.flickerIntensity || FLICKER_INTENSITY);

  if (!appearEnd) {
    return flickerValue;
  }

  if (elapsed < appearEnd) {
    return steadyValue;
  }

  if (elapsed < appearEnd + FLICKER_RAMP_DURATION) {
    const t = (elapsed - appearEnd) / FLICKER_RAMP_DURATION;
    return steadyValue * (1 - t) + flickerValue * t;
  }

  return flickerValue;
};

export const preparePoints = (geojson) => {
  const chunk = BATCH_REVEAL_DURATION / Math.max(BATCH_LEVELS.length, 1);
  return geojson.features.map((feature) => {
    const batchRatio = getBatchRatio(feature?.properties?.Batch);
    const batchIndex = BATCH_LEVELS.findIndex(
      (b) => b.key === feature?.properties?.Batch || b.name === feature?.properties?.Batch
    );
    const delayIndex = batchIndex >= 0 ? batchIndex : 0;
    const startDelay = chunk * delayIndex;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        startDelay,
        flickerSpeed: 0.6 + Math.random() * 1.8,
        flickerPhase: Math.random() * Math.PI * 2,
        flickerIntensity: 0.6 + Math.random() * 0.4,
        flickerSeed: Math.random() * 1000,
        batchRatio,
        pointRadius: getRadiusFromBatch(batchRatio),
      },
    };
  });
};

const blendTowards = (color, factor, baseline = 30) =>
  Math.round(color * factor + baseline * (1 - factor));

// 计算基于缩放级别的半径缩放因子
const getZoomScale = (currentZoom, baseZoom = 4.24) => {
  // 缩放因子：当放大时减小点的大小
  return Math.pow(2, baseZoom - currentZoom);
};

export const createPointLayer = (data, elapsed, appearEnd, colorFade = 1, currentZoom = 4.24) =>
  new deck.ScatterplotLayer({
    id: "points",
    data,
    getPosition: (d) => d.geometry.coordinates,
    radiusUnits: "meters",
    getRadius: (d) => {
      const baseRadius = d.properties?.pointRadius || POINT_RADIUS_METERS;
      return baseRadius * getZoomScale(currentZoom);
    },
    stroked: false,
    pickable: false,
    parameters: {
      depthTest: false,
    },
    getFillColor: (d) => {
      const alpha = computeOpacity(d.properties, elapsed, appearEnd);
      const ratio = d.properties?.batchRatio ?? 0;
      const [r, g, b] = getBatchColor(ratio);
      const fade = Math.max(0, Math.min(colorFade, 1));
      const fadedR = blendTowards(r, fade);
      const fadedG = blendTowards(g, fade);
      const fadedB = blendTowards(b, fade);
      return [fadedR, fadedG, fadedB, Math.round(alpha * 255)];
    },
    updateTriggers: {
      getFillColor: [elapsed, colorFade],
      getRadius: [currentZoom],
    },
  });

export const createPointHaloLayer = (
  data,
  elapsed,
  appearEnd,
  colorFade = 1,
  currentZoom = 4.24
) =>
  new deck.ScatterplotLayer({
    id: "point-halo",
    data,
    getPosition: (d) => d.geometry.coordinates,
    radiusUnits: "meters",
    getRadius: (d) => {
      const baseRadius = (d.properties?.pointRadius || POINT_RADIUS_METERS) * 1.35;
      return baseRadius * getZoomScale(currentZoom);
    },
    stroked: false,
    pickable: false,
    parameters: {
      depthTest: false,
    },
    getFillColor: (d) => {
      const baseAlpha = computeOpacity(d.properties, elapsed, appearEnd);
      const haloAlpha = Math.max(30, Math.round(baseAlpha * 120));
      const ratio = d.properties?.batchRatio ?? 0;
      const [r, g, b] = getBatchColor(ratio);
      const fade = Math.max(0, Math.min(colorFade, 1));
      const fadedR = blendTowards(r, fade);
      const fadedG = blendTowards(g, fade);
      const fadedB = blendTowards(b, fade);
      return [fadedR, fadedG, fadedB, haloAlpha];
    },
    updateTriggers: {
      getFillColor: [elapsed, colorFade],
      getRadius: [currentZoom],
    },
  });

// DEPRECATED: 边界图层现在由 Mapbox Tileset 渲染
// 保留注释以供参考原始样式配置：
// admin0 (国家边界): fill rgb(5,5,5), stroke rgb(90,90,90) opacity 0.78, width 0.25px
// admin1 (省级边界): stroke rgb(100,100,100) opacity 0.78, width 0.35px

export const createSessionHighlightLayer = (data, activeOrder, hoverId, currentZoom = 4.24) =>
  new deck.ScatterplotLayer({
    id: "session-highlights",
    data,
    radiusUnits: "meters",
    getPosition: (d) => d.coordinates,
    getRadius: (d) => {
      const base = SESSION_POINT_RADIUS;
      let multiplier;
      if (hoverId && d.id === hoverId) {
        multiplier = 2.5;
      } else {
        multiplier = d.order === activeOrder ? 2.2 : 1.3;
      }
      return base * multiplier * getZoomScale(currentZoom);
    },
    stroked: true,
    filled: true,
    getFillColor: (d) => {
      if (hoverId && d.id === hoverId) {
        return [236, 56, 188, 150];
      }
      const [r, g, b] = d.order === activeOrder ? COLOR_STOPS[1] : COLOR_STOPS[1];
      return [r, g, b, d.order === activeOrder ? 130 : 130];
    },
    getLineColor: (d) => {
      const [r, g, b] = COLOR_STOPS[3];
      if (hoverId && d.id === hoverId) {
        return [236, 56, 188, 255];
      }
      return [r, g, b, d.order === activeOrder ? 160 : 120];
    },
    lineWidthUnits: "pixels",
    getLineWidth: (d) =>
      hoverId && d.id === hoverId ? 0.8 : d.order === activeOrder ? 1.2 : 0.8,
    lineWidthMinPixels: 0.6,
    pickable: false,
    parameters: {
      depthTest: false,
    },
    updateTriggers: {
      getFillColor: [activeOrder, data?.length || 0, hoverId],
      getRadius: [activeOrder, data?.length || 0, hoverId, currentZoom],
      getLineWidth: [activeOrder, data?.length || 0, hoverId],
      getLineColor: [activeOrder, data?.length || 0, hoverId],
    },
    transitions: null,
  });

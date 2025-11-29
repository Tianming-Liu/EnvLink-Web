import { fetchJSON, flattenCoords } from "./utils.js";
import {
  POINTS_URL,
  COUNTRY_BOUNDARY_URL,
  PROVINCE_BOUNDARY_URL,
  BATCH_REVEAL_DURATION,
  FADE_IN_DURATION,
  BATCH_LEVELS,
  SESSION_SUMMARY_URL,
  SESSION_REVEAL_INTERVAL,
  SESSION_POINT_COLOR_FADE,
} from "./constants.js";
import {
  preparePoints,
  createPointLayer,
  createPointHaloLayer,
  createCountryLayer,
  createProvinceLayer,
  createSessionHighlightLayer,
} from "./mapLayers.js";
import { setupStoryTimeline } from "./story.js";
import { buildBatchLegend, setLegendActiveBatch } from "./legend.js";
import { createSessionTimeline } from "./timeline.js";
import { buildSessionEntries, createSessionOverlay } from "./sessionOverlay.js";

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");

const hideStatus = () => {
  if (!statusEl) {
    return;
  }
  statusEl.classList.add("hidden");
  setTimeout(() => statusEl.remove(), 500);
};

const showError = (message) => {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.remove("hidden");
  }
};

const getBounds = (geojson) => {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const push = ([lng, lat]) => {
    bounds[0] = Math.min(bounds[0], lng);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng);
    bounds[3] = Math.max(bounds[3], lat);
  };

  if (geojson.type === "FeatureCollection") {
    geojson.features.forEach((feature) => flattenCoords(feature.geometry, push));
  } else if (geojson.type === "Feature") {
    flattenCoords(geojson.geometry, push);
  } else {
    flattenCoords(geojson, push);
  }
  return bounds;
};

const buildViewState = (bounds) => {
  const viewport = new deck.WebMercatorViewport({
    width: appEl.clientWidth || window.innerWidth || 1280,
    height: appEl.clientHeight || window.innerHeight || 720,
  });
  const { longitude, latitude, zoom } = viewport.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 40 }
  );
  const fixedZoom = Math.min(zoom, 12);
  return {
    longitude,
    latitude,
    zoom: fixedZoom,
    minZoom: fixedZoom,
    maxZoom: fixedZoom,
    pitch: 0,
    bearing: 0,
  };
};

export const initApp = async () => {
  try {
    const [pointGeojson, countryBoundaries, provinceBoundaries, summaryData] = await Promise.all([
      fetchJSON(POINTS_URL),
      fetchJSON(COUNTRY_BOUNDARY_URL),
      fetchJSON(PROVINCE_BOUNDARY_URL),
      fetchJSON(SESSION_SUMMARY_URL),
    ]);
    const processedPoints = preparePoints(pointGeojson);
    const appearEnd = BATCH_REVEAL_DURATION + FADE_IN_DURATION;
    const batchChunk = BATCH_REVEAL_DURATION / Math.max(BATCH_LEVELS.length, 1);
    let lastLegendBatch = -1;
    const initialViewState = buildViewState(getBounds(pointGeojson));
    const sessionEntries = buildSessionEntries(summaryData);
    const sessionOverlay = createSessionOverlay();
    const sessionTimeline = createSessionTimeline();
    let sessionAnimationStarted = false;
    let sessionAnimationStartTs = 0;
    let sessionRenderActive = false;

    const deckgl = new deck.DeckGL({
      container: appEl,
      controller: false,
      initialViewState,
      parameters: {
        clearColor: [0, 0, 0, 0],
      },
      layers: [],
    });

    const countryLayer = createCountryLayer(countryBoundaries);
    const provinceLayer = createProvinceLayer(provinceBoundaries);
    hideStatus();

    const storyTimeline = setupStoryTimeline();
    storyTimeline.initStory();
    storyTimeline.revealStory();
    const legend = document.getElementById("batchLegend");
    if (legend) {
      legend.classList.add("is-ready");
    }
    buildBatchLegend();
    sessionTimeline.render(sessionEntries, 0);
    let lastOverlayCount = 0;
    let lastTimelineCount = 0;
    window.addEventListener("envlink:session-start", () => {
      if (!sessionAnimationStarted) {
        sessionAnimationStarted = true;
        sessionAnimationStartTs = performance.now();
      }
    });
    window.addEventListener("envlink:session-visibility", (event) => {
      sessionRenderActive = Boolean(event?.detail?.visible);
      if (!sessionRenderActive) {
        sessionOverlay.hide();
      }
    });
    let hoveredSessionId = null;
    window.addEventListener("envlink:hover-session", (event) => {
      hoveredSessionId = event?.detail?.id || null;
      sessionOverlay.setHover(hoveredSessionId);
      sessionTimeline.setHover(hoveredSessionId);
    });

    const startTs = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTs;
      let activeBatch = BATCH_LEVELS.length - 1;
      if (elapsed < BATCH_REVEAL_DURATION) {
        activeBatch = Math.min(
          BATCH_LEVELS.length - 1,
          Math.floor(elapsed / (batchChunk || 1))
        );
      }
      if (activeBatch !== lastLegendBatch) {
        setLegendActiveBatch(activeBatch);
        lastLegendBatch = activeBatch;
      }
      let sessionVisibleCount = 0;
      if (sessionAnimationStarted && sessionEntries.length) {
        const sessionElapsed = performance.now() - sessionAnimationStartTs;
        sessionVisibleCount = Math.min(
          sessionEntries.length,
          Math.floor(sessionElapsed / SESSION_REVEAL_INTERVAL) + 1
        );
      }

      const shouldFadePoints =
        sessionRenderActive && sessionVisibleCount > 0
          ? SESSION_POINT_COLOR_FADE
          : 1;

      const pointLayer = createPointLayer(
        processedPoints,
        elapsed,
        appearEnd,
        shouldFadePoints
      );
      const haloLayer = createPointHaloLayer(
        processedPoints,
        elapsed,
        appearEnd,
        shouldFadePoints
      );
      const layers = [countryLayer, provinceLayer, haloLayer, pointLayer];

      if (sessionRenderActive && sessionVisibleCount > 0) {
        const visibleSessions = sessionEntries.slice(0, sessionVisibleCount);
        const currentEntry = visibleSessions[visibleSessions.length - 1];
        const sessionLayer = createSessionHighlightLayer(
          visibleSessions,
          currentEntry.order,
          hoveredSessionId
        );
        if (sessionVisibleCount !== lastOverlayCount) {
          sessionOverlay.render(visibleSessions);
          lastOverlayCount = sessionVisibleCount;
        }
        if (sessionVisibleCount !== lastTimelineCount) {
          sessionTimeline.render(sessionEntries, sessionVisibleCount);
          lastTimelineCount = sessionVisibleCount;
        }
        layers.push(sessionLayer);
      } else {
        if (lastOverlayCount !== 0) {
          sessionOverlay.hide();
          lastOverlayCount = 0;
        }
        if (lastTimelineCount !== 0) {
          sessionTimeline.render(sessionEntries, 0);
          lastTimelineCount = 0;
        }
        hoveredSessionId = null;
      }

      deckgl.setProps({
        layers,
      });
      requestAnimationFrame(animate);
    };
    animate();
  } catch (error) {
    console.error(error);
    showError(error.message || "加载数据失败");
  }
};

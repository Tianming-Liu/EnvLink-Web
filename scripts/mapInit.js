import { fetchJSON, flattenCoords } from "./utils.js";
import {
  POINTS_URL,
  BATCH_REVEAL_DURATION,
  FADE_IN_DURATION,
  BATCH_LEVELS,
  SESSION_SUMMARY_URL,
  SESSION_REVEAL_INTERVAL,
  SESSION_POINT_COLOR_FADE,
  SESSION_AUTO_FLY_ZOOM,
  SESSION_CLICK_FLY_ZOOM,
  SESSION_FLY_TO_DURATION,
  MAPBOX_STYLE_URL,
} from "./constants.js";
import {
  initMapboxBase,
  enableMapInteraction,
  disableMapInteraction,
} from "./mapboxConfig.js";
import {
  preparePoints,
  createPointLayer,
  createPointHaloLayer,
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
  statusEl.remove(); // 立即移除，确保容器干净
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
    // 验证 Mapbox 支持
    if (!window.mapboxgl) {
      showError("地图库加载失败");
      return;
    }

    if (!mapboxgl.supported()) {
      showError("您的浏览器不支持 WebGL，请更新浏览器");
      return;
    }

    // 只加载 deck.gl 需要的数据，边界数据由 Mapbox Tileset 提供
    const [pointGeojson, summaryData] = await Promise.all([
      fetchJSON(POINTS_URL),
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

    // 初始化 Mapbox 底图前先清理容器
    hideStatus();

    // 初始化 Mapbox 底图
    const map = initMapboxBase(appEl, initialViewState, MAPBOX_STYLE_URL);

    if (!map) {
      showError("Mapbox 初始化失败，请检查配置");
      return;
    }

    let deckOverlay = null;

    // 等待 Mapbox 样式加载完成
    map.on('load', () => {
      // 创建 deck.gl overlay
      deckOverlay = new deck.MapboxOverlay({
        layers: []
      });

      map.addControl(deckOverlay);

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
    let lastFlyToSessionOrder = -1; // 跟踪上次飞行到的 session

    // 获取返回顶部提示元素
    const backToTopHint = document.getElementById("backToTopHint");

    // 记录进入 Session 之前的滚动位置
    let scrollPositionBeforeSession = 0;

    // 添加返回按钮点击事件
    if (backToTopHint) {
      backToTopHint.addEventListener("click", () => {
        // 滚动回进入 Session 之前的位置
        window.scrollTo({
          top: scrollPositionBeforeSession,
          behavior: "smooth"
        });
      });
    }


    window.addEventListener("envlink:session-start", () => {
      if (!sessionAnimationStarted) {
        sessionAnimationStarted = true;
        sessionAnimationStartTs = performance.now();
      }
    });

    window.addEventListener("envlink:session-visibility", (event) => {
      const sessionActive = Boolean(event?.detail?.visible);
      sessionRenderActive = sessionActive;

      if (sessionActive) {
        // 记录当前滚动位置（进入 Session 之前）
        scrollPositionBeforeSession = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

        // Session 阶段：启用地图交互
        enableMapInteraction(map, initialViewState.zoom);

        // 启用地图容器的鼠标事件（移除 pointer-events: none）
        appEl.classList.add("session-active");

        // 锁定页面滚动（防止与地图缩放冲突）
        document.body.style.overflow = "hidden";

        // 显示返回按钮
        if (backToTopHint) {
          backToTopHint.classList.add("is-visible");
        }
      } else {
        // 非 Session 阶段：禁用交互并重置视角
        disableMapInteraction(map, initialViewState);
        sessionOverlay.hide();

        // 禁用地图容器的鼠标事件（恢复 pointer-events: none）
        appEl.classList.remove("session-active");

        // 解锁页面滚动
        document.body.style.overflow = "";

        // 隐藏返回按钮
        if (backToTopHint) {
          backToTopHint.classList.remove("is-visible");
        }
      }
    });
    let hoveredSessionId = null;
    window.addEventListener("envlink:hover-session", (event) => {
      hoveredSessionId = event?.detail?.id || null;
      sessionOverlay.setHover(hoveredSessionId);
      sessionTimeline.setHover(hoveredSessionId);
    });

    window.addEventListener("envlink:click-session", (event) => {
      const { id, coordinates, name } = event?.detail || {};

      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        console.warn("Invalid coordinates for click-session event:", id);
        return;
      }

      console.log(`Flying to session: ${name || id}`, coordinates);

      map.flyTo({
        center: coordinates,
        zoom: SESSION_CLICK_FLY_ZOOM,
        duration: SESSION_FLY_TO_DURATION,
        essential: true,
      });

      window.dispatchEvent(
        new CustomEvent("envlink:hover-session", {
          detail: { id },
        })
      );
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

      // 获取当前地图缩放级别用于动态调整点大小
      const currentZoom = map.getZoom();

      const pointLayer = createPointLayer(
        processedPoints,
        elapsed,
        appearEnd,
        shouldFadePoints,
        currentZoom
      );
      const haloLayer = createPointHaloLayer(
        processedPoints,
        elapsed,
        appearEnd,
        shouldFadePoints,
        currentZoom
      );
      const layers = [haloLayer, pointLayer];

      if (sessionRenderActive && sessionVisibleCount > 0) {
        const visibleSessions = sessionEntries.slice(0, sessionVisibleCount);
        const currentEntry = visibleSessions[visibleSessions.length - 1];
        const sessionLayer = createSessionHighlightLayer(
          visibleSessions,
          currentEntry.order,
          hoveredSessionId,
          currentZoom
        );

        // 当新的 session 出现时，飞行到该点
        if (currentEntry.order !== lastFlyToSessionOrder && currentEntry.coordinates) {
          map.flyTo({
            center: currentEntry.coordinates,
            zoom: SESSION_AUTO_FLY_ZOOM,
            duration: SESSION_FLY_TO_DURATION,
            essential: true
          });
          lastFlyToSessionOrder = currentEntry.order;
        }

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
        // 重置飞行跟踪，下次进入 Session 时重新开始
        lastFlyToSessionOrder = -1;
        hoveredSessionId = null;
      }

      if (deckOverlay) {
        deckOverlay.setProps({
          layers,
        });
      }
      requestAnimationFrame(animate);
    };

      // 延迟启动动画，确保 MapboxOverlay 完全初始化
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          animate();
        });
      });
    }); // 关闭 map.on('load') 回调
  } catch (error) {
    console.error(error);
    showError(error.message || "加载数据失败");
  }
};

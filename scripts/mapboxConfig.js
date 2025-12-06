/**
 * 获取 Mapbox Token
 * @returns {string} Mapbox access token
 */
export const getMapboxToken = () => {
  return window.EnvlinkConfig?.mapboxToken || "";
};

/**
 * 初始化 Mapbox 底图
 * @param {HTMLElement} container - 地图容器元素
 * @param {Object} initialViewState - 初始视图状态 {longitude, latitude, zoom, pitch, bearing}
 * @param {string} styleUrl - Mapbox 样式 URL
 * @returns {mapboxgl.Map|null} Mapbox Map 实例
 */
export const initMapboxBase = (container, initialViewState, styleUrl) => {
  const token = getMapboxToken();
  if (!token) {
    console.warn("Mapbox token not found in EnvlinkConfig");
    return null;
  }

  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container,
    style: styleUrl,
    center: [initialViewState.longitude, initialViewState.latitude],
    zoom: initialViewState.zoom,
    pitch: initialViewState.pitch || 0,
    bearing: initialViewState.bearing || 0,
    interactive: true,
    attributionControl: false,
    preserveDrawingBuffer: true,
    antialias: true,
  });

  // 初始化后立即禁用所有交互（Story 阶段）
  map.scrollZoom.disable();
  map.dragPan.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();

  map.on('error', (e) => {
    console.error("Mapbox error:", e.error);
  });

  return map;
};

/**
 * 启用地图交互（Session 阶段）
 * @param {mapboxgl.Map} map - Mapbox Map 实例
 * @param {number} minZoom - 最小缩放级别
 */
export const enableMapInteraction = (map, minZoom) => {
  if (!map) {
    console.error("enableMapInteraction: map is null");
    return;
  }

  map.scrollZoom.enable();
  map.dragPan.enable();
  map.doubleClickZoom.enable();
  map.touchZoomRotate.enableRotation(false);

  map.setMinZoom(minZoom);
  map.setMaxZoom(22);
};

/**
 * 禁用地图交互（非 Session 阶段）
 * @param {mapboxgl.Map} map - Mapbox Map 实例
 * @param {Object} initialViewState - 初始视图状态
 */
export const disableMapInteraction = (map, initialViewState) => {
  if (!map) {
    console.error("disableMapInteraction: map is null");
    return;
  }

  map.scrollZoom.disable();
  map.dragPan.disable();
  map.doubleClickZoom.disable();

  // 平滑重置到初始视角
  map.easeTo({
    center: [initialViewState.longitude, initialViewState.latitude],
    zoom: initialViewState.zoom,
    pitch: 0,
    bearing: 0,
    duration: 800,
  });
};

// viz_scripts/sensorUI.js
import { resolveAssetUrlWithKey } from "./apiClient.js";

export const SESSION_TZ = "Asia/Shanghai";
export const SESSION_TZ_LABEL = "(UTC+8)";

let collapsibleInitialized = false;

/**
 * Show sensor data in the sidebar panel
 */
export function showSensorDataPanel(sensorData, sessionId) {
  const panel = document.getElementById("sensorDataPanel");
  const content = document.getElementById("sensorDataContent");

  if (!panel || !content) return;

  const formatValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const formatTimestampShort = (timeObj) => {
    if (!timeObj) return "N/A";
    let date;
    if (Array.isArray(timeObj)) {
      const [y, m, d, h = 0, mi = 0, s = 0] = timeObj;
      date = new Date(y, m - 1, d, h, mi, s);
    } else {
      date = new Date(timeObj);
    }
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  };

  let html = `<div class="sensor-readings-grid">`;

  const sensorLabels = {
    location: { label: "Location", unit: "" },
    altitude: { label: "Altitude", unit: "m" },
    local_time: { label: "Time", unit: "" },
    voc_index: { label: "VOC", unit: "" },
    temperature: { label: "Temp", unit: "°C" },
    humidity: { label: "Humidity", unit: "%" },
    pm2_5: { label: "PM2.5", unit: "μg/m³" },
    pm10: { label: "PM10", unit: "μg/m³" },
    co2: { label: "CO₂", unit: "ppm" },
    pressure: { label: "Pressure", unit: "hPa" }
  };

  const readings = {};

  if (sensorData.latitude !== undefined && sensorData.longitude !== undefined) {
    readings.location = `${formatValue(sensorData.latitude)}°, ${formatValue(sensorData.longitude)}°`;
  }

  if (sensorData.altitude !== undefined) readings.altitude = sensorData.altitude;
  if (sensorData.local_time) readings.local_time = sensorData.local_time;

  Object.assign(readings, sensorData.sensor_data || {});

  for (const [key, value] of Object.entries(readings)) {
    const info = sensorLabels[key] || { label: key.toUpperCase(), unit: "" };
    let formattedValue;

    if (key === "local_time") {
      formattedValue = `<span style="font-size: 10px;">${formatTimestampShort(value)}</span>`;
    } else {
      formattedValue =
        typeof value === "string"
          ? value
          : `${formatValue(value)}${info.unit ? " " + info.unit : ""}`;
    }

    html += `
    <div class="sensor-reading-item">
      <span class="sensor-reading-label">${info.label}</span>
      <span class="sensor-reading-value">${formattedValue}</span>
    </div>
  `;
  }

  html += `</div>`;

  content.innerHTML = html;
  panel.classList.add('visible');

  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

/**
 * Hide sensor data panel
 */
export function hideSensorDataPanel() {
  const panel = document.getElementById("sensorDataPanel");
  if (panel) {
    panel.classList.remove('visible');
  }
}

/**
 * Format session ID to readable label
 */
export function formatSessionIdToLabel(id) {
  if (typeof id !== "string") return String(id ?? "");
  const m = id.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!m) return id;

  const [_, y, mo, d, h, mi, s] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));

  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SESSION_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  });

  const parts = fmt.formatToParts(dt)
    .filter(p => p.type !== "literal")
    .reduce((acc, p) => (acc[p.type] = p.value, acc), {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${SESSION_TZ_LABEL}`;
}

/**
 * Build session UI with collapsible list
 */
export function buildSessionUI(datasetKey, sessionMetas) {
  const container = ensureSessionListContainer();
  container.innerHTML = "";

  if (!sessionMetas || sessionMetas.length === 0) {
    container.textContent = "No sensor sessions.";
    return;
  }

  const reg = window.SensorRegistry[datasetKey];

  const firstSession = sessionMetas[0];
  if (firstSession) {
    const firstRow = createSessionRow(firstSession, 0, reg, true);
    container.appendChild(firstRow);
  }

  if (sessionMetas.length > 1) {
    const dropdown = document.createElement("div");
    dropdown.className = "session-list-dropdown collapsed";
    dropdown.id = "sessionListDropdown";

    sessionMetas.slice(1).forEach((session, index) => {
      const row = createSessionRow(session, index + 1, reg, false);
      dropdown.appendChild(row);
    });

    container.appendChild(dropdown);
  }

  initializeCollapsible();
}

function createSessionRow(sessionMeta, index, reg, isFirst) {
  const { id, label } = sessionMeta;
  const row = document.createElement("div");
  row.className = isFirst ? "session-toggle session-toggle-first" : "session-toggle session-toggle-collapsible";

  const labelEl = document.createElement("label");
  labelEl.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  input.dataset.session = id;

  const slider = document.createElement("span");
  slider.className = "slider";

  labelEl.appendChild(input);
  labelEl.appendChild(slider);

  const text = document.createElement("span");
  text.className = "toggleLabel";
  text.textContent = label || id;
  text.title = id;

  row.appendChild(labelEl);
  row.appendChild(text);

  if (isFirst) {
    const collapseIcon = document.createElement("span");
    collapseIcon.className = "session-collapse-icon";
    row.appendChild(collapseIcon);
  }

  input.addEventListener("change", (e) => {
    e.stopPropagation();
    const checked = e.target.checked;
    const node = reg?.nodes?.[id];
    if (node) {
      node.visible = checked;
      node.parent?.updateMatrixWorld?.(true);
      window.viewer?.render?.();
    }
  });

  if (reg) reg.toggles[id] = input;

  return row;
}

function ensureSessionListContainer() {
  let list = document.getElementById("sessionList");
  if (!list) {
    const controls = document.getElementById("sessionControls");
    if (controls) {
      list = document.createElement("div");
      list.id = "sessionList";
      controls.insertBefore(list, controls.firstChild);
    }
  }
  return list;
}

function initializeCollapsible() {
  if (collapsibleInitialized) return;

  const container = document.getElementById("sessionList");
  if (!container) return;

  const firstRow = container.querySelector(".session-toggle-first");
  const icon = firstRow?.querySelector(".session-collapse-icon");
  const dropdown = document.getElementById("sessionListDropdown");

  if (!firstRow || !icon || !dropdown) return;

  firstRow.addEventListener("click", (e) => {
    if (e.target.classList.contains('slider') ||
      e.target.closest('.switch')) {
      return;
    }

    dropdown.classList.toggle("collapsed");
    icon.classList.toggle("rotated");
  });

  collapsibleInitialized = true;
}

export function resetCollapsibleState() {
  collapsibleInitialized = false;
}


export function showSensorImages(sensorData, sessionAssets, datasetKey, sessionId) {

  const panel = document.getElementById("sensorImagesPanel");
  if (!panel) {
    console.warn("[SensorImages] Panel not found");
    return;
  }

  const imageFiles = sensorData.image_files;
  if (!imageFiles || !Array.isArray(imageFiles) || imageFiles.length === 0) {
    console.warn("[SensorImages] No image files in sensor data");
    return;
  }

  const legacyBasePath = datasetKey ? `../database/${datasetKey}/sensordata/${sessionId}` : "";

  const cameraOrder = [
    { id: "2", pattern: /cam2/ },
    { id: "0", pattern: /cam0/ },
    { id: "1", pattern: /cam1/ },
  ];

  cameraOrder.forEach(({ id, pattern }) => {
    const imgOriginal = document.getElementById(`sensorImg${id}`);
    const imgSegmented = document.getElementById(`sensorImg${id}Seg`);

    if (!imgOriginal || !imgSegmented) {
      console.warn(`[SensorImages] Image elements not found for cam${id}`);
      return;
    }

    // 从数组中查找匹配的文件名
    const imageFile = imageFiles.find((file) => pattern.test(file));

    if (imageFile) {
      const originalPath = sessionAssets?.imagesPath
        ? resolveAssetUrlWithKey(`${sessionAssets.imagesPath}/${imageFile}`)
        : `${legacyBasePath}/images/${imageFile}`;
      const segmentedPath = sessionAssets?.segmentedImagesPath
        ? resolveAssetUrlWithKey(`${sessionAssets.segmentedImagesPath}/${imageFile}`)
        : `${legacyBasePath}/img_seg/${imageFile}`;

      console.log(`[SensorImages] Loading cam${id}:`);

      // 加载原图
      imgOriginal.classList.remove("error");
      imgOriginal.src = originalPath;
      imgOriginal.onerror = () => imgOriginal.classList.add("error");

      // 加载分割图
      imgSegmented.classList.remove("error");
      imgSegmented.src = segmentedPath;
      imgSegmented.onerror = () => imgSegmented.classList.add("error");
    } else {
      console.warn(`[SensorImages] No cam${id} image found`);
      imgOriginal.src = "";
      imgOriginal.classList.add("error");
      imgSegmented.src = "";
      imgSegmented.classList.add("error");
    }
  });

  // 初始化图像分割（不再使用滑块）
  initImageComparison();

  // 显示面板
  panel.classList.add("visible");
}

/**
 * 初始化图像对比（无滑块）
 */
function initImageComparison() {
  updateImageComparison(50);

  document.querySelectorAll(".image-wrapper img").forEach((img) => {
    img.draggable = false;
  });
  const wrappers = document.querySelectorAll(".image-wrapper");
  wrappers.forEach((wrapper) => {
    let isDragging = false;

    // 监听图片加载完成，用于移除遮罩
    const images = wrapper.querySelectorAll("img");
    let loadedCount = 0;

    images.forEach((img) => {
      // 图片已缓存也视为已加载
      if (img.complete && img.naturalWidth > 0) {
        loadedCount++;
      } else {
        img.addEventListener("load", () => {
          loadedCount++;
          if (loadedCount === images.length) {
            wrapper.classList.add("loaded");
          }
        });
        img.addEventListener("error", () => img.classList.add("error"));
      }
    });

    // 如果两张图都已加载，则立即添加 loaded
    if (loadedCount === images.length) {
      wrapper.classList.add("loaded");
    }


    wrapper.addEventListener("mousedown", (e) => {
      isDragging = true;
      handleMove(e, wrapper);
    });

    window.addEventListener("mousemove", (e) => {
      if (isDragging) handleMove(e, wrapper);
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
    });

    wrapper.addEventListener("touchstart", (e) => {
      isDragging = true;
      handleMove(e.touches[0], wrapper);
    });

    window.addEventListener("touchmove", (e) => {
      if (isDragging) handleMove(e.touches[0], wrapper);
    });

    window.addEventListener("touchend", () => {
      isDragging = false;
    });
  });
}

/**
 * 拖动事件处理
 */
function handleMove(e, wrapper) {
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let percentage = (x / rect.width) * 100;

  // 限制范围
  percentage = Math.max(0, Math.min(100, percentage));

  updateImageComparison(percentage);
}


/**
 * 更新图像对比效果
 */
function updateImageComparison(percentage = 50) {
  const dividers = document.querySelectorAll(".image-divider");
  const segmentedImages = document.querySelectorAll(".image-segmented");

  const rightClip = 100 - percentage;

  dividers.forEach((divider) => {
    divider.style.left = `${percentage}%`;
  });

  segmentedImages.forEach((img) => {
    img.style.clipPath = `inset(0 ${rightClip}% 0 0)`;
  });
}
/**
 * Hide sensor images panel
 */
export function hideSensorImages() {
  const panel = document.getElementById("sensorImagesPanel");
  if (panel) {
    panel.classList.remove("visible");

    // 清空图片源
    setTimeout(() => {
      if (!panel.classList.contains("visible")) {
        ["0", "1", "2"].forEach((id) => {
          const imgOriginal = document.getElementById(`sensorImg${id}`);
          const imgSegmented = document.getElementById(`sensorImg${id}Seg`);
          if (imgOriginal) {
            imgOriginal.src = "";
            imgOriginal.classList.remove("error");
          }
          if (imgSegmented) {
            imgSegmented.src = "";
            imgSegmented.classList.remove("error");
          }
        });
      }
    }, 300);
  }
}

// Expose to global (for other scripts)
window.hideSensorDataPanel = hideSensorDataPanel;
window.resetCollapsibleState = resetCollapsibleState;
window.hideSensorImages = hideSensorImages;

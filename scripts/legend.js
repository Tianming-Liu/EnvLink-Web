import { BATCH_LEVELS, LEGEND_RADIUS_MAX, LEGEND_RADIUS_MIN } from "./constants.js";
import { getBatchColor, getBatchRatio } from "./mapLayers.js";

const legendContainer = document.getElementById("legendItems");
const INACTIVE_COLOR = "rgba(140, 140, 150, 0.35)";
let legendEntries = [];

export const buildBatchLegend = () => {
  if (!legendContainer) {
    return;
  }
  legendContainer.innerHTML = "";
  legendEntries = [];

  BATCH_LEVELS.forEach((batch) => {
    const ratio = getBatchRatio(batch.key || batch.name);
    const [r, g, b] = getBatchColor(ratio);
    const sizePx =
      LEGEND_RADIUS_MAX -
      (LEGEND_RADIUS_MAX - LEGEND_RADIUS_MIN) * ratio;

    const item = document.createElement("div");
    item.className = "batch-legend__item";

    const swatch = document.createElement("span");
    swatch.className = "batch-legend__circle";
    swatch.style.width = `${sizePx}px`;
    swatch.style.height = `${sizePx}px`;
    swatch.style.backgroundColor = INACTIVE_COLOR;

    const label = document.createElement("span");
    label.className = "batch-legend__label";
    label.textContent = batch.label || batch.name;

    item.appendChild(swatch);
    item.appendChild(label);
    legendContainer.appendChild(item);
    legendEntries.push({ item, swatch, color: `rgb(${r}, ${g}, ${b})` });
  });
  setLegendActiveBatch(0);
};

export const setLegendActiveBatch = (index) => {
  if (!legendEntries.length) {
    return;
  }
  legendEntries.forEach(({ item, swatch, color }, i) => {
    if (i <= index) {
      item.classList.add("is-active");
      swatch.style.backgroundColor = color;
    } else {
      item.classList.remove("is-active");
      swatch.style.backgroundColor = INACTIVE_COLOR;
    }
  });
};

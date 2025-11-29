const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (value) => String(value).padStart(2, "0");

const formatDate = (timestamp) => {
  if (typeof timestamp !== "number") {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month} ${day} ${year}`;
};

const formatDateTime = (timestamp) => {
  if (typeof timestamp !== "number") {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${month} ${day} ${year} ${hours}:${minutes} UTC+8`;
};

const dispatchHover = (id) => {
  window.dispatchEvent(
    new CustomEvent("envlink:hover-session", {
      detail: { id: id || null },
    })
  );
};

export const createSessionTimeline = () => {
  const root = document.getElementById("sessionTimeline");
  if (!root) {
    return {
      render: () => {},
      setHover: () => {},
    };
  }

  let pointMap = new Map();
  let initialized = false;
  let minTs = 0;
  let maxTs = 1;
  let range = 1;
  let pointsContainer = null;
  let renderedCount = 0;
  let storedEntries = [];
  let hoverLabel = null;
  let entryLookup = new Map();

  const reset = () => {
    root.innerHTML = "";
    pointMap.clear();
    initialized = false;
    renderedCount = 0;
    hoverLabel = null;
  };

  const updateHoverLabel = (targetId) => {
    if (!hoverLabel) {
      return;
    }
    if (!targetId) {
      hoverLabel.classList.remove("is-active");
      return;
    }
    const entry = entryLookup.get(targetId);
    const point = pointMap.get(targetId);
    if (!entry || !point) {
      hoverLabel.classList.remove("is-active");
      return;
    }
    hoverLabel.textContent = formatDateTime(entry.timestamp);
    hoverLabel.style.top = point.style.top || "0%";
    hoverLabel.classList.add("is-active");
  };

  const setHover = (id) => {
    pointMap.forEach((point, key) => {
      point.classList.toggle("is-hover", id && key === id);
    });
    updateHoverLabel(id);
  };

  const initializeAxis = (entries) => {
    reset();
    storedEntries = entries.slice();
    entryLookup.clear();
    storedEntries.forEach((entry) => {
      if (entry?.id) {
        entryLookup.set(entry.id, entry);
      }
    });
    const valid = storedEntries.filter(
      (item) => typeof item.timestamp === "number" && !Number.isNaN(item.timestamp)
    );
    if (!valid.length) {
      root.classList.add("is-hidden");
      return false;
    }
    root.classList.remove("is-hidden");
    minTs = Math.min(...valid.map((entry) => entry.timestamp));
    maxTs = Math.max(...valid.map((entry) => entry.timestamp));
    range = Math.max(maxTs - minTs, 1);

    const axis = document.createElement("div");
    axis.className = "session-timeline__axis";
    const track = document.createElement("div");
    track.className = "session-timeline__track";
    axis.appendChild(track);
    const endpointTop = document.createElement("div");
    endpointTop.className =
      "session-timeline__endpoint session-timeline__endpoint--top";
    endpointTop.textContent = formatDate(minTs);
    axis.appendChild(endpointTop);
    const endpointBottom = document.createElement("div");
    endpointBottom.className =
      "session-timeline__endpoint session-timeline__endpoint--bottom";
    endpointBottom.textContent = formatDate(maxTs);
    axis.appendChild(endpointBottom);

    const ticksWrapper = document.createElement("div");
    ticksWrapper.className = "session-timeline__ticks";
    const segments = 4;
    for (let i = 1; i <= segments; i += 1) {
      const ratio = i / (segments + 1);
      const tick = document.createElement("span");
      tick.className = "session-timeline__tick-line";
      tick.style.top = `${ratio * 100}%`;
      ticksWrapper.appendChild(tick);
      const tickLabel = document.createElement("span");
      tickLabel.className = "session-timeline__tick-label";
      tickLabel.style.top = `${ratio * 100}%`;
      const tickTimestamp = minTs + range * ratio;
      tickLabel.textContent = formatDate(tickTimestamp);
      ticksWrapper.appendChild(tickLabel);
    }
    track.appendChild(ticksWrapper);

    pointsContainer = document.createElement("div");
    pointsContainer.className = "session-timeline__points";
    track.appendChild(pointsContainer);
    hoverLabel = document.createElement("div");
    hoverLabel.className = "session-timeline__hover-label";
    axis.appendChild(hoverLabel);

    root.appendChild(axis);
    initialized = true;
    renderedCount = 0;
    return true;
  };

  const addPoint = (entry, index) => {
    if (
      typeof entry.timestamp !== "number" ||
      Number.isNaN(entry.timestamp) ||
      !pointsContainer
    ) {
      return;
    }
    const point = document.createElement("button");
    point.type = "button";
    point.className = "session-timeline__point";
    point.dataset.id = entry.id;
    const ratio = (entry.timestamp - minTs) / range;
    point.style.top = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    point.title = `${formatDate(entry.timestamp)} · ${entry.name}`;
    point.addEventListener("mouseenter", () => {
      setHover(entry.id);
      dispatchHover(entry.id);
    });
    point.addEventListener("mouseleave", () => {
      setHover(null);
      dispatchHover(null);
    });
    pointMap.set(entry.id, point);
    pointsContainer.appendChild(point);
    point.style.opacity = "0";
    point.style.transform = "translate(-50%, -50%) scale(0.6)";
    setTimeout(() => {
      point.style.opacity = "1";
      point.style.transform = "translate(-50%, -50%) scale(1)";
    }, 150 + index * 70);
  };

  const render = (entries, visibleCount = 0) => {
    if (!Array.isArray(entries) || !entries.length || visibleCount <= 0) {
      reset();
      root.classList.add("is-hidden");
      return;
    }
    if (!initialized) {
      if (!initializeAxis(entries)) {
        return;
      }
    }
    const clamped = Math.min(visibleCount, entries.length);
    if (clamped <= renderedCount) {
      return;
    }
    for (let i = renderedCount; i < clamped; i += 1) {
      addPoint(entries[i], i);
    }
    renderedCount = clamped;
  };

  return {
    render,
    setHover,
  };
};

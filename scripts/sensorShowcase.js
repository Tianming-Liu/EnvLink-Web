const SENSOR_GROUPS = [
  {
    id: "tri-camera",
    label: "Tri-camera",
    description: "Spatial Context",
    metrics: [
      "Sky visibility",
      "Tree visibility",
      "Visual element count",
      "Highly extendable feed",
    ],
    node: { x: 0.57, y: 0.14 },
  },
  {
    id: "ecg",
    label: "ECG",
    description: "Bio-sensing",
    metrics: ["ECG waveform (mV)", "Heart rate (HR)", "Heart rate variability (HRV)"],
    node: { x: 0.12, y: 0.26 },
  },
  {
    id: "light",
    label: "Light",
    description: "Ambient lights",
    metrics: ["Light intensity (Lux)", "UV index"],
    node: { x: 0.21, y: 0.44 },
  },
  {
    id: "air",
    label: "Air Quality",
    description: "Atmospheric chemistry",
    metrics: [
      "TVOC (Total Volatile Organic Compounds)",
      "Estimated eCO₂",
    ],
    node: { x: 0.18, y: 0.61 },
  },
  {
    id: "basic",
    label: "Basic Sensor",
    description: "Microclimate",
    metrics: ["Temperature (°C)", "Humidity (%RH)", "Pressure (hPa)"],
    node: { x: 0.26, y: 0.73 },
  },
];

export const initSensorShowcase = () => {
  const stage = document.getElementById("sensorShowcase");
  if (!stage) {
    return;
  }
  const rowsRoot = stage.querySelector("[data-sensor-rows]");
  const nodesRoot = stage.querySelector("[data-sensor-nodes]");
  const deviceEl = stage.querySelector(".sensor-stage__device");
  const deviceImg = deviceEl?.querySelector("img");
  if (!rowsRoot || !nodesRoot || !deviceEl || !deviceImg) {
    return;
  }

  const hoverables = [];
  let pointerActiveId = null;
  const nodeEntries = [];
  const updateHighlightState = () => {
    const activeId = pointerActiveId;
    const targets = stage.querySelectorAll(
      "[data-sensor-group], [data-sensor-metric], [data-sensor-node]"
    );
    targets.forEach((el) => {
      const targetId =
        el.dataset.sensorGroup || el.dataset.sensorMetric || el.dataset.sensorNode;
      el.classList.toggle("is-hover", Boolean(activeId && targetId === activeId));
    });
  };

  const setPointerActive = (id) => {
    pointerActiveId = id || null;
    updateHighlightState();
  };

  SENSOR_GROUPS.forEach((group, index) => {
    const row = document.createElement("div");
    row.className = "sensor-panel__row";
    row.dataset.sensorRow = group.id;
    row.style.transitionDelay = `${0.3 + index * 0.12}s`;

    const typeEl = document.createElement("div");
    typeEl.className = "sensor-type";
    typeEl.dataset.sensorGroup = group.id;
    typeEl.innerHTML = `<strong>${group.label}</strong><span>${group.description}</span>`;
    row.appendChild(typeEl);
    hoverables.push(typeEl);

    const metricBlock = document.createElement("div");
    metricBlock.className = "sensor-metric-block";
    metricBlock.dataset.sensorMetric = group.id;
    const metricList = document.createElement("ul");
    metricList.className = "sensor-metric-block__list";
    group.metrics.forEach((metric) => {
      const item = document.createElement("li");
      item.className = "sensor-group__metric";
      item.dataset.sensorMetric = group.id;
      item.textContent = metric;
      metricList.appendChild(item);
      hoverables.push(item);
    });
    metricBlock.appendChild(metricList);
    row.appendChild(metricBlock);
    rowsRoot.appendChild(row);
    hoverables.push(metricBlock);

    if (group.node) {
      const nodeDot = document.createElement("button");
      nodeDot.type = "button";
      nodeDot.className = "sensor-node";
      nodeDot.style.transitionDelay = `${0.65 + index * 0.12}s`;
      nodeDot.dataset.sensorNode = group.id;
      nodeDot.setAttribute("aria-label", `${group.label} connector`);
      nodesRoot.appendChild(nodeDot);
      hoverables.push(nodeDot);
      nodeEntries.push({ element: nodeDot, position: group.node });
    }
  });

  hoverables.forEach((element) => {
    const id =
      element.dataset.sensorGroup ||
      element.dataset.sensorMetric ||
      element.dataset.sensorNode;
    if (!id) {
      return;
    }
    element.addEventListener("pointerenter", () => setPointerActive(id));
    element.addEventListener("pointerleave", () => setPointerActive(null));
    element.addEventListener("focus", () => setPointerActive(id));
    element.addEventListener("blur", () => setPointerActive(null));
  });

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          stage.classList.add("is-visible");
        }
      });
    },
    {
      rootMargin: "-10% 0px",
      threshold: 0.3,
    }
  );
  visibilityObserver.observe(stage);

  const updateNodePositions = () => {
    const deviceRect = deviceEl.getBoundingClientRect();
    const imageRect = deviceImg.getBoundingClientRect();
    const offsetX = imageRect.left - deviceRect.left;
    const offsetY = imageRect.top - deviceRect.top;
    const { width, height } = imageRect;
    if (!width || !height) {
      return;
    }
    nodeEntries.forEach(({ element, position }) => {
      const left = offsetX + position.x * width;
      const top = offsetY + position.y * height;
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    });
  };

  if (deviceImg.complete) {
    updateNodePositions();
  } else {
    deviceImg.addEventListener("load", updateNodePositions, { once: true });
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => updateNodePositions());
    resizeObserver.observe(deviceEl);
    resizeObserver.observe(deviceImg);
  } else {
    window.addEventListener("resize", updateNodePositions);
  }

};

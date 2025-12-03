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
      "Estimated CO₂",
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

const GALLERY_ITEMS = [

  { type: "image", src: "DSC05239.jpg" },
  { type: "video", src: "xz_lz.mov" },
  { type: "video", src: "xj.mov" },
  { type: "image", src: "DSC05237.jpg" },
  { type: "image", src: "DSC05237.jpg" },
  { type: "image", src: "DSC05238.jpg" },
];

export const initSensorShowcase = () => {
  const stage = document.getElementById("sensorShowcase");
  if (!stage) {
    return;
  }
  const rowsRoot = stage.querySelector("[data-sensor-rows]");
  const nodesRoot = stage.querySelector("[data-sensor-nodes]");
  const galleryRoot = stage.querySelector("[data-sensor-gallery]");
  const deviceEl = stage.querySelector(".sensor-stage__device");
  const deviceImg = deviceEl?.querySelector("img");
  if (!rowsRoot || !nodesRoot || !galleryRoot || !deviceEl || !deviceImg) {
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
    metricBlock.dataset.sensorGroup = group.id;
    const metricList = document.createElement("ul");
    metricList.className = "sensor-metric-block__list";
    group.metrics.forEach((metric) => {
      const item = document.createElement("li");
      item.className = "sensor-group__metric";
      item.dataset.sensorGroup = group.id;
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

  GALLERY_ITEMS.forEach((galleryItem, index) => {
    const item = document.createElement("div");
    item.className = "sensor-gallery__item";
    item.style.opacity = "0";
    item.style.transform = "translateX(8%)";

    if (galleryItem.type === "image") {
      const img = document.createElement("img");
      img.src = `./src/img/${galleryItem.src}`;
      img.alt = `Sensing device image ${index + 1}`;
      img.loading = "lazy";
      item.appendChild(img);
    } else if (galleryItem.type === "video") {
      const video = document.createElement("video");
      video.src = `./src/img/${galleryItem.src}`;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";

      video.addEventListener("mouseenter", () => {
        video.play().catch(() => { });
      });

      video.addEventListener("mouseleave", () => {
        video.pause();
      });

      item.appendChild(video);
    }

    galleryRoot.appendChild(item);

    setTimeout(() => {
      item.style.transition = "opacity 0.45s ease, transform 0.45s ease";
      item.style.opacity = "1";
      item.style.transform = "translateX(0)";

      setTimeout(() => {
        item.style.transition = "";
      }, 450);
    }, 400 + index * 80);
  });

  const galleryContainer = stage.querySelector(".sensor-stage__gallery");
  const updateScrollGradients = () => {
    const scrollTop = galleryRoot.scrollTop;
    const scrollHeight = galleryRoot.scrollHeight;
    const clientHeight = galleryRoot.clientHeight;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    const threshold = 10;

    if (scrollTop > threshold) {
      galleryContainer.classList.add("has-scroll-top");
    } else {
      galleryContainer.classList.remove("has-scroll-top");
    }

    if (scrollBottom > threshold) {
      galleryContainer.classList.add("has-scroll-bottom");
    } else {
      galleryContainer.classList.remove("has-scroll-bottom");
    }
  };

  galleryRoot.addEventListener("scroll", updateScrollGradients);
  setTimeout(updateScrollGradients, 100);

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

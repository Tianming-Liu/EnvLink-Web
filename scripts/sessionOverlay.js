const safeText = (value, fallback = "—") =>
  value === undefined || value === null || value === "" ? fallback : value;

const formatInteger = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
};

const formatMeters = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Math.round(value);
  return `${rounded.toLocaleString()} m`;
};

const MAX_SESSION_CARDS = 12;
const TOTAL_KEYS = ["villages", "datapoints", "images", "trajectory"];
const SESSION_NAME_LOOKUP = {
  xj_ajkc: "Aijieke",
  xj_altc: "Aletun",
  xj_azhc: "Azihan",
  xj_bstc: "Bostan",
  xj_bxmlc: "Baiximaili",
  xj_dqhc: "Daquanhu",
  xj_glwst: "Guole Wusitang",
  xj_hbyc: "Hebayan",
  xj_hmc: "Hemu",
  xj_hqc: "Kapake Asigan",
  xj_huoerjia: "Huoerjia",
  xj_jglsy: "Jianggelesa Yi",
  xj_klmlk: "Kulamulake",
  xj_mzc: "Mazha",
  xj_pulu: "Pulu",
  xj_qkstc: "Qiongkushitai",
  xj_sekfc: "Saierkefu",
  xj_shuimogou: "Shuimogou",
  xj_tltc: "Talate",
  xj_ygbc: "Yinggebao",
  xj_yldc: "Yueliangdi",
  xz_lz: "Lazi",
  xz_yj_xz_bedk: "Buerduika",
  xz_yj_xz_ddg: "Dadigong",
  xz_yj_xz_dx: "Daxu",
  xz_yj_xz_gr: "Gunre",
  xz_yj_xz_jd: "Jiada",
  xz_yj_xz_ld: "Leding",
  xz_yj_xz_ljx: "Lajiuxi",
  xz_yj_xz_lr: "Longri",
  xz_yj_xz_nx: "Naxi",
  xz_yj_xz_syj: "Shangyanjing",
  zj_adhc: "Andaihou",
  zj_cjpc: "Chenjia Pu",
  zj_czc: "Caizhai",
  zj_hlgc: "Huanglinggen",
  zj_hsc: "Houshe",
  zj_hzc: "Hengzhang",
  zj_ndybnchc: "Neidayin Bainiaochao",
  zj_ptc: "Pingtian",
  zj_qc: "Qiaotou",
  zj_tcc: "Tangcheng",
  zj_xhsc: "Xiaohoushe",
  zj_xkc: "Xikeng",
  zj_yjtc: "Yangjiatang",
  zj_ykltc: "Yankenglingtou",
  zj_ytc: "Youtian",
  zj_zstc: "Zhoushantou",
};

const parseSessionTimestamp = (sessions = []) => {
  if (!sessions.length) {
    return null;
  }
  const id = sessions[0]?.session_id;
  if (!id || id.length < 15) {
    return null;
  }
  const year = Number(id.slice(0, 4));
  const month = Number(id.slice(4, 6)) - 1;
  const day = Number(id.slice(6, 8));
  const hour = Number(id.slice(9, 11));
  const minute = Number(id.slice(11, 13));
  const second = Number(id.slice(13, 15));
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const buildSessionEntries = (summary = {}) => {
  if (!summary || typeof summary !== "object") {
    return [];
  }
  return Object.entries(summary)
    .map(([key, value], order) => {
      const totals = value?.totals || {};
      const loc = totals?.location;
      if (!loc || typeof loc.longitude !== "number" || typeof loc.latitude !== "number") {
        return null;
      }
      return {
        id: key,
        order,
        name: safeText(value?.full_name, key),
        coordinates: [loc.longitude, loc.latitude],
        sequence_count: totals.sequence_count || 0,
        image_count: totals.image_count || 0,
        trajectory_length_m: totals.trajectory_length_m || 0,
        timestamp: parseSessionTimestamp(value?.sessions),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

export const createSessionOverlay = () => {
  const root = document.getElementById("sessionOverlay");
  const totalsCard = document.getElementById("sessionTotals");
  const totalsFields = totalsCard
    ? {
        villages: totalsCard.querySelector("[data-total='villages']"),
        datapoints: totalsCard.querySelector("[data-total='datapoints']"),
        images: totalsCard.querySelector("[data-total='images']"),
        trajectory: totalsCard.querySelector("[data-total='trajectory']"),
      }
    : null;
  const totalFormatters = {
    villages: (value) => Math.round(value).toLocaleString(),
    datapoints: (value) => Math.round(value).toLocaleString(),
    images: (value) => Math.round(value).toLocaleString(),
    trajectory: (value) => `${Math.round(value).toLocaleString()} m`,
  };

  const resetTotals = () => {
    if (!totalsCard || !totalsFields) {
      return;
    }
    totalsCard.classList.remove("is-active");
    TOTAL_KEYS.forEach((key) => {
      totalsFields[key].textContent = totalFormatters[key](0);
    });
  };

  const updateTotals = (totals) => {
    if (!totalsCard || !totalsFields) {
      return;
    }
    totalsCard.classList.add("is-active");
    TOTAL_KEYS.forEach((key) => {
      totalsFields[key].textContent = totalFormatters[key](totals[key] || 0);
    });
  };

  if (!root) {
    return {
      show: () => {},
      hide: () => {
        resetTotals();
      },
      render: () => {},
    };
  }

  const cardsColumn = root.querySelector("[data-column='cards']");
  const scrollUpBtn = root.querySelector(".session-overlay__scroll--up");
  const scrollDownBtn = root.querySelector(".session-overlay__scroll--down");
  if (!cardsColumn) {
    return {
      render: () => {},
      hide: () => {},
      setHover: () => {},
    };
  }
  const cardMap = new Map();
  let renderedCount = 0;
  let hoverId = null;

  const bindScrollButton = (button, delta) => {
    if (!button) {
      return;
    }
    button.addEventListener("click", () => {
      console.log(
        "[Scroll]", delta < 0 ? "up" : "down",
        "button clicked; delta:", delta
      );
      cardsColumn.scrollBy({
        top: delta,
        behavior: "smooth",
      });
    });
  };

  bindScrollButton(scrollUpBtn, -220);
  bindScrollButton(scrollDownBtn, 220);

  const emitHover = (id) => {
    if (hoverId === id) {
      return;
    }
    hoverId = id || null;
    window.dispatchEvent(
      new CustomEvent("envlink:hover-session", {
        detail: { id: hoverId },
      })
    );
  };

  const updateCardHover = (targetId) => {
    cardMap.forEach((card, id) => {
      card.classList.toggle("is-hover", targetId && id === targetId);
    });
  };

  const ensureCard = (entry) => {
    if (cardMap.has(entry.id)) {
      return cardMap.get(entry.id);
    }
    const card = document.createElement("div");
    card.className = "session-entry";
    card.dataset.id = entry.id;
    card.dataset.sequence = String(entry.order ?? 0);
    const primaryName = safeText(entry.name);
    const title = document.createElement("div");
    title.className = "session-entry__name";
    const primaryLabel = document.createElement("strong");
    primaryLabel.textContent =
      SESSION_NAME_LOOKUP[entry.id] || primaryName;
    title.appendChild(primaryLabel);
    const secondary = document.createElement("span");
    secondary.textContent = primaryName;
    title.appendChild(secondary);

    const metrics = document.createElement("div");
    metrics.className = "session-entry__metrics";
    metrics.innerHTML = `
      Samples <strong>${formatInteger(entry.sequence_count)}</strong>
      Images <strong>${formatInteger(entry.image_count)}</strong>
      Trajectory <strong>${formatMeters(entry.trajectory_length_m)}</strong>
    `;
    card.appendChild(title);
    card.appendChild(metrics);
    if (!card.parentNode) {
      cardsColumn?.appendChild(card);
    }
    if (!card.dataset.hoverBound) {
      card.addEventListener("mouseenter", () => {
        updateCardHover(entry.id);
        emitHover(entry.id);
      });
      card.addEventListener("mouseleave", () => {
        updateCardHover(null);
        emitHover(null);
      });
      card.dataset.hoverBound = "1";
    }
    cardMap.set(entry.id, card);
    return card;
  };

  const show = () => {
    root.classList.remove("is-hidden");
    root.classList.add("is-active");
  };

  const hide = () => {
    root.classList.add("is-hidden");
    root.classList.remove("is-active");
    resetTotals();
    updateCardHover(null);
    cardsColumn.innerHTML = "";
    cardMap.clear();
    renderedCount = 0;
  };

  const render = (entries) => {
    if (!Array.isArray(entries) || !entries.length) {
      cardsColumn.innerHTML = "";
      cardMap.clear();
      renderedCount = 0;
      hide();
      return;
    }
    const targetCount = entries.length;
    if (targetCount < renderedCount) {
      cardsColumn.innerHTML = "";
      cardMap.clear();
      renderedCount = 0;
    }
    let appended = false;
    for (let i = renderedCount; i < targetCount; i += 1) {
      const entry = entries[i];
      const card = ensureCard(entry);
      card.classList.add("is-active");
      appended = true;
    }
    renderedCount = targetCount;
    if (appended) {
      cardsColumn.scrollTop = cardsColumn.scrollHeight;
    }
    const totals = entries.reduce(
      (acc, entry) => {
        acc.datapoints += entry.sequence_count || 0;
        acc.images += entry.image_count || 0;
        acc.trajectory += entry.trajectory_length_m || 0;
        return acc;
      },
      { datapoints: 0, images: 0, trajectory: 0 }
    );
    totals.villages = entries.length;
    updateTotals(totals);
    show();
  };

  return {
    render,
    hide,
    setHover: (id) => {
      updateCardHover(id);
    },
  };
};

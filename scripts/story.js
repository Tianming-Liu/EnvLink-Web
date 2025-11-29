import { clamp } from "./utils.js";

const LINE_SCROLL_DISTANCE = 1200;
const LINE_HIGHLIGHT_DURATION = 2.5;
const LINE_RESTORE_DURATION = 0.8;
const LINE_HIGHLIGHT_STAGGER = 1.4;
const POST_SCROLL_HOLD = 2;
const BLOCK_VIEWPORT_RATIO = 1.05;
const SESSION_VISIBILITY_THRESHOLD = 0.95;
const BASE_EASE = "power1.out";

const clampProgress = (value) => clamp(value, 0, 1);
const TEXT_BASE_COLOR = "#333333";
const TEXT_HIGHLIGHT_COLOR = "#bbbbbbca";
const ACCENT_BASE_COLOR = "#333333";
const ACCENT_HIGHLIGHT_COLOR = "#ec38bcca";
const TEXT_FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

const applyBlockHeights = (blocks) => {
  const viewport = window.innerHeight || 1;
  const minHeight = viewport * BLOCK_VIEWPORT_RATIO;
  blocks.forEach((block) => {
    block.style.minHeight = `${minHeight}px`;
  });
};

const setCardState = (card, progress) => {
  if (!card) {
    return;
  }
  const clamped = clampProgress(progress);
  const isComplete = clamped >= 1;
  const isCurrent = clamped > 0 && !isComplete;
  card.classList.toggle("is-current", isCurrent);
  card.classList.toggle("is-complete", isComplete);
};

export const setupStoryTimeline = () => {
  const storyEl = document.querySelector(".story");
  const bodyEl = document.body;
  const storyBlocks = Array.from(document.querySelectorAll(".story-block"));
  const hudRefs = {
    left: document.getElementById("hudLeft"),
    right: document.getElementById("hudRight"),
    hint: document.getElementById("scrollHint"),
    legend: document.getElementById("batchLegend"),
    intro: document.getElementById("introOverlay"),
  };

  let hasSessionStarted = false;
  let sessionVisible = false;
  let hudHandler = null;
  let resizeHandler = null;

  const updateHUD = () => {
    const scrollY =
      window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const hideHud = scrollY > window.innerHeight * 0.2;
    const hideIntro = scrollY > window.innerHeight * 0.15;
    if (hudRefs.left) hudRefs.left.classList.toggle("is-hidden", hideHud);
    if (hudRefs.right) hudRefs.right.classList.toggle("is-hidden", hideHud);
    if (hudRefs.hint) hudRefs.hint.classList.toggle("is-hidden", hideHud);
    if (hudRefs.legend) hudRefs.legend.classList.toggle("is-hidden", hideHud);
    if (hudRefs.intro) hudRefs.intro.classList.toggle("is-hidden", hideIntro);
  };

  const updateSessionVisibility = (progress) => {
    const shouldShowSessions = progress >= SESSION_VISIBILITY_THRESHOLD;
    if (shouldShowSessions && !hasSessionStarted) {
      hasSessionStarted = true;
      window.dispatchEvent(new CustomEvent("envlink:session-start"));
    }
    if (sessionVisible === shouldShowSessions) {
      return;
    }
    sessionVisible = shouldShowSessions;
    if (storyEl) {
      storyEl.classList.toggle("is-session-active", shouldShowSessions);
    }
    if (bodyEl) {
      bodyEl.classList.toggle("is-session-active", shouldShowSessions);
    }
    window.dispatchEvent(
      new CustomEvent("envlink:session-visibility", {
        detail: { visible: shouldShowSessions },
      })
    );
  };

  const buildBlockTimeline = (block, index, totalBlocks, gsapInstance, ScrollTrigger) => {
    const card = block.querySelector(".story-card");
    const isSensorBlock = block.classList.contains("story-block--sensors");
    const items = isSensorBlock
      ? []
      : Array.from(block.querySelectorAll("[data-story-item]"));
    const itemCount = Math.max(items.length || 1, 1);
    const scrollDistance = (itemCount || 1) * LINE_SCROLL_DISTANCE;
    const highlightDuration = LINE_HIGHLIGHT_DURATION;
    const isFinalBlock = index === totalBlocks - 1;

    if (items.length) {
      const baseProps = isSensorBlock
        ? { opacity: 0.35, scale: 1 }
        : {
            opacity: 0.25,
            scale: 1,
            color: TEXT_BASE_COLOR,
            fontFamily: TEXT_FONT,
            "--accent-color": ACCENT_BASE_COLOR,
          };
      gsapInstance.set(items, baseProps);
    }

    const timeline = gsapInstance.timeline({
      scrollTrigger: {
        trigger: block,
        start: "center center",
        end: () => `+=${scrollDistance}`,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        invalidateOnRefresh: true,
        onToggle: ({ isActive }) => {
          block.classList.toggle("is-active", isActive);
        },
        onUpdate: (self) => {
          const progress = clampProgress(self.progress);
          setCardState(card, progress);
          if (isFinalBlock) {
            updateSessionVisibility(progress);
          }
        },
      },
    });

    if (items.length) {
      const baseProps = isSensorBlock
        ? { opacity: 0.35, scale: 1 }
        : {
            opacity: 0.25,
            scale: 1,
            color: TEXT_BASE_COLOR,
            fontFamily: TEXT_FONT,
            "--accent-color": ACCENT_BASE_COLOR,
          };
      const highlightProps = isSensorBlock
        ? { opacity: 1, scale: 1.02 }
        : {
            opacity: 1,
            color: TEXT_HIGHLIGHT_COLOR,
            scale: 1.03,
            "--accent-color": ACCENT_HIGHLIGHT_COLOR,
          };
      timeline.to(items, {
        keyframes: [
          { ...highlightProps, duration: highlightDuration, ease: BASE_EASE },
          {
            ...baseProps,
            duration: LINE_RESTORE_DURATION,
            ease: BASE_EASE,
          },
        ],
        stagger: LINE_HIGHLIGHT_STAGGER,
      });
    } else {
      timeline.to({}, { duration: highlightDuration });
    }

    timeline.to({}, { duration: POST_SCROLL_HOLD, ease: "none" });
  };

  const attachHudListeners = () => {
    if (hudHandler) {
      return;
    }
    hudHandler = () => updateHUD();
    window.addEventListener("scroll", hudHandler, { passive: true });
    updateHUD();
  };

  const detachHudListeners = () => {
    if (!hudHandler) {
      return;
    }
    window.removeEventListener("scroll", hudHandler);
    hudHandler = null;
  };

  const destroyResizeListener = () => {
    if (!resizeHandler) {
      return;
    }
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  };

  return {
    initStory: () => {
      const gsapInstance = window?.gsap;
      const ScrollTrigger = window?.ScrollTrigger;
      if (!storyEl || !gsapInstance || !ScrollTrigger) {
        console.warn("GSAP ScrollTrigger 未加载，无法初始化叙事滚动。");
        return;
      }
      gsapInstance.registerPlugin(ScrollTrigger);
      applyBlockHeights(storyBlocks);
      storyBlocks.forEach((block, index) =>
        buildBlockTimeline(block, index, storyBlocks.length, gsapInstance, ScrollTrigger)
      );
      attachHudListeners();
      resizeHandler = () => {
        applyBlockHeights(storyBlocks);
        ScrollTrigger.refresh();
      };
      window.addEventListener("resize", resizeHandler);
      ScrollTrigger.refresh();
      requestAnimationFrame(() => {
        if (hudRefs.intro) {
          hudRefs.intro.classList.add("is-visible");
        }
      });
    },
    revealStory: () => {
      if (storyEl) {
        storyEl.classList.remove("is-loading");
      }
    },
    refresh: () => {
      if (window?.ScrollTrigger) {
        window.ScrollTrigger.refresh();
      } else {
        updateHUD();
      }
    },
    destroy: () => {
      detachHudListeners();
      destroyResizeListener();
      if (window?.ScrollTrigger) {
        window.ScrollTrigger.getAll().forEach((instance) => instance.kill());
      }
    },
  };
};

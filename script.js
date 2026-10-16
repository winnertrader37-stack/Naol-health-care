"use strict";

/* ============================================================
   NAOL HEALTH SCANNER 3D
   File: script.js

   Features:
   - Camera access and photo capture
   - Four-angle capture workflow
   - Three.js illustrative 3D avatar
   - Anatomy education interactions
   - Wellness self-checks
   - Mood journal and fatigue self-assessment
   - Breathing timer
   - Hydration and sleep logs
   - Local settings
   - Report and image exports

   IMPORTANT:
   This application is not a medical diagnostic device.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initNaolHealthScanner();
});

function initNaolHealthScanner() {
  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const STORAGE = {
    settings: "naolHealthSettingsV1",
    mood: "naolHealthMoodV1",
    wellness: "naolHealthWellnessV1",
    hydration: "naolHealthHydrationV1",
    sleep: "naolHealthSleepV1",
    journal: "naolHealthJournalV1"
  };

  const state = {
    cameraStream: null,
    cameraFacing: "user",
    cameraActive: false,
    mirrored: true,
    captures: {
      front: null,
      left: null,
      right: null,
      back: null
    },
    currentAngle: "front",
    scanRunning: false,
    scanProgress: 0,
    scanTimer: null,
    breathingTimer: null,
    breathingInterval: null,
    breathingSeconds: 0,
    breathingRunning: false,
    selectedMood: null,
    three: null,
    threeReady: false,
    threeFailed: false,
    avatar: null,
    animationFrame: null,
    currentAnatomy: "body",
    settings: {
      theme: "dark",
      autoRotate: false,
      showGrid: true,
      mirrorCamera: true,
      cameraResolution: "high",
      rotationSpeed: 1,
      autosave: true
    }
  };

  /* ==========================================================
     SAFE STORAGE
     ========================================================== */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) return fallback;

      return JSON.parse(raw);
    } catch (error) {
      console.warn("Local storage read failed:", error);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Local storage save failed:", error);
      showToast(
        "Data kuusuu hin dandeenye. Browser storage guutuu ta'uu danda'a.",
        "warning"
      );
      return false;
    }
  }

  state.settings = {
    ...state.settings,
    ...readJSON(STORAGE.settings, {})
  };

  /* ==========================================================
     TOAST NOTIFICATIONS
     ========================================================== */

  function showToast(message, type = "info") {
    let container = $("#toastContainer") || $(".toast-container");

    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icon = document.createElement("span");
    icon.textContent =
      type === "success" ? "✓" :
      type === "error" ? "!" :
      type === "warning" ? "⚠" : "ℹ";

    const text = document.createElement("span");
    text.textContent = String(message);

    toast.append(icon, text);
    container.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";

      window.setTimeout(() => toast.remove(), 250);
    }, 3600);
  }

  /* ==========================================================
     GENERAL UTILITIES
     ========================================================== */

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function formatTime(date = new Date()) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function setText(selectors, value) {
    const list = Array.isArray(selectors) ? selectors : [selectors];

    list.forEach(selector => {
      $$(selector).forEach(element => {
        element.textContent = value;
      });
    });
  }

  function setProgress(percent, selectors = [
    "#scanProgress",
    "#progressBar",
    ".progress-bar"
  ]) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));

    selectors.forEach(selector => {
      $$(selector).forEach(element => {
        element.style.width = `${value}%`;
        element.setAttribute("aria-valuenow", String(value));
      });
    });

    setText(
      ["#scanProgressText", "#progressText", "[data-scan-progress-text]"],
      `${Math.round(value)}%`
    );
  }

  function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
      showToast("File uumuun hin danda'amne.", "error");
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadText(text, filename, mime = "text/plain") {
    downloadBlob(
      new Blob([text], { type: `${mime};charset=utf-8` }),
      filename
    );
  }

  function getTodayKey() {
    const now = new Date();

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function isSecureCameraContext() {
    return window.isSecureContext ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
  }

  /* ==========================================================
     NAVIGATION
     ========================================================== */

  function closeSidebar() {
    $(".sidebar")?.classList.remove("open");
    $(".mobile-sidebar-overlay")?.classList.remove("active");
  }

  function openSidebar() {
    $(".sidebar")?.classList.add("open");
    $(".mobile-sidebar-overlay")?.classList.add("active");
  }

  function navigateTo(target) {
    if (!target) return;

    const normalized = String(target).replace(/^#/, "");

    let section =
      document.getElementById(normalized) ||
      $(`[data-section="${normalized}"]`);

    if (!section && normalized.startsWith("section-")) {
      section = document.getElementById(normalized);
    }

    if (!section) {
      showToast("Kutaan barbaadde HTML keessatti hin argamne.", "warning");
      return;
    }

    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start"
    });

    closeSidebar();

    $$(".nav-link, .sidebar-nav a, .sidebar-nav button").forEach(link => {
      const linkTarget =
        link.dataset.target ||
        link.dataset.section ||
        link.getAttribute("href")?.replace(/^#/, "");

      link.classList.toggle("active", linkTarget === normalized);
    });
  }

  function initNavigation() {
    const menuButton =
      $("#menuToggle") ||
      $(".menu-toggle") ||
      $('[data-action="menu"]');

    menuButton?.addEventListener("click", () => {
      const sidebar = $(".sidebar");

      if (sidebar?.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    $(".mobile-sidebar-overlay")?.addEventListener("click", closeSidebar);

    $$("[data-target], [data-section-target], .nav-link").forEach(element => {
      element.addEventListener("click", event => {
        const target =
          element.dataset.target ||
          element.dataset.sectionTarget ||
          element.dataset.section ||
          element.getAttribute("href")?.replace(/^#/, "");

        if (!target) return;

        const destination =
          document.getElementById(target) ||
          $(`[data-section="${target}"]`);

        if (destination) {
          event.preventDefault();
          navigateTo(target);
        }
      });
    });

    $$('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener("click", event => {
        const target = anchor.getAttribute("href")?.slice(1);

        if (!target) return;

        if (document.getElementById(target)) {
          event.preventDefault();
          navigateTo(target);
        }
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeSidebar();
        closeAllDialogs();
      }
    });
  }

  /* ==========================================================
     DIALOGS / MODALS
     ========================================================== */

  function closeAllDialogs() {
    $$("dialog[open]").forEach(dialog => {
      dialog.close();
    });

    $$(".modal.open").forEach(modal => {
      modal.classList.remove("open");
    });
  }

  function openDialog(dialog) {
    if (!dialog) return;

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.classList.add("open");
    }
  }

  function initDialogs() {
    $$("[data-open-dialog]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.openDialog;
        openDialog(document.getElementById(id));
      });
    });

    $$("[data-close-dialog]").forEach(button => {
      button.addEventListener("click", () => {
        const dialog = button.closest("dialog");

        if (dialog?.open) dialog.close();

        button.closest(".modal")?.classList.remove("open");
      });
    });

    $$("dialog").forEach(dialog => {
      dialog.addEventListener("click", event => {
        if (event.target === dialog) {
          dialog.close();
        }
      });
    });
  }

  /* ==========================================================
     THEME AND SETTINGS
     ========================================================== */

  function applyTheme(theme) {
    const selected = theme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme = selected;
    state.settings.theme = selected;

    $$('[data-setting="theme"]').forEach(select => {
      select.value = selected;
    });

    const themeButton = $("#themeToggle");

    if (themeButton) {
      themeButton.textContent = selected === "dark" ? "☀️" : "🌙";
      themeButton.setAttribute(
        "aria-label",
        selected === "dark" ? "Light theme" : "Dark theme"
      );
    }

    saveJSON(STORAGE.settings, state.settings);
  }

  function initSettings() {
    applyTheme(state.settings.theme);

    const themeButton =
      $("#themeToggle") ||
      $('[data-action="theme-toggle"]');

    themeButton?.addEventListener("click", () => {
      applyTheme(state.settings.theme === "dark" ? "light" : "dark");
    });

    $$('[data-setting="theme"]').forEach(select => {
      select.addEventListener("change", () => {
        applyTheme(select.value);
      });
    });

    $$("[data-setting]").forEach(element => {
      const key = element.dataset.setting;

      if (!(key in state.settings) || key === "theme") return;

      if (element.type === "checkbox") {
        element.checked = Boolean(state.settings[key]);
      } else {
        element.value = String(state.settings[key]);
      }

      const updateSetting = () => {
        let value;

        if (element.type === "checkbox") {
          value = element.checked;
        } else if (element.type === "range" || element.type === "number") {
          value = Number(element.value);
        } else {
          value = element.value;
        }

        state.settings[key] = value;
        saveJSON(STORAGE.settings, state.settings);

        if (key === "mirrorCamera") {
          state.mirrored = Boolean(value);
          applyCameraMirror();
        }

        if (key === "autoRotate" && state.three) {
          state.three.controls.autoRotate = Boolean(value);
        }

        if (key === "rotationSpeed" && state.three) {
          state.three.controls.autoRotateSpeed = Number(value);
        }

        if (key === "showGrid" && state.three) {
          if (state.three.grid) {
            state.three.grid.visible = Boolean(value);
          }
        }
      };

      element.addEventListener("change", updateSetting);
      element.addEventListener("input", updateSetting);
    });

    $("#clearLocalData")?.addEventListener("click", clearLocalData);
    $('[data-action="clear-data"]')?.addEventListener("click", clearLocalData);
  }

  function clearLocalData() {
    const confirmed = window.confirm(
      "Data Naol Health Scanner 3D browser keessatti kuufame hunda haqxuuf mirkaneessaa?"
    );

    if (!confirmed) return;

    Object.values(STORAGE).forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(error);
      }
    });

    state.captures = {
      front: null,
      left: null,
      right: null,
      back: null
    };

    renderCaptures();
    renderMoodHistory();
    renderHydrationHistory();
    renderSleepHistory();

    state.settings = {
      theme: "dark",
      autoRotate: false,
      showGrid: true,
      mirrorCamera: true,
      cameraResolution: "high",
      rotationSpeed: 1,
      autosave: true
    };

    saveJSON(STORAGE.settings, state.settings);
    applyTheme("dark");

    showToast("Data browser keessatti kuufame haqame.", "success");
  }

  /* ==========================================================
     CAMERA
     ========================================================== */

  function getVideoElement() {
    return (
      $("#cameraVideo") ||
      $("#cameraFeed") ||
      $("#cameraPreview") ||
      $(".camera-stage video")
    );
  }

  function getCameraStage() {
    return $(".camera-stage") || $("#cameraStage");
  }

  function getCameraConstraints() {
    let width = 1280;
    let height = 720;

    if (state.settings.cameraResolution === "low") {
      width = 640;
      height = 480;
    } else if (state.settings.cameraResolution === "medium") {
      width = 960;
      height = 540;
    }

    return {
      audio: false,
      video: {
        facingMode: { ideal: state.cameraFacing },
        width: { ideal: width },
        height: { ideal: height }
      }
    };
  }

  function applyCameraMirror() {
    const video = getVideoElement();

    if (!video) return;

    const mirror =
      state.cameraFacing === "user" &&
      state.settings.mirrorCamera !== false;

    video.style.transform = mirror ? "scaleX(-1)" : "none";
  }

  function setCameraStatus(message, type = "info") {
    const targets = [
      "#cameraStatus",
      "#cameraStatusText",
      "[data-camera-status]"
    ];

    targets.forEach(selector => {
      $$(selector).forEach(element => {
        element.textContent = message;

        if (element.classList.contains("badge")) {
          element.classList.remove(
            "badge-primary",
            "badge-green",
            "badge-red",
            "badge-yellow"
          );

          if (type === "success") {
            element.classList.add("badge-green");
          } else if (type === "error") {
            element.classList.add("badge-red");
          } else if (type === "warning") {
            element.classList.add("badge-yellow");
          } else {
            element.classList.add("badge-primary");
          }
        }
      });
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast(
        "Browser kun camera hin deeggaru. Browser ammayyaa fayyadami.",
        "error"
      );

      setCameraStatus("Camera browser kana irratti hin deeggaramu", "error");
      return;
    }

    if (!isSecureCameraContext()) {
      showToast(
        "Camera banuuf website HTTPS irratti banamuu qaba. GitHub Pages fayyadami.",
        "error"
      );

      setCameraStatus("HTTPS barbaachisa", "error");
      return;
    }

    if (state.cameraActive) {
      showToast("Camera duraanuu banameera.", "info");
      return;
    }

    const video = getVideoElement();

    if (!video) {
      showToast(
        "Video element hin argamne. index.html keessatti #cameraVideo barbaachisa.",
        "error"
      );
      return;
    }

    setCameraStatus("Camera banuuf yaalaa...");

    const startButtons = [
      "#startCamera",
      "#cameraStart",
      '[data-action="start-camera"]'
    ];

    startButtons.forEach(selector => {
      $$(selector).forEach(button => {
        button.disabled = true;
        button.dataset.originalText ||= button.textContent;
        button.textContent = "Camera banamaa jira...";
      });
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getCameraConstraints()
      );

      state.cameraStream = stream;
      state.cameraActive = true;

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      await video.play();

      state.mirrored = state.settings.mirrorCamera;
      applyCameraMirror();

      const placeholder = $(".camera-placeholder");

      if (placeholder) {
        placeholder.hidden = true;
      }

      const grid = $(".camera-grid-overlay");

      if (grid) grid.hidden = false;

      const frame = $(".camera-frame");

      if (frame) frame.hidden = false;

      const stopButtons = [
        "#stopCamera",
        "#cameraStop",
        '[data-action="stop-camera"]'
      ];

      stopButtons.forEach(selector => {
        $$(selector).forEach(button => {
          button.disabled = false;
        });
      });

      startButtons.forEach(selector => {
        $$(selector).forEach(button => {
          button.disabled = false;
          button.textContent = button.dataset.originalText || "Start Camera";
        });
      });

      setCameraStatus("Camera hojiirra jira", "success");
      showToast("Camera milkaa'inaan baname.", "success");
    } catch (error) {
      console.error("Camera error:", error);

      state.cameraStream = null;
      state.cameraActive = false;

      startButtons.forEach(selector => {
        $$(selector).forEach(button => {
          button.disabled = false;
          button.textContent = button.dataset.originalText || "Start Camera";
        });
      });

      let message = "Camera banuun hin danda'amne.";

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        message =
          "Hayyama camera kenni. Browser Settings keessatti camera permission ilaali.";
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        message = "Camera bilbilaa hin argamne.";
      } else if (error.name === "NotReadableError") {
        message =
          "Camera app biraan fayyadamaa jiraachuu danda'a. App sana cufiitii irra deebi'i.";
      }

      setCameraStatus(message, "error");
      showToast(message, "error");
    }
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => {
        track.stop();
      });
    }

    state.cameraStream = null;
    state.cameraActive = false;

    const video = getVideoElement();

    if (video) {
      video.pause();
      video.srcObject = null;
      video.style.transform = "none";
    }

    const placeholder = $(".camera-placeholder");

    if (placeholder) {
      placeholder.hidden = false;
    }

    const grid = $(".camera-grid-overlay");

    if (grid) grid.hidden = true;

    const frame = $(".camera-frame");

    if (frame) frame.hidden = true;

    [
      "#startCamera",
      "#cameraStart",
      '[data-action="start-camera"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Start Camera";
      });
    });

    [
      "#stopCamera",
      "#cameraStop",
      '[data-action="stop-camera"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.disabled = true;
      });
    });

    setCameraStatus("Camera cufameera");
  }

  function switchCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera hin deeggaramu.", "error");
      return;
    }

    const wasActive = state.cameraActive;

    state.cameraFacing =
      state.cameraFacing === "user" ? "environment" : "user";

    if (wasActive) {
      stopCamera();

      window.setTimeout(() => {
        startCamera();
      }, 150);
    } else {
      state.mirrored = state.cameraFacing === "user";
      showToast(
        state.cameraFacing === "user"
          ? "Front camera filatame."
          : "Rear camera filatame. Amma Start Camera tuqi.",
        "info"
      );
    }
  }

  function capturePhoto(angle = state.currentAngle) {
    const video = getVideoElement();

    if (!state.cameraActive || !video || video.readyState < 2) {
      showToast(
        "Dura camera bani, achiis suuraa qabi.",
        "warning"
      );
      return null;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      showToast("Suuraa qabachuuf video hin qophoofne.", "warning");
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      showToast("Canvas hin deeggaramu.", "error");
      return null;
    }

    const mirror =
      state.cameraFacing === "user" &&
      state.settings.mirrorCamera !== false;

    if (mirror) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, width, height);

    canvas.toBlob(blob => {
      if (!blob) {
        showToast("Suuraa file gochuun hin danda'amne.", "error");
        return;
      }

      state.captures[angle] = {
        blob,
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        width,
        height,
        capturedAt: new Date().toISOString()
      };

      renderCaptures();
      updateCaptureProgress();

      showToast(
        `${angleLabel(angle)} suuraa qabame.`,
        "success"
      );
    }, "image/jpeg", 0.9);

    return canvas;
  }

  function angleLabel(angle) {
    const labels = {
      front: "Fuuldura",
      left: "Bitaa",
      right: "Mirga",
      back: "Duuba"
    };

    return labels[angle] || angle;
  }

  function renderCaptures() {
    Object.entries(state.captures).forEach(([angle, capture]) => {
      const selectors = [
        `#capture-${angle}`,
        `#capture${angle.charAt(0).toUpperCase()}${angle.slice(1)}`,
        `[data-capture="${angle}"]`
      ];

      selectors.forEach(selector => {
        $$(selector).forEach(slot => {
          slot.classList.toggle("has-capture", Boolean(capture));

          if (!capture) {
            const title = angleLabel(angle);

            slot.replaceChildren();

            const icon = document.createElement("span");
            icon.textContent = "＋";

            const strong = document.createElement("strong");
            strong.textContent = title;

            const small = document.createElement("span");
            small.textContent = "Suuraa hin qabamne";

            slot.append(icon, strong, small);
            return;
          }

          const image = document.createElement("img");
          image.src = capture.dataUrl;
          image.alt = `${angleLabel(angle)} capture`;

          const title = document.createElement("strong");
          title.textContent = angleLabel(angle);

          const small = document.createElement("span");
          small.textContent = "Suuraa qabame";

          slot.replaceChildren(image, title, small);
        });
      });
    });

    updateCaptureProgress();
  }

  function updateCaptureProgress() {
    const count = Object.values(state.captures).filter(Boolean).length;
    const progress = count * 25;

    setProgress(progress);

    setText(
      [
        "#captureCount",
        "#scanCaptureCount",
        "[data-capture-count]"
      ],
      `${count}/4`
    );

    const startButton =
      $("#startScan") ||
      $('[data-action="start-scan"]');

    if (startButton) {
      startButton.disabled = count === 0 || state.scanRunning;
    }
  }

  function deleteCapture(angle) {
    if (!state.captures[angle]) return;

    state.captures[angle] = null;

    renderCaptures();
    showToast(`${angleLabel(angle)} capture haqame.`, "success");
  }

  function downloadCapture(angle) {
    const capture = state.captures[angle];

    if (!capture) {
      showToast("Suuraa kana dura qabachuu qabda.", "warning");
      return;
    }

    downloadBlob(
      capture.blob,
      `naol-health-${angle}-${Date.now()}.jpg`
    );
  }

  function downloadAllCaptures() {
    const captures = Object.entries(state.captures)
      .filter(([, capture]) => capture);

    if (!captures.length) {
      showToast("Suuraa buufachuuf hin jiru.", "warning");
      return;
    }

    captures.forEach(([angle], index) => {
      window.setTimeout(() => downloadCapture(angle), index * 350);
    });
  }

  /* ==========================================================
     SCAN WORKFLOW
     ========================================================== */

  function startScanWorkflow() {
    if (state.scanRunning) return;

    const captures = Object.values(state.captures)
      .filter(Boolean).length;

    if (captures === 0) {
      showToast(
        "Dura camera baniitii yoo xiqqaate suuraa tokko qabi.",
        "warning"
      );
      return;
    }

    state.scanRunning = true;
    state.scanProgress = 0;

    const stage = getCameraStage();

    stage?.classList.add("scanning");

    const statusMessages = [
      "Suuraa qabame qindeessaa...",
      "Suuraa fi framing ilaalamaa...",
      "Scan progress qopheessaa...",
      "Capture workflow xumuramaa jira..."
    ];

    const statusElement = $("#scanStatusText");

    const startButton =
      $("#startScan") ||
      $('[data-action="start-scan"]');

    if (startButton) startButton.disabled = true;

    const step = () => {
      if (!state.scanRunning) return;

      state.scanProgress += 5;

      setProgress(state.scanProgress);

      if (statusElement) {
        const index = Math.min(
          statusMessages.length - 1,
          Math.floor(state.scanProgress / 26)
        );

        statusElement.textContent = statusMessages[index];
      }

      if (state.scanProgress >= 100) {
        stopScanWorkflow(true);
        return;
      }

      state.scanTimer = window.setTimeout(step, 90);
    };

    step();
  }

  function stopScanWorkflow(completed = false) {
    state.scanRunning = false;

    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
      state.scanTimer = null;
    }

    getCameraStage()?.classList.remove("scanning");

    const startButton =
      $("#startScan") ||
      $('[data-action="start-scan"]');

    if (startButton) {
      startButton.disabled = false;
    }

    if (completed) {
      setProgress(100);

      setText(
        ["#scanStatusText", "[data-scan-status]"],
        "Capture workflow xumurameera."
      );

      showToast(
        "Capture workflow xumurameera. Kun 3D medical scan mirkanaa'e jechuu miti.",
        "success"
      );
    }
  }

  /* ==========================================================
     CAMERA EVENT BINDING
     ========================================================== */

  function initCamera() {
    [
      "#startCamera",
      "#cameraStart",
      '[data-action="start-camera"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", startCamera);
      });
    });

    [
      "#stopCamera",
      "#cameraStop",
      '[data-action="stop-camera"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.disabled = true;
        button.addEventListener("click", stopCamera);
      });
    });

    [
      "#switchCamera",
      '[data-action="switch-camera"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", switchCamera);
      });
    });

    [
      "#capturePhoto",
      "#takePhoto",
      '[data-action="capture-photo"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", () => {
          capturePhoto(state.currentAngle);
        });
      });
    });

    [
      "#startScan",
      '[data-action="start-scan"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", startScanWorkflow);
      });
    });

    [
      "#stopScan",
      '[data-action="stop-scan"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", () => {
          stopScanWorkflow(false);
          showToast("Scan workflow dhaabbate.", "info");
        });
      });
    });

    [
      "#downloadCaptures",
      '[data-action="download-captures"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", downloadAllCaptures);
      });
    });

    $$("[data-angle]").forEach(button => {
      button.addEventListener("click", () => {
        const angle = button.dataset.angle;

        if (!["front", "left", "right", "back"].includes(angle)) {
          return;
        }

        state.currentAngle = angle;

        $$("[data-angle]").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        setText(
          ["#currentCaptureAngle", "[data-current-angle]"],
          angleLabel(angle)
        );

        showToast(
          `${angleLabel(angle)} filatame. Amma camera irraa suuraa qabi.`,
          "info"
        );
      });
    });

    $$("[data-delete-capture]").forEach(button => {
      button.addEventListener("click", () => {
        deleteCapture(button.dataset.deleteCapture);
      });
    });

    $$("[data-download-capture]").forEach(button => {
      button.addEventListener("click", () => {
        downloadCapture(button.dataset.downloadCapture);
      });
    });

    [
      "#captureFront",
      "#captureLeft",
      "#captureRight",
      "#captureBack"
    ].forEach((selector, index) => {
      const angles = ["front", "left", "right", "back"];

      $$(selector).forEach(button => {
        button.addEventListener("click", () => {
          state.currentAngle = angles[index];
          capturePhoto(angles[index]);
        });
      });
    });

    const resolution = $("#cameraResolution");

    if (resolution) {
      resolution.value = state.settings.cameraResolution;

      resolution.addEventListener("change", () => {
        state.settings.cameraResolution = resolution.value;

        saveJSON(STORAGE.settings, state.settings);

        if (state.cameraActive) {
          stopCamera();
          window.setTimeout(startCamera, 200);
        }
      });
    }

    window.addEventListener("pagehide", () => {
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
      }
    });
  }

  /* ==========================================================
     THREE.JS VIEWER
     ========================================================== */

  async function loadThreeJS() {
    if (state.threeReady) return true;
    if (state.threeFailed) return false;

    const canvas =
      $("#viewerCanvas") ||
      $("#bodyCanvas") ||
      $(".viewer-stage canvas");

    if (!canvas) {
      state.threeFailed = true;
      console.info("No 3D viewer canvas found.");
      return false;
    }

    try {
      const THREE = await import(
        "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
      );

      const { OrbitControls } = await import(
        "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"
      );

      state.three = {
        THREE,
        OrbitControls,
        canvas,
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        grid: null,
        modelGroup: null,
        anatomyGroup: null,
        lights: []
      };

      createThreeScene();

      state.threeReady = true;

      return true;
    } catch (error) {
      console.warn("Three.js could not be loaded:", error);

      state.threeFailed = true;

      showViewerFallback();

      return false;
    }
  }

  function showViewerFallback() {
    const stage = $(".viewer-stage");

    if (!stage) return;

    let fallback = $("#viewerFallback");

    if (!fallback) {
      fallback = document.createElement("div");
      fallback.id = "viewerFallback";
      fallback.className = "notice warning";
      fallback.textContent =
        "3D viewer fe'uu hin dandeenye. Internet connection ilaali; camera fi wellness tools itti fufu.";
      stage.appendChild(fallback);
    }
  }

  function createThreeScene() {
    const viewer = state.three;
    const THREE = viewer.THREE;
    const canvas = viewer.canvas;

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x07101d);
    scene.fog = new THREE.Fog(0x07101d, 8, 22);

    const camera = new THREE.PerspectiveCamera(
      40,
      1,
      0.1,
      100
    );

    camera.position.set(0, 1.5, 6.5);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power"
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.shadowMap.enabled = false;

    const controls = new viewer.OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.5;
    controls.maxDistance = 11;
    controls.target.set(0, 1.1, 0);
    controls.autoRotate = Boolean(state.settings.autoRotate);
    controls.autoRotateSpeed = Number(state.settings.rotationSpeed) || 1;

    const ambient = new THREE.HemisphereLight(
      0xbbeaff,
      0x101428,
      2.0
    );

    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x83eaff, 2.1);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x7769ff, 2.0, 15);
    rimLight.position.set(-3, 2.5, -2);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(
      10,
      20,
      0x1b5c7a,
      0x163149
    );

    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;

    scene.add(grid);

    viewer.scene = scene;
    viewer.camera = camera;
    viewer.renderer = renderer;
    viewer.controls = controls;
    viewer.grid = grid;
    viewer.lights = [ambient, keyLight, rimLight];

    createIllustrativeAvatar();

    resizeThreeViewer();

    window.addEventListener("resize", resizeThreeViewer);

    const animate = () => {
      state.animationFrame = requestAnimationFrame(animate);

      if (!state.threeReady || !state.three) return;

      if (state.avatar && state.settings.autoRotate) {
        state.avatar.rotation.y +=
          0.0015 * Number(state.settings.rotationSpeed || 1);
      }

      state.three.controls.update();
      state.three.renderer.render(
        state.three.scene,
        state.three.camera
      );
    };

    animate();

    initViewerControls();
  }

  function makeMaterial(color, options = {}) {
    const THREE = state.three.THREE;

    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.56,
      metalness: 0.12,
      ...options
    });
  }

  function createEllipsoid(
    parent,
    name,
    color,
    position,
    scale,
    options = {}
  ) {
    const THREE = state.three.THREE;

    const geometry = new THREE.SphereGeometry(1, 24, 18);
    const material = makeMaterial(color, options);

    const mesh = new THREE.Mesh(geometry, material);

    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);

    parent.add(mesh);

    return mesh;
  }

  function createLimb(
    parent,
    name,
    color,
    start,
    end,
    radiusTop,
    radiusBottom
  ) {
    const THREE = state.three.THREE;

    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);

    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();

    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      length,
      14
    );

    const mesh = new THREE.Mesh(
      geometry,
      makeMaterial(color)
    );

    mesh.name = name;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );

    parent.add(mesh);

    return mesh;
  }

  function createIllustrativeAvatar() {
    const THREE = state.three.THREE;

    const group = new THREE.Group();
    group.name = "NaolIllustrativeAvatar";

    const skin = 0x8bd9e8;
    const suit = 0x1d4567;
    const accent = 0x48e0ff;
    const dark = 0x12263a;

    // Head
    createEllipsoid(
      group,
      "Illustrative head",
      skin,
      [0, 2.66, 0],
      [0.24, 0.31, 0.22]
    );

    // Neck
    createLimb(
      group,
      "Neck",
      skin,
      [0, 2.30, 0],
      [0, 2.43, 0],
      0.09,
      0.10
    );

    // Torso
    createEllipsoid(
      group,
      "Upper torso",
      suit,
      [0, 1.90, 0],
      [0.43, 0.48, 0.24]
    );

    createEllipsoid(
      group,
      "Lower torso",
      dark,
      [0, 1.38, 0],
      [0.32, 0.27, 0.20]
    );

    // Shoulder joints
    createEllipsoid(
      group,
      "Left shoulder",
      accent,
      [-0.43, 2.14, 0],
      [0.13, 0.14, 0.13]
    );

    createEllipsoid(
      group,
      "Right shoulder",
      accent,
      [0.43, 2.14, 0],
      [0.13, 0.14, 0.13]
    );

    // Arms
    createLimb(
      group,
      "Left upper arm",
      skin,
      [-0.44, 2.1, 0],
      [-0.59, 1.63, 0.01],
      0.105,
      0.075
    );

    createLimb(
      group,
      "Left forearm",
      skin,
      [-0.59, 1.63, 0.01],
      [-0.62, 1.15, 0.06],
      0.075,
      0.055
    );

    createLimb(
      group,
      "Right upper arm",
      skin,
      [0.44, 2.1, 0],
      [0.59, 1.63, 0.01],
      0.105,
      0.075
    );

    createLimb(
      group,
      "Right forearm",
      skin,
      [0.59, 1.63, 0.01],
      [0.62, 1.15, 0.06],
      0.075,
      0.055
    );

    // Hands
    createEllipsoid(
      group,
      "Left hand",
      skin,
      [-0.62, 1.07, 0.06],
      [0.07, 0.11, 0.065]
    );

    createEllipsoid(
      group,
      "Right hand",
      skin,
      [0.62, 1.07, 0.06],
      [0.07, 0.11, 0.065]
    );

    // Legs
    createLimb(
      group,
      "Left thigh",
      suit,
      [-0.16, 1.24, 0],
      [-0.18, 0.70, 0],
      0.16,
      0.12
    );

    createLimb(
      group,
      "Left shin",
      suit,
      [-0.18, 0.70, 0],
      [-0.18, 0.15, 0.02],
      0.105,
      0.075
    );

    createLimb(
      group,
      "Right thigh",
      suit,
      [0.16, 1.24, 0],
      [0.18, 0.70, 0],
      0.16,
      0.12
    );

    createLimb(
      group,
      "Right shin",
      suit,
      [0.18, 0.70, 0],
      [0.18, 0.15, 0.02],
      0.105,
      0.075
    );

    // Feet
    createEllipsoid(
      group,
      "Left foot",
      dark,
      [-0.18, 0.08, 0.09],
      [0.13, 0.07, 0.22]
    );

    createEllipsoid(
      group,
      "Right foot",
      dark,
      [0.18, 0.08, 0.09],
      [0.13, 0.07, 0.22]
    );

    // Chest marker
    createEllipsoid(
      group,
      "Chest marker",
      accent,
      [0, 1.96, 0.236],
      [0.045, 0.045, 0.025],
      {
        emissive: 0x1688a8,
        emissiveIntensity: 0.7
      }
    );

    // Ground ring
    const ringGeometry = new THREE.TorusGeometry(0.75, 0.012, 8, 64);

    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x38d8ff,
        transparent: true,
        opacity: 0.5
      })
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.015;

    group.add(ring);

    state.three.scene.add(group);

    state.three.modelGroup = group;
    state.avatar = group;

    // Make educational anatomy parts available.
    createEducationalAnatomy();
  }

  function createEducationalAnatomy() {
    const THREE = state.three.THREE;
    const group = new THREE.Group();

    group.name = "EducationalAnatomyIllustration";
    group.visible = false;

    const transparentMaterial = color =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.08,
        transparent: true,
        opacity: 0.9
      });

    // Generic educational illustrations only.
    // These are not the user's organs or a medical scan.

    createEllipsoid(
      group,
      "Educational heart illustration",
      0xff536c,
      [-0.12, 1.9, 0.22],
      [0.12, 0.16, 0.10],
      {
        emissive: 0x5a0716,
        emissiveIntensity: 0.3
      }
    );

    createEllipsoid(
      group,
      "Educational left lung",
      0x6a9dff,
      [-0.17, 1.92, 0.10],
      [0.13, 0.25, 0.08],
      transparentMaterial(0x6a9dff)
    );

    createEllipsoid(
      group,
      "Educational right lung",
      0x6a9dff,
      [0.17, 1.92, 0.10],
      [0.13, 0.25, 0.08],
      transparentMaterial(0x6a9dff)
    );

    createEllipsoid(
      group,
      "Educational brain illustration",
      0xc9a1ff,
      [0, 2.68, 0.03],
      [0.19, 0.19, 0.18],
      {
        emissive: 0x35115f,
        emissiveIntensity: 0.3
      }
    );

    state.three.scene.add(group);
    state.three.anatomyGroup = group;
  }

  function resizeThreeViewer() {
    if (!state.three) return;

    const viewer = state.three;
    const canvas = viewer.canvas;
    const parent = canvas.parentElement;

    if (!parent) return;

    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight || 430);

    viewer.camera.aspect = width / height;
    viewer.camera.updateProjectionMatrix();

    viewer.renderer.setSize(width, height, false);
  }

  function setViewerPreset(preset) {
    if (!state.threeReady || !state.three) {
      showToast("3D viewer qophaa'aa miti.", "warning");
      return;
    }

    const { THREE, camera, controls } = state.three;

    const presets = {
      front: [0, 1.5, 6.5],
      back: [0, 1.5, -6.5],
      left: [-6.5, 1.5, 0],
      right: [6.5, 1.5, 0],
      top: [0, 7, 0.01]
    };

    const position = presets[preset];

    if (!position) return;

    camera.position.set(...position);

    controls.target.set(0, 1.3, 0);
    controls.update();

    $$("[data-view]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view === preset
      );
    });
  }

  function resetViewer() {
    if (!state.threeReady || !state.three) return;

    state.three.camera.position.set(0, 1.5, 6.5);
    state.three.controls.target.set(0, 1.1, 0);
    state.three.controls.update();

    if (state.avatar) {
      state.avatar.rotation.set(0, 0, 0);
      state.avatar.scale.set(1, 1, 1);
    }

    showToast("3D viewer reset godhame.", "success");
  }

  function initViewerControls() {
    $$("[data-view]").forEach(button => {
      button.addEventListener("click", () => {
        setViewerPreset(button.dataset.view);
      });
    });

    [
      "#resetViewer",
      '[data-action="reset-viewer"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", resetViewer);
      });
    });

    [
      "#autoRotate",
      '[data-action="toggle-rotation"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", () => {
          if (!state.three) {
            showToast("3D viewer qophaa'aa miti.", "warning");
            return;
          }

          state.settings.autoRotate = !state.settings.autoRotate;

          state.three.controls.autoRotate =
            state.settings.autoRotate;

          saveJSON(STORAGE.settings, state.settings);

          button.classList.toggle(
            "active",
            state.settings.autoRotate
          );

          showToast(
            state.settings.autoRotate
              ? "Auto-rotate baname."
              : "Auto-rotate cufame.",
            "success"
          );
        });
      });
    });

    const zoomRange = $("#viewerZoom");

    zoomRange?.addEventListener("input", () => {
      if (!state.three) return;

      const zoom = Number(zoomRange.value) || 6.5;

      const direction = state.three.camera.position.clone()
        .sub(state.three.controls.target)
        .normalize();

      state.three.camera.position.copy(
        state.three.controls.target.clone().addScaledVector(
          direction,
          zoom
        )
      );
    });

    const rotationRange = $("#rotationSpeed");

    rotationRange?.addEventListener("input", () => {
      state.settings.rotationSpeed = Number(rotationRange.value) || 1;

      if (state.three) {
        state.three.controls.autoRotateSpeed =
          state.settings.rotationSpeed;
      }

      saveJSON(STORAGE.settings, state.settings);
    });
  }

  /* ==========================================================
     ANATOMY LAB
     ========================================================== */

  const anatomyInformation = {
    body: {
      title: "Human Body",
      description:
        "Qaama namaa waliigalaa akka barnootaatti agarsiisa. Kun scan dhuunfaa ykn madaallii fayyaa miti."
    },
    skeleton: {
      title: "Skeleton",
      description:
        "Sirna lafee namaa irratti barnoota waliigalaa. Fakkii barnootaaf qophaa'e malee lafee nama tokkoo irraa hin scan'amne."
    },
    muscles: {
      title: "Muscular System",
      description:
        "Maashaa fi sochii qaamaa ilaalchisee fakkii barnootaa waliigalaa."
    },
    heart: {
      title: "Heart",
      description:
        "Bakka onnee fakkeenyaaf agarsiisa. Heart rate ykn dhibee onnee hin safaru."
    },
    lungs: {
      title: "Lungs",
      description:
        "Somba ilaalchisee fakkii barnootaa waliigalaa. Oxygen ykn hojii sombaa hin safaru."
    },
    brain: {
      title: "Brain",
      description:
        "Sammuu ilaalchisee fakkii barnootaa. Depression ykn dhibee sammuu hin adda baasu."
    },
    digestive: {
      title: "Digestive System",
      description:
        "Sirna nyaata bullaa'uu barnootaaf ibsu."
    },
    nervous: {
      title: "Nervous System",
      description:
        "Sirna narvii ilaalchisee ibsa barnootaa waliigalaa."
    },
    circulatory: {
      title: "Circulatory System",
      description:
        "Sirna dhiigaa ilaalchisee barnoota waliigalaa."
    }
  };

  function selectAnatomy(name) {
    const info = anatomyInformation[name];

    if (!info) {
      showToast("Anatomy system kana hin arganne.", "warning");
      return;
    }

    state.currentAnatomy = name;

    $$("[data-anatomy]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.anatomy === name
      );
    });

    setText(
      ["#anatomyTitle", "[data-anatomy-title]"],
      info.title
    );

    const description =
      $("#anatomyDescription") ||
      $("[data-anatomy-description]");

    if (description) {
      description.textContent = info.description;
    }

    if (state.threeReady && state.three) {
      if (state.avatar) {
        state.avatar.visible = name === "body";
      }

      if (state.three.anatomyGroup) {
        state.three.anatomyGroup.visible = name !== "body";
      }

      // Give the anatomy illustration a different accent color.
      if (state.three.anatomyGroup) {
        const materialColors = {
          skeleton: 0xd9e8f5,
          muscles: 0xd95b6a,
          heart: 0xff536c,
          lungs: 0x6a9dff,
          brain: 0xc9a1ff,
          digestive: 0xf4b96c,
          nervous: 0xffd66b,
          circulatory: 0xf05a72
        };

        const selectedColor = materialColors[name];

        state.three.anatomyGroup.children.forEach(mesh => {
          if (mesh.material?.color && selectedColor) {
            mesh.material.color.setHex(selectedColor);
          }
        });
      }
    }

    showToast(
      `${info.title}: fakkii barnootaa filatame.`,
      "success"
    );
  }

  function initAnatomy() {
    $$("[data-anatomy]").forEach(button => {
      button.addEventListener("click", () => {
        selectAnatomy(button.dataset.anatomy);
      });
    });
  }

  /* ==========================================================
     WELLNESS SCORE HELPERS
     ========================================================== */

  function getSelectedNumber(name) {
    const selected = $(
      `input[name="${name}"]:checked`
    );

    if (!selected) return null;

    const value = Number(selected.value);

    return Number.isFinite(value) ? value : null;
  }

  function getFieldValue(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of list) {
      const element = $(selector);

      if (element && element.value !== "") {
        return element.value;
      }
    }

    return "";
  }

  function calculateFatigueLevel(score) {
    if (score <= 25) {
      return {
        label: "Mallattoo dadhabbii xiqqaa",
        className: "success",
        advice:
          "Yeroo ammaa deebiin kee mallattoo dadhabbii muraasa agarsiisa. Hirriba gaarii, boqonnaa fi nyaata madaalawaa itti fufi."
      };
    }

    if (score <= 55) {
      return {
        label: "Mallattoo dadhabbii giddu-galeessaa",
        className: "warning",
        advice:
          "Dadhabbiin tokko tokko jiraachuu danda'a. Hirriba, hojii, bishaan dhuguu fi stress kee ilaali. Yoo itti fufe, ogeessa fayyaa mari'adhu."
      };
    }

    return {
      label: "Mallattoo dadhabbii baay'ee",
      className: "danger",
      advice:
        "Deebiin kee dadhabbii cimaa ofiin gabaafte agarsiisa; kun diagnosis miti. Yoo dadhabbiin kun cimaa ta'e, haaraa ta'e ykn jireenya kee miidhe, ogeessa fayyaa qunnami."
    };
  }

  /* ==========================================================
     VITALITY / FATIGUE SELF-CHECK
     ========================================================== */

  function runVitalityCheck() {
    const names = [
      "fatigue",
      "sleepQuality",
      "energy",
      "stress",
      "focus"
    ];

    const values = names.map(getSelectedNumber);

    if (values.some(value => value === null)) {
      showToast(
        "Gaaffilee dadhabbii hunda deebisi.",
        "warning"
      );
      return;
    }

    // Each response is expected to be 0..3.
    const normalized = values.map(value =>
      Math.max(0, Math.min(3, value))
    );

    const score = Math.round(
      normalized.reduce((sum, value) => sum + value, 0) /
      (normalized.length * 3) * 100
    );

    const result = calculateFatigueLevel(score);

    const resultContainer =
      $("#vitalityResult") ||
      $("#fatigueResult") ||
      $("[data-vitality-result]");

    const resultTitle =
      $("#vitalityResultTitle") ||
      $("[data-vitality-result-title]");

    const resultDescription =
      $("#vitalityResultDescription") ||
      $("[data-vitality-result-description]");

    if (resultContainer) {
      resultContainer.classList.remove(
        "success",
        "warning",
        "danger"
      );

      resultContainer.classList.add(result.className);
      resultContainer.hidden = false;
    }

    if (resultTitle) {
      resultTitle.textContent = result.label;
    }

    if (resultDescription) {
      resultDescription.textContent =
        `${result.advice} Of-madaallii kee: ${score}/100.`;
    }

    setText(
      ["#vitalityScore", "[data-vitality-score]"],
      `${score}/100`
    );

    const record = {
      date: new Date().toISOString(),
      score,
      label: result.label
    };

    const history = readJSON(STORAGE.wellness, []);

    history.unshift(record);

    saveJSON(STORAGE.wellness, history.slice(0, 60));

    showToast(
      "Vitality self-check xumurame. Bu'aan isaa diagnosis miti.",
      "success"
    );
  }

  function initVitalityCheck() {
    [
      "#runVitalityCheck",
      "#checkFatigue",
      '[data-action="vitality-check"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", runVitalityCheck);
      });
    });
  }

  /* ==========================================================
     MENTAL WELLNESS SELF-CHECK
     ========================================================== */

  function runMoodSelfCheck() {
    const names = [
      "mood",
      "interest",
      "sleep",
      "energy",
      "focus",
      "hopelessness"
    ];

    const values = names.map(getSelectedNumber);

    if (values.some(value => value === null)) {
      showToast(
        "Gaaffilee hunda deebisi; deebii dhiiste jira.",
        "warning"
      );
      return;
    }

    const normalized = values.map(value =>
      Math.max(0, Math.min(3, value))
    );

    const total = normalized.reduce((sum, value) => sum + value, 0);

    const resultContainer =
      $("#moodCheckResult") ||
      $("#mentalWellnessResult") ||
      $("[data-mood-result]");

    const title =
      $("#moodCheckResultTitle") ||
      $("[data-mood-result-title]");

    const description =
      $("#moodCheckResultDescription") ||
      $("[data-mood-result-description]");

    let level;
    let advice;
    let resultClass;

    if (total <= 5) {
      level = "Mallattoo xiqqaa";
      resultClass = "success";
      advice =
        "Deebiin kee gaaffilee kana keessatti rakkoo muraasa agarsiisa. Haa ta'u malee, ofii kee akkamitti akka sitti dhaga'amu xiyyeeffadhu; gaaffileen kun diagnosis miti.";
    } else if (total <= 11) {
      level = "Mallattoo giddu-galeessaa";
      resultClass = "warning";
      advice =
        "Deebiin kee rakkoo miiraa ykn dadhabbii tokko tokko jiraachuu danda'u agarsiisa. Nama amanamtu waliin haasa'i, boqonnaa fudhadhu, yoo itti fufe ogeessa fayyaa sammuu mari'adhu.";
    } else {
      level = "Mallattoo xiyyeeffannoo barbaadu";
      resultClass = "danger";
      advice =
        "Deebiin kee rakkoo miiraa hedduu akka si mudachaa jiru agarsiisuu danda'a. Kun depression diagnosis miti; ogeessa fayyaa ykn counsellor qunnamuun gargaarsa argachuun gaarii dha.";
    }

    if (resultContainer) {
      resultContainer.classList.remove(
        "success",
        "warning",
        "danger"
      );

      resultContainer.classList.add(resultClass);
      resultContainer.hidden = false;
    }

    if (title) {
      title.textContent = level;
    }

    if (description) {
      description.textContent = advice;
    }

    const history = readJSON(STORAGE.mood, []);

    history.unshift({
      date: new Date().toISOString(),
      score: total,
      level
    });

    saveJSON(STORAGE.mood, history.slice(0, 60));

    renderMoodHistory();

    showToast(
      "Self-check xumurame. Kun depression ykn dhukkuba sammuu mirkaneessuuf hin tajaajilu.",
      "success"
    );
  }

  function renderMoodHistory() {
    const history = readJSON(STORAGE.mood, []);

    const container =
      $("#moodHistory") ||
      $("[data-mood-history]");

    if (!container) return;

    container.replaceChildren();

    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Mood self-check galmaa'e hin jiru.";
      container.appendChild(empty);
      return;
    }

    history.slice(0, 10).forEach(item => {
      const entry = document.createElement("div");
      entry.className = "journal-entry";

      const header = document.createElement("div");
      header.className = "journal-entry-header";

      const title = document.createElement("h4");
      title.textContent = item.level || "Mood self-check";

      const date = document.createElement("small");
      date.textContent = formatDate(new Date(item.date));

      const details = document.createElement("p");
      details.textContent =
        `Score of-madaallii: ${item.score ?? "—"}. Kun diagnosis miti.`;

      header.append(title, date);
      entry.append(header, details);

      container.appendChild(entry);
    });
  }

  function initMoodSelfCheck() {
    [
      "#runMoodCheck",
      "#checkMentalWellness",
      '[data-action="mood-check"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", runMoodSelfCheck);
      });
    });

    renderMoodHistory();

    $$("[data-mood]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedMood = button.dataset.mood;

        $$("[data-mood]").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        showToast(
          `Mood kee filatame: ${state.selectedMood}`,
          "success"
        );
      });
    });

    const saveMoodButton =
      $("#saveMood") ||
      $('[data-action="save-mood"]');

    saveMoodButton?.addEventListener("click", () => {
      if (!state.selectedMood) {
        showToast("Dura mood kee filadhu.", "warning");
        return;
      }

      const note =
        getFieldValue(["#moodNote", "#moodJournalNote"]);

      const journal = readJSON(STORAGE.journal, []);

      journal.unshift({
        date: new Date().toISOString(),
        mood: state.selectedMood,
        note: String(note).slice(0, 2000)
      });

      saveJSON(STORAGE.journal, journal.slice(0, 100));

      const textarea = $("#moodNote") || $("#moodJournalNote");

      if (textarea) textarea.value = "";

      showToast("Mood journal browser keessatti kuufame.", "success");

      renderJournal();
    });
  }

  /* ==========================================================
     JOURNAL
     ========================================================== */

  function renderJournal() {
    const container =
      $("#journalHistory") ||
      $("[data-journal-history]");

    if (!container) return;

    const journal = readJSON(STORAGE.journal, []);

    container.replaceChildren();

    if (!journal.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Journal galmaa'e hin jiru.";
      container.appendChild(empty);
      return;
    }

    journal.slice(0, 20).forEach(item => {
      const entry = document.createElement("article");
      entry.className = "journal-entry";

      const header = document.createElement("div");
      header.className = "journal-entry-header";

      const title = document.createElement("h4");
      title.textContent = `Mood: ${item.mood}`;

      const date = document.createElement("small");
      date.textContent = formatDate(new Date(item.date));

      const note = document.createElement("p");
      note.textContent = item.note || "Yaadannoo hin dabalamin.";

      header.append(title, date);
      entry.append(header, note);

      container.appendChild(entry);
    });
  }

  /* ==========================================================
     BREATHING TIMER
     ========================================================== */

  function updateBreathingUI(instruction, seconds) {
    setText(
      [
        "#breathingInstruction",
        "[data-breathing-instruction]"
      ],
      instruction
    );

    setText(
      [
        "#breathingTimer",
        "#breathingSeconds",
        "[data-breathing-timer]"
      ],
      String(seconds)
    );

    const orb = $("#breathingOrb") || $(".breathing-orb");

    if (orb) {
      orb.classList.toggle("active", state.breathingRunning);
    }
  }

  function stopBreathingTimer() {
    state.breathingRunning = false;

    if (state.breathingTimer) {
      clearTimeout(state.breathingTimer);
      state.breathingTimer = null;
    }

    if (state.breathingInterval) {
      clearInterval(state.breathingInterval);
      state.breathingInterval = null;
    }

    updateBreathingUI("Yeroo boqonnaa qopheessi", 0);
  }

  function startBreathingTimer() {
    if (state.breathingRunning) return;

    state.breathingRunning = true;

    const cycle = [
      { label: "Hafuura keessa fudhadhu", seconds: 4 },
      { label: "Hafuura suuta baasi", seconds: 6 }
    ];

    let cycleIndex = 0;
    let remaining = cycle[0].seconds;

    updateBreathingUI(cycle[0].label, remaining);

    const tick = () => {
      if (!state.breathingRunning) return;

      remaining -= 1;

      if (remaining <= 0) {
        cycleIndex = (cycleIndex + 1) % cycle.length;
        remaining = cycle[cycleIndex].seconds;
      }

      updateBreathingUI(
        cycle[cycleIndex].label,
        remaining
      );
    };

    state.breathingInterval = window.setInterval(tick, 1000);

    showToast(
      "Breathing timer jalqabe. Yoo mataa naanna'uun ykn rakkina hafuuraa sitti dhaga'ame, dhaabi.",
      "success"
    );
  }

  function initBreathingTimer() {
    [
      "#startBreathing",
      '[data-action="start-breathing"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", startBreathingTimer);
      });
    });

    [
      "#stopBreathing",
      '[data-action="stop-breathing"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", stopBreathingTimer);
      });
    });
  }

  /* ==========================================================
     HYDRATION TRACKER
     ========================================================== */

  function getHydrationData() {
    const data = readJSON(STORAGE.hydration, {});

    if (data.date !== getTodayKey()) {
      return {
        date: getTodayKey(),
        glasses: 0,
        entries: []
      };
    }

    return {
      date: getTodayKey(),
      glasses: Number(data.glasses) || 0,
      entries: Array.isArray(data.entries) ? data.entries : []
    };
  }

  function updateHydrationUI() {
    const data = getHydrationData();

    setText(
      [
        "#waterCount",
        "#hydrationCount",
        "[data-water-count]"
      ],
      String(data.glasses)
    );

    setText(
      [
        "#waterProgressText",
        "[data-water-progress]"
      ],
      `${data.glasses} glass`
    );

    const progress = Math.min(
      100,
      Math.round((data.glasses / 8) * 100)
    );

    [
      "#waterProgress",
      "#hydrationProgress",
      "[data-water-progress-bar]"
    ].forEach(selector => {
      $$(selector).forEach(element => {
        element.style.width = `${progress}%`;
      });
    });
  }

  function addWater() {
    const data = getHydrationData();

    data.glasses += 1;

    data.entries.unshift({
      date: new Date().toISOString()
    });

    saveJSON(STORAGE.hydration, data);

    updateHydrationUI();
    renderHydrationHistory();

    showToast(
      "Galmeen bishaan dhuguu dabale. Fedhii fi haala fayyaa keetiin madaali.",
      "success"
    );
  }

  function removeWater() {
    const data = getHydrationData();

    if (data.glasses <= 0) {
      showToast("Galmee bishaanii hir'isuuf hin jiru.", "warning");
      return;
    }

    data.glasses -= 1;
    data.entries.shift();

    saveJSON(STORAGE.hydration, data);

    updateHydrationUI();
    renderHydrationHistory();
  }

  function renderHydrationHistory() {
    const container =
      $("#hydrationHistory") ||
      $("[data-hydration-history]");

    if (!container) return;

    const data = getHydrationData();

    container.replaceChildren();

    if (!data.entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Har'a galmeen bishaanii hin jiru.";
      container.appendChild(empty);
      return;
    }

    data.entries.slice(0, 12).forEach(entryData => {
      const entry = document.createElement("div");
      entry.className = "journal-entry";

      const text = document.createElement("p");
      text.textContent =
        `Glass bishaanii — ${formatTime(new Date(entryData.date))}`;

      entry.appendChild(text);
      container.appendChild(entry);
    });
  }

  function initHydration() {
    [
      "#addWater",
      '[data-action="add-water"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", addWater);
      });
    });

    [
      "#removeWater",
      '[data-action="remove-water"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", removeWater);
      });
    });

    updateHydrationUI();
    renderHydrationHistory();
  }

  /* ==========================================================
     SLEEP LOG
     ========================================================== */

  function renderSleepHistory() {
    const container =
      $("#sleepHistory") ||
      $("[data-sleep-history]");

    if (!container) return;

    const records = readJSON(STORAGE.sleep, []);

    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Sleep log galmaa'e hin jiru.";
      container.appendChild(empty);
      return;
    }

    records.slice(0, 15).forEach(record => {
      const entry = document.createElement("div");
      entry.className = "journal-entry";

      const header = document.createElement("div");
      header.className = "journal-entry-header";

      const title = document.createElement("h4");
      title.textContent = `${record.hours} sa'aatii`;

      const date = document.createElement("small");
      date.textContent = formatDate(new Date(record.date));

      const description = document.createElement("p");
      description.textContent =
        `Sleep quality: ${record.quality || "hin ibsamne"}`;

      header.append(title, date);
      entry.append(header, description);

      container.appendChild(entry);
    });
  }

  function initSleepLog() {
    const saveButton =
      $("#saveSleep") ||
      $('[data-action="save-sleep"]');

    saveButton?.addEventListener("click", () => {
      const hours = Number(
        getFieldValue(["#sleepHours", "#sleepDuration"])
      );

      const quality = getFieldValue([
        "#sleepQualityLog",
        "#sleepQualitySelect"
      ]);

      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        showToast(
          "Sa'aatii hirribaa sirriitti galchi (0 hanga 24).",
          "warning"
        );
        return;
      }

      const records = readJSON(STORAGE.sleep, []);

      records.unshift({
        date: new Date().toISOString(),
        hours,
        quality
      });

      saveJSON(STORAGE.sleep, records.slice(0, 100));

      renderSleepHistory();

      showToast("Sleep log browser keessatti kuufame.", "success");
    });

    renderSleepHistory();
  }

  /* ==========================================================
     POSTURE / BODY MEASUREMENT INPUT
     ========================================================== */

  function initMeasurementTools() {
    const form =
      $("#measurementForm") ||
      $('[data-form="measurements"]');

    if (!form) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      const height = Number(
        getFieldValue(["#heightCm", "#userHeight"])
      );

      const weight = Number(
        getFieldValue(["#weightKg", "#userWeight"])
      );

      const result =
        $("#measurementResult") ||
        $("[data-measurement-result]");

      if (!Number.isFinite(height) || height < 50 || height > 260) {
        showToast(
          "Dheerina cm keessatti galchi (50–260 cm).",
          "warning"
        );
        return;
      }

      if (!Number.isFinite(weight) || weight < 10 || weight > 500) {
        showToast(
          "Ulfaatina kg keessatti galchi (10–500 kg).",
          "warning"
        );
        return;
      }

      const bmi = weight / Math.pow(height / 100, 2);

      let category = "Bu'aa kana ogeessa fayyaa waliin mari'adhu.";

      if (bmi < 18.5) {
        category = "BMI gadi-aanaa.";
      } else if (bmi < 25) {
        category = "BMI range waliigalaa keessatti.";
      } else if (bmi < 30) {
        category = "BMI ol-ka'aa.";
      } else {
        category = "BMI baay'ee ol-ka'aa.";
      }

      if (result) {
        result.hidden = false;

        result.textContent =
          `BMI tilmaamaa: ${bmi.toFixed(1)}. ${category} ` +
          "BMI qofa fayyadamuun dhukkuba adda baasuuf hin danda'amu.";
      }

      showToast(
        "BMI shallagame. Kun madaallii fayyaa guutuu miti.",
        "success"
      );
    });
  }

  /* ==========================================================
     FACE / POSE SAFETY
     ========================================================== */

  function initCameraPrivacyNotice() {
    const buttons = $$("[data-action='face-check']");

    buttons.forEach(button => {
      button.addEventListener("click", () => {
        showToast(
          "Website kun fuula arguu danda'a yoo camera fi face-tracking engine sirrii jiraate; fuula qofaan depression, stress ykn dhibee adda baasuu hin danda'u.",
          "warning"
        );
      });
    });

    $$("[data-action='finger-check']").forEach(button => {
      button.addEventListener("click", () => {
        showToast(
          "Screen irratti quba kaa'uun website idilee keessatti depression ykn biometrics fayyaa mirkanaa'oo hin safaru.",
          "warning"
        );
      });
    });
  }

  /* ==========================================================
     REPORT EXPORT
     ========================================================== */

  function buildWellnessReport() {
    const mood = readJSON(STORAGE.mood, []);
    const wellness = readJSON(STORAGE.wellness, []);
    const sleep = readJSON(STORAGE.sleep, []);
    const hydration = getHydrationData();
    const journal = readJSON(STORAGE.journal, []);

    return {
      application: "Naol Health Scanner 3D",
      reportGeneratedAt: new Date().toISOString(),
      notice:
        "This is a self-reported wellness summary, not a medical diagnosis.",
      cameraCaptures: Object.entries(state.captures).map(
        ([angle, capture]) => ({
          angle,
          captured: Boolean(capture),
          capturedAt: capture?.capturedAt || null,
          width: capture?.width || null,
          height: capture?.height || null
        })
      ),
      todayHydration: {
        date: hydration.date,
        glassesLogged: hydration.glasses
      },
      moodSelfChecks: mood.slice(0, 20),
      vitalitySelfChecks: wellness.slice(0, 20),
      sleepLogs: sleep.slice(0, 20),
      moodJournal: journal.slice(0, 20)
    };
  }

  function downloadWellnessReport() {
    const report = buildWellnessReport();

    downloadText(
      JSON.stringify(report, null, 2),
      `naol-wellness-report-${getTodayKey()}.json`,
      "application/json"
    );

    showToast(
      "Wellness report buufatame. Kun diagnosis fayyaa miti.",
      "success"
    );
  }

  function downloadWellnessCSV() {
    const report = buildWellnessReport();

    const rows = [
      ["Section", "Date", "Score / Value", "Description"]
    ];

    report.moodSelfChecks.forEach(item => {
      rows.push([
        "Mood self-check",
        item.date,
        item.score,
        item.level
      ]);
    });

    report.vitalitySelfChecks.forEach(item => {
      rows.push([
        "Vitality self-check",
        item.date,
        item.score,
        item.label
      ]);
    });

    report.sleepLogs.forEach(item => {
      rows.push([
        "Sleep",
        item.date,
        item.hours,
        item.quality || ""
      ]);
    });

    rows.push([
      "Hydration",
      report.todayHydration.date,
      report.todayHydration.glassesLogged,
      "Glasses logged today"
    ]);

    const csv = rows.map(row =>
      row.map(value => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\r\n");

    downloadText(
      csv,
      `naol-wellness-report-${getTodayKey()}.csv`,
      "text/csv"
    );

    showToast("CSV report buufatame.", "success");
  }

  function initExports() {
    [
      "#downloadReport",
      '[data-action="download-report"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", downloadWellnessReport);
      });
    });

    [
      "#downloadCSV",
      '[data-action="download-csv"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", downloadWellnessCSV);
      });
    });

    [
      "#downloadCaptures",
      '[data-action="download-captures"]'
    ].forEach(selector => {
      $$(selector).forEach(button => {
        button.addEventListener("click", downloadAllCaptures);
      });
    });
  }

  /* ==========================================================
     HOME DASHBOARD
     ========================================================== */

  function updateDashboard() {
    setText(
      ["#todayDate", "[data-today-date]"],
      formatDate()
    );

    setText(
      ["#todayTime", "[data-today-time]"],
      formatTime()
    );

    const hydration = getHydrationData();
    const mood = readJSON(STORAGE.mood, []);
    const wellness = readJSON(STORAGE.wellness, []);

    setText(
      ["#dashboardWater", "[data-dashboard-water]"],
      String(hydration.glasses)
    );

    setText(
      ["#dashboardMoodChecks", "[data-dashboard-mood]"],
      String(mood.length)
    );

    setText(
      ["#dashboardVitalityChecks", "[data-dashboard-vitality]"],
      String(wellness.length)
    );

    const capturedCount = Object.values(state.captures)
      .filter(Boolean).length;

    setText(
      ["#dashboardCaptures", "[data-dashboard-captures]"],
      String(capturedCount)
    );
  }

  function initDashboardClock() {
    updateDashboard();

    window.setInterval(() => {
      setText(
        ["#todayTime", "[data-today-time]"],
        formatTime()
      );
    }, 30000);
  }

  /* ==========================================================
     UNIVERSAL ACTION HANDLER
     Allows simple HTML buttons using data-action.
     ========================================================== */

  function initUniversalActions() {
    $$("[data-action]").forEach(button => {
      // Prevent duplicate universal event handling.
      if (button.dataset.naolActionBound === "true") return;

      button.dataset.naolActionBound = "true";

      const action = button.dataset.action;

      const knownActions = {
        "go-home": () => navigateTo("dashboard"),
        "go-scanner": () => navigateTo("scanner"),
        "go-viewer": () => navigateTo("viewer"),
        "go-anatomy": () => navigateTo("anatomy"),
        "go-wellness": () => navigateTo("wellness"),
        "go-vitality": () => navigateTo("vitality"),
        "go-mood": () => navigateTo("mood-check"),
        "go-breathing": () => navigateTo("breathing"),
        "go-settings": () => navigateTo("settings"),
        "download-report": downloadWellnessReport,
        "download-csv": downloadWellnessCSV,
        "download-captures": downloadAllCaptures,
        "start-camera": startCamera,
        "stop-camera": stopCamera,
        "switch-camera": switchCamera,
        "capture-photo": () => capturePhoto(state.currentAngle),
        "start-scan": startScanWorkflow,
        "stop-scan": () => stopScanWorkflow(false),
        "reset-viewer": resetViewer,
        "add-water": addWater,
        "remove-water": removeWater,
        "start-breathing": startBreathingTimer,
        "stop-breathing": stopBreathingTimer,
        "vitality-check": runVitalityCheck,
        "mood-check": runMoodSelfCheck,
        "save-mood": () => {
          $('[data-action="save-mood"]')?.click();
        },
        "save-sleep": () => {
          $('[data-action="save-sleep"]')?.click();
        },
        "clear-data": clearLocalData
      };

      const handler = knownActions[action];

      if (handler) {
        button.addEventListener("click", event => {
          // The feature-specific listeners already do the work.
          // Only handle this action if no matching feature-specific
          // button handler has been attached by another function.
          if (button.dataset.naolSpecificHandler === "true") {
            return;
          }

          // This handler intentionally avoids preventing native
          // form submissions and other browser behavior.
          if (button.type === "submit") return;

          handler(event);
        });
      }
    });
  }

  /* ==========================================================
     ERROR / FALLBACK HANDLING
     ========================================================== */

  window.addEventListener("error", event => {
    console.error("Naol Health Scanner error:", event.error);
  });

  window.addEventListener("unhandledrejection", event => {
    console.error(
      "Naol Health Scanner async error:",
      event.reason
    );
  });

  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  function initializeBasicUI() {
    renderCaptures();
    renderMoodHistory();
    renderJournal();
    updateHydrationUI();
    renderHydrationHistory();
    renderSleepHistory();
    updateDashboard();

    const stopButton =
      $("#stopCamera") ||
      $("#cameraStop") ||
      $('[data-action="stop-camera"]');

    if (stopButton) stopButton.disabled = true;

    setCameraStatus("Camera hin banamne");

    setProgress(0);
  }

  initNavigation();
  initDialogs();
  initSettings();

  initCamera();
  initVitalityCheck();
  initMoodSelfCheck();
  initBreathingTimer();
  initHydration();
  initSleepLog();
  initMeasurementTools();
  initCameraPrivacyNotice();
  initAnatomy();
  initExports();
  initDashboardClock();
  initializeBasicUI();

  /*
   * Load the 3D viewer without blocking other features.
   * If the CDN fails, the rest of the application remains usable.
   */
  loadThreeJS().then(ready => {
    if (ready) {
      console.info("Naol Health Scanner 3D viewer ready.");
    } else {
      console.warn(
        "3D viewer unavailable; other tools remain active."
      );
    }
  });

  /*
   * Prevent accidental data loss if a capture workflow is running.
   */
  window.addEventListener("beforeunload", () => {
    if (state.scanTimer) clearTimeout(state.scanTimer);
    if (state.breathingInterval) clearInterval(state.breathingInterval);

    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
    }
  });

  /*
   * Expose only useful actions for HTML buttons or debugging.
   */
  window.NaolHealthScanner = {
    startCamera,
    stopCamera,
    switchCamera,
    capturePhoto,
    startScanWorkflow,
    stopScanWorkflow,
    deleteCapture,
    downloadCapture,
    downloadAllCaptures,
    resetViewer,
    selectAnatomy,
    runVitalityCheck,
    runMoodSelfCheck,
    startBreathingTimer,
    stopBreathingTimer,
    downloadWellnessReport,
    downloadWellnessCSV,
    clearLocalData,
    getState: () => ({
      cameraActive: state.cameraActive,
      scanRunning: state.scanRunning,
      captureCount: Object.values(state.captures)
        .filter(Boolean).length,
      threeReady: state.threeReady
    })
  };

  console.info("Naol Health Scanner 3D initialized.");
}

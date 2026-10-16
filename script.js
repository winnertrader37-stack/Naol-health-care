"use strict";

/* ============================================================
   NAOL HEALTH SCANNER 3D
   Complete frontend JavaScript
   Version: 1.0.0

   IMPORTANT:
   - Educational wellness application only.
   - Does not diagnose diseases.
   - Camera photos are processed locally in this browser.
   - 3D body model is illustrative, not a medical scan.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  /* -------------------- UTILITIES -------------------- */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const byId = (id) => document.getElementById(id);

  const safeJSON = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, value));

  const timestamp = () => new Date().toISOString();

  const formatDate = (date = new Date()) =>
    date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });

  const formatTime = (date = new Date()) =>
    date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });

  const STORAGE_KEYS = {
    settings: "naolHealthScanner.settings.v1",
    captures: "naolHealthScanner.captures.v1",
    wellness: "naolHealthScanner.wellness.v1",
    hydration: "naolHealthScanner.hydration.v1",
    mood: "naolHealthScanner.mood.v1",
    sleep: "naolHealthScanner.sleep.v1"
  };

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : safeJSON(value, fallback);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Local storage unavailable:", error);
      notify("Could not save data in this browser.", "warning");
      return false;
    }
  }

  const defaultSettings = {
    theme: "dark",
    autoRotate: true,
    rotationSpeed: 0.5,
    cameraFacing: "environment",
    cameraWidth: 1280,
    cameraHeight: 720,
    scanSound: false,
    autosave: true,
    showGrid: true,
    showSkeleton: false,
    hydrationGoal: 8
  };

  let settings = {
    ...defaultSettings,
    ...readStorage(STORAGE_KEYS.settings, {})
  };

  let captures = readStorage(STORAGE_KEYS.captures, []);
  let wellnessEntries = readStorage(STORAGE_KEYS.wellness, []);
  let hydrationEntries = readStorage(STORAGE_KEYS.hydration, []);
  let moodEntries = readStorage(STORAGE_KEYS.mood, []);
  let sleepEntries = readStorage(STORAGE_KEYS.sleep, []);

  if (!Array.isArray(captures)) captures = [];
  if (!Array.isArray(wellnessEntries)) wellnessEntries = [];
  if (!Array.isArray(hydrationEntries)) hydrationEntries = [];
  if (!Array.isArray(moodEntries)) moodEntries = [];
  if (!Array.isArray(sleepEntries)) sleepEntries = [];

  function saveSettings() {
    writeStorage(STORAGE_KEYS.settings, settings);
  }

  /* -------------------- NOTIFICATIONS -------------------- */

  let notificationTimer = null;

  function notify(message, type = "info") {
    let container =
      byId("naol-toast-container") ||
      $(".toast-container") ||
      $("[data-toast-container]");

    if (!container) {
      container = document.createElement("div");
      container.id = "naol-toast-container";

      Object.assign(container.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "99999",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        maxWidth: "min(360px, calc(100vw - 32px))",
        pointerEvents: "none"
      });

      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.textContent = message;

    const background =
      type === "error"
        ? "#7f1d1d"
        : type === "success"
        ? "#065f46"
        : type === "warning"
        ? "#854d0e"
        : "#172554";

    Object.assign(toast.style, {
      color: "#ffffff",
      background,
      padding: "12px 16px",
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,.28)",
      fontSize: "14px",
      lineHeight: "1.45",
      overflowWrap: "anywhere",
      opacity: "0",
      transform: "translateY(-8px)",
      transition: "opacity .2s ease, transform .2s ease",
      pointerEvents: "auto"
    });

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";

      window.setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  /* -------------------- CLOCK AND DASHBOARD -------------------- */

  function updateClock() {
    const now = new Date();

    const clockTargets = [
      "liveClock",
      "currentTime",
      "dashboardClock",
      "clock",
      "timeDisplay"
    ];

    clockTargets.forEach((id) => {
      const element = byId(id);
      if (element) element.textContent = formatTime(now);
    });

    const dateTargets = [
      "currentDate",
      "dashboardDate",
      "todayDate",
      "dateDisplay"
    ];

    dateTargets.forEach((id) => {
      const element = byId(id);
      if (element) element.textContent = formatDate(now);
    });
  }

  updateClock();
  window.setInterval(updateClock, 1000);

  function updateDashboard() {
    const today = new Date().toDateString();

    const todayWellness = wellnessEntries.filter((entry) => {
      const date = new Date(entry.createdAt);
      return !Number.isNaN(date.getTime()) &&
        date.toDateString() === today;
    });

    const todayCaptures = captures.filter((capture) => {
      const date = new Date(capture.createdAt);
      return !Number.isNaN(date.getTime()) &&
        date.toDateString() === today;
    });

    const counters = {
      totalCaptures: captures.length,
      todayCaptures: todayCaptures.length,
      totalWellness: wellnessEntries.length,
      todayWellness: todayWellness.length,
      waterToday: getWaterToday(),
      hydrationGoal: Number(settings.hydrationGoal) || 8
    };

    const idValues = {
      totalCaptures: counters.totalCaptures,
      totalScans: counters.totalCaptures,
      todayCaptures: counters.todayCaptures,
      todayScans: counters.todayCaptures,
      wellnessChecks: counters.totalWellness,
      totalWellness: counters.totalWellness,
      waterToday: counters.waterToday,
      waterCount: counters.waterToday,
      hydrationGoal: counters.hydrationGoal
    };

    Object.entries(idValues).forEach(([id, value]) => {
      const element = byId(id);
      if (element) element.textContent = String(value);
    });

    const progress = byId("hydrationProgress");

    if (progress) {
      const percentage = clamp(
        (counters.waterToday / Math.max(1, counters.hydrationGoal)) * 100,
        0,
        100
      );

      progress.style.width = `${percentage}%`;
      progress.setAttribute("aria-valuenow", String(percentage));
    }

    renderCaptureGallery();
  }

  /* -------------------- NAVIGATION -------------------- */

  function showSection(sectionName) {
    if (!sectionName) return;

    const normalized = String(sectionName)
      .replace(/^#/, "")
      .replace(/^(section-|page-)/, "");

    const sections = $$(
      "main section[id], [data-page], .page-section, .app-section"
    );

    let matched = false;

    sections.forEach((section) => {
      const sectionId = section.id || "";
      const dataPage = section.getAttribute("data-page") || "";

      const active =
        sectionId === normalized ||
        sectionId === `section-${normalized}` ||
        sectionId === `page-${normalized}` ||
        dataPage === normalized;

      if (active) matched = true;

      if (
        section.matches("[data-page]") ||
        section.matches(".page-section") ||
        section.matches(".app-section")
      ) {
        section.hidden = !active;
      } else if (sectionId.startsWith("section-") ||
                 sectionId.startsWith("page-")) {
        section.hidden = !active;
      }
    });

    $$("[data-section], [data-page-link], .nav-link, .sidebar-link")
      .forEach((button) => {
        const target =
          button.dataset.section ||
          button.dataset.pageLink ||
          button.getAttribute("href")?.replace(/^#/, "");

        const active =
          target === normalized ||
          target === `section-${normalized}` ||
          target === `page-${normalized}`;

        button.classList.toggle("active", active);

        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });

    const mobileMenu = byId("mobileMenu") || byId("sidebar");

    if (mobileMenu) {
      mobileMenu.classList.remove("open");
      mobileMenu.classList.remove("active");
    }

    if (matched) {
      const target = byId(normalized) ||
        byId(`section-${normalized}`) ||
        byId(`page-${normalized}`);

      if (target && window.matchMedia("(max-width: 768px)").matches) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  /* -------------------- CAMERA SYSTEM -------------------- */

  let cameraStream = null;
  let cameraFacing = settings.cameraFacing || "environment";
  let cameraActive = false;
  let cameraStarting = false;
  let cameraAnimationFrame = null;
  let lastCapturedDataUrl = null;

  const video =
    byId("cameraVideo") ||
    byId("camera") ||
    byId("videoElement") ||
    $("video[data-camera]");

  const cameraCanvas =
    byId("cameraCanvas") ||
    byId("captureCanvas") ||
    document.createElement("canvas");

  const cameraContext = cameraCanvas.getContext("2d", {
    alpha: false
  });

  function updateCameraStatus(message, state = "idle") {
    const ids = [
      "cameraStatus",
      "cameraMessage",
      "scanStatus",
      "cameraState"
    ];

    ids.forEach((id) => {
      const element = byId(id);
      if (element) {
        element.textContent = message;
        element.dataset.state = state;
      }
    });

    $$("[data-camera-status]").forEach((element) => {
      element.textContent = message;
      element.dataset.state = state;
    });
  }

  function updateCameraButtons() {
    const startButtons = [
      "startCamera",
      "startCameraBtn",
      "openCamera",
      "cameraStart"
    ];

    const stopButtons = [
      "stopCamera",
      "stopCameraBtn",
      "cameraStop"
    ];

    startButtons.forEach((id) => {
      const element = byId(id);
      if (element) element.disabled = cameraActive || cameraStarting;
    });

    stopButtons.forEach((id) => {
      const element = byId(id);
      if (element) element.disabled = !cameraActive;
    });
  }

  async function startCamera() {
    if (cameraStarting) return;

    if (!navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function") {
      notify(
        "Camera is not available. Open this website using HTTPS and a supported browser.",
        "error"
      );

      updateCameraStatus("Camera unavailable — HTTPS may be required.", "error");
      return;
    }

    if (!video) {
      notify(
        "Camera video element not found. Check index.html for the camera video element.",
        "error"
      );
      return;
    }

    cameraStarting = true;
    updateCameraButtons();
    updateCameraStatus("Requesting camera permission…", "loading");

    try {
      stopCamera(false);

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: settings.cameraWidth || 1280 },
          height: { ideal: settings.cameraHeight || 720 }
        }
      };

      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

      video.srcObject = cameraStream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      await video.play();

      cameraActive = true;
      cameraStarting = false;

      updateCameraStatus("Camera is active", "active");
      updateCameraButtons();
      drawCameraPreview();
      notify("Camera started successfully.", "success");
    } catch (error) {
      cameraStarting = false;
      cameraActive = false;
      cameraStream = null;

      updateCameraButtons();

      let message = "Unable to start the camera.";

      if (error?.name === "NotAllowedError" ||
          error?.name === "PermissionDeniedError") {
        message =
          "Camera permission was denied. Allow camera access in your browser settings.";
      } else if (error?.name === "NotFoundError") {
        message = "No camera was found on this device.";
      } else if (error?.name === "NotReadableError") {
        message = "The camera may already be in use by another application.";
      } else if (error?.name === "OverconstrainedError") {
        message = "Requested camera settings are unavailable. Try another camera.";
      } else if (error?.name === "SecurityError") {
        message = "Camera access requires a secure HTTPS website.";
      }

      updateCameraStatus(message, "error");
      notify(message, "error");
      console.error("Camera start failed:", error);
    }
  }

  function stopCamera(showNotification = true) {
    if (cameraAnimationFrame !== null) {
      cancelAnimationFrame(cameraAnimationFrame);
      cameraAnimationFrame = null;
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }

    if (video) {
      try {
        video.pause();
        video.srcObject = null;
      } catch (error) {
        console.warn("Could not reset camera video:", error);
      }
    }

    cameraActive = false;

    if (!cameraStarting) {
      updateCameraStatus("Camera stopped", "idle");
    }

    updateCameraButtons();

    if (showNotification) {
      notify("Camera stopped.");
    }
  }

  function drawCameraPreview() {
    if (!cameraActive || !video || video.readyState < 2) return;

    if (cameraCanvas.width !== video.videoWidth ||
        cameraCanvas.height !== video.videoHeight) {
      cameraCanvas.width = video.videoWidth || 640;
      cameraCanvas.height = video.videoHeight || 480;
    }

    try {
      cameraContext.drawImage(
        video,
        0,
        0,
        cameraCanvas.width,
        cameraCanvas.height
      );
    } catch (error) {
      console.warn("Camera preview frame error:", error);
    }

    cameraAnimationFrame = requestAnimationFrame(drawCameraPreview);
  }

  async function switchCamera() {
    cameraFacing =
      cameraFacing === "environment" ? "user" : "environment";

    settings.cameraFacing = cameraFacing;
    saveSettings();

    if (cameraActive) {
      await startCamera();
    } else {
      notify(
        `Next camera: ${cameraFacing === "user" ? "front" : "rear"}.`
      );
    }
  }

  function getCurrentCameraFrame() {
    if (video && cameraActive &&
        video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement("canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      if (!context) throw new Error("Unable to create image context.");

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL("image/jpeg", 0.92);
    }

    if (lastCapturedDataUrl) return lastCapturedDataUrl;

    throw new Error("Start the camera before capturing a photo.");
  }

  function capturePhoto(view = "front") {
    try {
      if (!cameraActive) {
        notify("Start the camera before capturing a photo.", "warning");
        return null;
      }

      const imageData = getCurrentCameraFrame();
      const capture = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        view,
        createdAt: timestamp(),
        dataUrl: imageData
      };

      lastCapturedDataUrl = imageData;

      if (settings.autosave) {
        captures.unshift(capture);
        captures = captures.slice(0, 30);
        writeStorage(STORAGE_KEYS.captures, captures);
      }

      updateDashboard();
      renderCaptureGallery();

      const imagePreview =
        byId("capturedImage") ||
        byId("capturePreview") ||
        $("img[data-capture-preview]");

      if (imagePreview) {
        imagePreview.src = imageData;
        imagePreview.hidden = false;
      }

      const captureStatus = byId("captureStatus");
      if (captureStatus) {
        captureStatus.textContent = `${view} photo captured at ${formatTime()}`;
      }

      playScanSound();
      notify(`${view} photo captured.`, "success");

      return capture;
    } catch (error) {
      notify(error.message || "Unable to capture photo.", "error");
      return null;
    }
  }

  function deleteCapture(id) {
    captures = captures.filter((capture) => capture.id !== id);
    writeStorage(STORAGE_KEYS.captures, captures);
    updateDashboard();
    notify("Photo deleted.");
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadCapture(id) {
    const capture = captures.find((item) => item.id === id);

    if (!capture) {
      notify("Photo not found.", "error");
      return;
    }

    downloadDataUrl(
      capture.dataUrl,
      `naol-health-${capture.view}-${capture.id}.jpg`
    );
  }

  function renderCaptureGallery() {
    const gallery =
      byId("captureGallery") ||
      byId("photoGallery") ||
      $("[data-capture-gallery]");

    if (!gallery) return;

    gallery.replaceChildren();

    if (captures.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No saved photos yet.";
      gallery.appendChild(empty);
      return;
    }

    captures.forEach((capture) => {
      const card = document.createElement("article");
      card.className = "capture-card";

      const image = document.createElement("img");
      image.src = capture.dataUrl;
      image.alt = `${capture.view} camera capture`;
      image.loading = "lazy";

      Object.assign(image.style, {
        width: "100%",
        maxWidth: "260px",
        height: "auto",
        borderRadius: "12px",
        objectFit: "cover"
      });

      const title = document.createElement("p");
      title.textContent =
        `${capture.view.toUpperCase()} • ${formatDate(new Date(capture.createdAt))}`;

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "Download photo";
      downloadButton.addEventListener("click", () => downloadCapture(capture.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete photo";
      deleteButton.addEventListener("click", () => deleteCapture(capture.id));

      card.append(image, title, downloadButton, deleteButton);
      gallery.appendChild(card);
    });
  }

  function downloadAllCaptures() {
    if (captures.length === 0) {
      notify("There are no saved photos to download.", "warning");
      return;
    }

    captures.forEach((capture, index) => {
      window.setTimeout(() => {
        downloadDataUrl(
          capture.dataUrl,
          `naol-health-${capture.view}-${index + 1}.jpg`
        );
      }, index * 250);
    });
  }

  /* -------------------- SCAN SESSION -------------------- */

  const scanViews = ["front", "left", "right", "back"];

  let currentScanIndex = 0;
  let scanSessionActive = false;
  let scanSession = [];

  function updateScanProgress() {
    const progress = byId("scanProgress");
    const label = byId("scanProgressLabel");

    const completed = scanSession.length;
    const percentage = (completed / scanViews.length) * 100;

    if (progress) {
      progress.style.width = `${percentage}%`;
      progress.setAttribute("aria-valuenow", String(percentage));
    }

    if (label) {
      label.textContent = `${completed}/${scanViews.length} views captured`;
    }

    const current = byId("currentScanView");

    if (current) {
      current.textContent =
        completed >= scanViews.length
          ? "Capture session complete"
          : `Next view: ${scanViews[currentScanIndex]}`;
    }
  }

  function startScanSession() {
    scanSession = [];
    currentScanIndex = 0;
    scanSessionActive = true;
    updateScanProgress();
    notify("Capture session started. Capture the four requested views.");
  }

  function captureNextView() {
    if (!scanSessionActive) startScanSession();

    if (currentScanIndex >= scanViews.length) {
      notify("All four views have already been captured.", "warning");
      return;
    }

    const view = scanViews[currentScanIndex];
    const capture = capturePhoto(view);

    if (!capture) return;

    scanSession.push(capture.id);
    currentScanIndex += 1;

    updateScanProgress();

    if (currentScanIndex >= scanViews.length) {
      scanSessionActive = false;

      const note = byId("scanSessionNote");

      if (note) {
        note.textContent =
          "Four reference photos saved. These photos do not automatically create a true 3D body scan.";
      }

      notify(
        "Four views captured. This is a photo collection, not a medical 3D scan.",
        "success"
      );
    }
  }

  /* -------------------- SCAN SOUND -------------------- */

  function playScanSound() {
    if (!settings.scanSound) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(720, context.currentTime);

      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + 0.12
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);

      oscillator.onended = () => context.close();
    } catch (error) {
      console.warn("Audio unavailable:", error);
    }
  }

  /* -------------------- THREE.JS 3D VIEWER -------------------- */

  let THREE = null;
  let OrbitControlsClass = null;

  let threeScene = null;
  let threeCamera = null;
  let threeRenderer = null;
  let orbitControls = null;
  let bodyGroup = null;
  let skeletonGroup = null;
  let gridHelper = null;
  let animationFrame3D = null;
  let threeReady = false;

  const threeContainer =
    byId("body3DViewer") ||
    byId("threeContainer") ||
    byId("bodyViewer") ||
    $("[data-3d-viewer]");

  function makeMaterial(color, roughness = 0.45, metalness = 0.15) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    });
  }

  function addEllipsoid(parent, position, scale, material, segments = 32) {
    const geometry = new THREE.SphereGeometry(1, segments, segments);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);

    return mesh;
  }

  function addCapsuleLikeLimb(parent, start, end, radius, material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);

    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();

    const geometry = new THREE.CylinderGeometry(
      radius * 0.85,
      radius,
      length,
      16,
      1
    );

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);

    addEllipsoid(
      parent,
      [a.x, a.y, a.z],
      [radius, radius, radius],
      material,
      16
    );

    addEllipsoid(
      parent,
      [b.x, b.y, b.z],
      [radius, radius, radius],
      material,
      16
    );

    return mesh;
  }

  function createIllustrativeBody() {
    if (!THREE || !bodyGroup) return;

    while (bodyGroup.children.length > 0) {
      const child = bodyGroup.children[0];
      bodyGroup.remove(child);

      child.traverse?.((object) => {
        object.geometry?.dispose?.();

        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
    }

    const skin = makeMaterial(0x35b6c9, 0.48, 0.18);
    const darkerSkin = makeMaterial(0x167f99, 0.5, 0.12);
    const jointMaterial = makeMaterial(0x5bd7e6, 0.38, 0.22);
    const clothing = makeMaterial(0x223d63, 0.55, 0.15);

    // Head and neck.
    addEllipsoid(bodyGroup, [0, 3.0, 0], [0.34, 0.43, 0.31], skin);
    addEllipsoid(bodyGroup, [0, 2.49, 0], [0.14, 0.25, 0.14], darkerSkin);

    // Torso.
    addEllipsoid(bodyGroup, [0, 1.91, 0], [0.64, 0.72, 0.31], clothing);
    addEllipsoid(bodyGroup, [0, 1.35, 0], [0.42, 0.37, 0.28], skin);

    // Shoulders.
    addEllipsoid(bodyGroup, [-0.62, 2.25, 0], [0.27, 0.26, 0.27], skin);
    addEllipsoid(bodyGroup, [0.62, 2.25, 0], [0.27, 0.26, 0.27], skin);

    // Arms.
    addCapsuleLikeLimb(
      bodyGroup,
      [-0.68, 2.19, 0],
      [-0.83, 1.55, 0],
      0.14,
      skin
    );

    addCapsuleLikeLimb(
      bodyGroup,
      [-0.83, 1.55, 0],
      [-0.86, 0.95, 0],
      0.11,
      darkerSkin
    );

    addEllipsoid(bodyGroup, [-0.86, 0.82, 0], [0.13, 0.18, 0.12], skin);

    addCapsuleLikeLimb(
      bodyGroup,
      [0.68, 2.19, 0],
      [0.83, 1.55, 0],
      0.14,
      skin
    );

    addCapsuleLikeLimb(
      bodyGroup,
      [0.83, 1.55, 0],
      [0.86, 0.95, 0],
      0.11,
      darkerSkin
    );

    addEllipsoid(bodyGroup, [0.86, 0.82, 0], [0.13, 0.18, 0.12], skin);

    // Legs.
    addCapsuleLikeLimb(
      bodyGroup,
      [-0.25, 1.11, 0],
      [-0.28, 0.28, 0],
      0.19,
      skin
    );

    addCapsuleLikeLimb(
      bodyGroup,
      [-0.28, 0.28, 0],
      [-0.28, -0.48, 0],
      0.13,
      darkerSkin
    );

    addEllipsoid(bodyGroup, [-0.28, -0.57, 0.08], [0.17, 0.11, 0.29], clothing);

    addCapsuleLikeLimb(
      bodyGroup,
      [0.25, 1.11, 0],
      [0.28, 0.28, 0],
      0.19,
      skin
    );

    addCapsuleLikeLimb(
      bodyGroup,
      [0.28, 0.28, 0],
      [0.28, -0.48, 0],
      0.13,
      darkerSkin
    );

    addEllipsoid(bodyGroup, [0.28, -0.57, 0.08], [0.17, 0.11, 0.29], clothing);

    // Neck, chest, and abdomen reference lines.
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0x4be9ff,
      transparent: true,
      opacity: 0.45
    });

    const chestLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.43, 2.0, 0.31),
      new THREE.Vector3(0.43, 2.0, 0.31)
    ]);

    const chestLine = new THREE.Line(chestLineGeometry, lineMaterial);
    bodyGroup.add(chestLine);

    const abdomenLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.3, 1.47, 0.28),
      new THREE.Vector3(0.3, 1.47, 0.28)
    ]);

    bodyGroup.add(new THREE.Line(abdomenLineGeometry, lineMaterial));

    bodyGroup.position.y = 0.25;
  }

  function createIllustrativeSkeleton() {
    if (!THREE || !skeletonGroup) return;

    while (skeletonGroup.children.length > 0) {
      const child = skeletonGroup.children[0];
      skeletonGroup.remove(child);

      child.traverse?.((object) => {
        object.geometry?.dispose?.();
        object.material?.dispose?.();
      });
    }

    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0e7ef,
      roughness: 0.6,
      transparent: true,
      opacity: 0.8
    });

    addEllipsoid(
      skeletonGroup,
      [0, 3.0, 0.03],
      [0.23, 0.3, 0.2],
      boneMaterial,
      24
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [0, 2.65, 0],
      [0, 1.1, 0],
      0.07,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [-0.42, 2.24, 0],
      [0.42, 2.24, 0],
      0.045,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [-0.48, 2.2, 0],
      [-0.85, 1.55, 0],
      0.045,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [-0.85, 1.55, 0],
      [-0.86, 0.95, 0],
      0.035,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [0.48, 2.2, 0],
      [0.85, 1.55, 0],
      0.045,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [0.85, 1.55, 0],
      [0.86, 0.95, 0],
      0.035,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [-0.22, 1.05, 0],
      [-0.28, 0.25, 0],
      0.06,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [-0.28, 0.25, 0],
      [-0.28, -0.48, 0],
      0.045,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [0.22, 1.05, 0],
      [0.28, 0.25, 0],
      0.06,
      boneMaterial
    );

    addCapsuleLikeLimb(
      skeletonGroup,
      [0.28, 0.25, 0],
      [0.28, -0.48, 0],
      0.045,
      boneMaterial
    );

    skeletonGroup.position.y = 0.25;
    skeletonGroup.visible = Boolean(settings.showSkeleton);
  }

  async function init3DViewer() {
    if (!threeContainer) {
      console.info(
        "3D viewer container not found. Add an element with id='body3DViewer' to enable the viewer."
      );
      return;
    }

    try {
      THREE = await import(
        "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
      );

      const controlsModule = await import(
        "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"
      );

      OrbitControlsClass = controlsModule.OrbitControls;

      threeScene = new THREE.Scene();
      threeScene.background = new THREE.Color(0x07111f);

      threeCamera = new THREE.PerspectiveCamera(
        42,
        Math.max(1, threeContainer.clientWidth) /
          Math.max(1, threeContainer.clientHeight),
        0.1,
        100
      );

      threeCamera.position.set(4.2, 2.8, 6.5);

      threeRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power"
      });

      threeRenderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.75)
      );

      threeRenderer.setSize(
        Math.max(1, threeContainer.clientWidth),
        Math.max(1, threeContainer.clientHeight)
      );

      threeRenderer.shadowMap.enabled = true;
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

      threeContainer.replaceChildren(threeRenderer.domElement);

      threeRenderer.domElement.style.display = "block";
      threeRenderer.domElement.style.width = "100%";
      threeRenderer.domElement.style.height = "100%";
      threeRenderer.domElement.style.minHeight = "320px";

      const ambientLight = new THREE.AmbientLight(0x8abbd7, 1.8);
      threeScene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
      keyLight.position.set(4, 7, 5);
      keyLight.castShadow = true;
      threeScene.add(keyLight);

      const rimLight = new THREE.PointLight(0x18c9f4, 35, 20);
      rimLight.position.set(-4, 3, -3);
      threeScene.add(rimLight);

      gridHelper = new THREE.GridHelper(12, 24, 0x147b9a, 0x123149);
      gridHelper.position.y = -0.42;
      gridHelper.visible = Boolean(settings.showGrid);
      threeScene.add(gridHelper);

      bodyGroup = new THREE.Group();
      threeScene.add(bodyGroup);

      skeletonGroup = new THREE.Group();
      threeScene.add(skeletonGroup);

      createIllustrativeBody();
      createIllustrativeSkeleton();

      orbitControls = new OrbitControlsClass(
        threeCamera,
        threeRenderer.domElement
      );

      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.06;
      orbitControls.minDistance = 3.5;
      orbitControls.maxDistance = 14;
      orbitControls.target.set(0, 1.35, 0);
      orbitControls.autoRotate = Boolean(settings.autoRotate);
      orbitControls.autoRotateSpeed = Number(settings.rotationSpeed) || 0.5;

      threeReady = true;

      update3DStatus("3D viewer ready");

      animate3D();
      window.addEventListener("resize", resize3DViewer);

      notify("3D viewer loaded.", "success");
    } catch (error) {
      console.warn("Three.js viewer could not be loaded:", error);

      update3DStatus(
        "3D viewer unavailable. Check your internet connection and try again."
      );
    }
  }

  function update3DStatus(message) {
    [
      "viewerStatus",
      "bodyViewerStatus",
      "threeStatus",
      "modelStatus"
    ].forEach((id) => {
      const element = byId(id);
      if (element) element.textContent = message;
    });
  }

  function animate3D() {
    if (!threeReady || !threeRenderer || !threeScene || !threeCamera) return;

    animationFrame3D = requestAnimationFrame(animate3D);

    if (orbitControls) orbitControls.update();

    threeRenderer.render(threeScene, threeCamera);
  }

  function resize3DViewer() {
    if (!threeReady || !threeContainer || !threeRenderer || !threeCamera) return;

    const width = Math.max(1, threeContainer.clientWidth);
    const height = Math.max(1, threeContainer.clientHeight);

    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();

    threeRenderer.setSize(width, height);
  }

  function set3DView(view) {
    if (!threeReady || !threeCamera || !orbitControls) {
      notify("The 3D viewer is not ready yet.", "warning");
      return;
    }

    const positions = {
      front: [0, 2.0, 6.5],
      back: [0, 2.0, -6.5],
      left: [-6.5, 2.0, 0],
      right: [6.5, 2.0, 0],
      top: [0, 8.0, 0.01]
    };

    const position = positions[String(view).toLowerCase()];

    if (!position) {
      notify("Unknown 3D view.", "warning");
      return;
    }

    threeCamera.position.set(...position);
    orbitControls.target.set(0, 1.35, 0);

    if (String(view).toLowerCase() === "back") {
      threeCamera.lookAt(0, 1.35, 0);
    }

    orbitControls.update();

    notify(`${view} view selected.`);
  }

  function reset3DViewer() {
    if (!threeReady || !threeCamera || !orbitControls) {
      notify("The 3D viewer is not ready yet.", "warning");
      return;
    }

    threeCamera.position.set(4.2, 2.8, 6.5);
    orbitControls.target.set(0, 1.35, 0);
    orbitControls.autoRotate = Boolean(settings.autoRotate);
    orbitControls.update();

    notify("3D view reset.", "success");
  }

  function toggleAutoRotate() {
    settings.autoRotate = !settings.autoRotate;
    saveSettings();

    if (orbitControls) {
      orbitControls.autoRotate = settings.autoRotate;
    }

    notify(
      `Auto-rotate ${settings.autoRotate ? "enabled" : "disabled"}.`
    );
  }

  function toggleSkeleton() {
    settings.showSkeleton = !settings.showSkeleton;
    saveSettings();

    if (skeletonGroup) {
      skeletonGroup.visible = settings.showSkeleton;
    }

    notify(
      `Illustrative skeleton overlay ${
        settings.showSkeleton ? "enabled" : "disabled"
      }.`
    );
  }

  function toggleGrid() {
    settings.showGrid = !settings.showGrid;
    saveSettings();

    if (gridHelper) {
      gridHelper.visible = settings.showGrid;
    }

    notify(`3D grid ${settings.showGrid ? "enabled" : "disabled"}.`);
  }

  /* -------------------- WELLNESS SELF-CHECK -------------------- */

  const wellnessQuestions = [
    {
      id: "energy",
      title: "How would you describe your energy today?",
      options: [
        { label: "Very low", score: 0 },
        { label: "Low", score: 1 },
        { label: "Moderate", score: 2 },
        { label: "Good", score: 3 },
        { label: "Excellent", score: 4 }
      ]
    },
    {
      id: "sleep",
      title: "How was your sleep last night?",
      options: [
        { label: "Very poor", score: 0 },
        { label: "Poor", score: 1 },
        { label: "Fair", score: 2 },
        { label: "Good", score: 3 },
        { label: "Very good", score: 4 }
      ]
    },
    {
      id: "stress",
      title: "How manageable does your stress feel today?",
      options: [
        { label: "Not manageable", score: 0 },
        { label: "Difficult", score: 1 },
        { label: "Somewhat manageable", score: 2 },
        { label: "Mostly manageable", score: 3 },
        { label: "Very manageable", score: 4 }
      ]
    },
    {
      id: "movement",
      title: "Have you had some movement or exercise today?",
      options: [
        { label: "Not yet", score: 0 },
        { label: "A little", score: 1 },
        { label: "Some", score: 2 },
        { label: "A good amount", score: 3 },
        { label: "Plenty", score: 4 }
      ]
    },
    {
      id: "hydration",
      title: "How well have you stayed hydrated today?",
      options: [
        { label: "Very poorly", score: 0 },
        { label: "Poorly", score: 1 },
        { label: "Fairly", score: 2 },
        { label: "Well", score: 3 },
        { label: "Very well", score: 4 }
      ]
    }
  ];

  function getQuestionnaireContainer() {
    return (
      byId("wellnessQuestions") ||
      byId("selfCheckQuestions") ||
      $("[data-wellness-questions]")
    );
  }

  function renderWellnessQuestions() {
    const container = getQuestionnaireContainer();
    if (!container) return;

    container.replaceChildren();

    wellnessQuestions.forEach((question, index) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "wellness-question";

      const legend = document.createElement("legend");
      legend.textContent = `${index + 1}. ${question.title}`;

      fieldset.appendChild(legend);

      question.options.forEach((option) => {
        const label = document.createElement("label");
        label.className = "wellness-option";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = question.id;
        input.value = String(option.score);
        input.required = true;

        const text = document.createElement("span");
        text.textContent = option.label;

        label.append(input, text);
        fieldset.appendChild(label);
      });

      container.appendChild(fieldset);
    });
  }

  function runWellnessCheck() {
    const answers = {};

    for (const question of wellnessQuestions) {
      const selected = $(
        `input[name="${question.id}"]:checked`
      );

      if (!selected) {
        notify("Please answer every wellness question.", "warning");
        return null;
      }

      answers[question.id] = Number(selected.value);
    }

    const total = Object.values(answers).reduce(
      (sum, value) => sum + value,
      0
    );

    const maximum = wellnessQuestions.length * 4;
    const percentage = Math.round((total / maximum) * 100);

    let summary;
    let recommendation;

    if (percentage >= 80) {
      summary = "Your self-reported wellness feels positive today.";
      recommendation =
        "Keep up helpful routines, rest when needed, and stay hydrated.";
    } else if (percentage >= 60) {
      summary = "Your self-reported wellness is mixed but generally steady.";
      recommendation =
        "Consider a short walk, regular meals, rest, and a calming break.";
    } else if (percentage >= 40) {
      summary = "You reported some areas that may need attention.";
      recommendation =
        "Choose one manageable step today and consider talking to someone you trust if concerns persist.";
    } else {
      summary = "You reported several challenges with your wellbeing today.";
      recommendation =
        "Be kind to yourself. Consider support from someone you trust or a qualified health professional, especially if this continues.";
    }

    const entry = {
      id: `${Date.now()}`,
      createdAt: timestamp(),
      answers,
      total,
      maximum,
      percentage,
      summary,
      recommendation
    };

    wellnessEntries.unshift(entry);
    wellnessEntries = wellnessEntries.slice(0, 100);

    writeStorage(STORAGE_KEYS.wellness, wellnessEntries);

    const result = byId("wellnessResult") ||
      byId("selfCheckResult") ||
      $("[data-wellness-result]");

    if (result) {
      result.replaceChildren();

      const heading = document.createElement("h3");
      heading.textContent = `Your wellness reflection: ${percentage}%`;

      const summaryParagraph = document.createElement("p");
      summaryParagraph.textContent = summary;

      const recommendationParagraph = document.createElement("p");
      recommendationParagraph.textContent = recommendation;

      const disclaimer = document.createElement("small");
      disclaimer.textContent =
        "This is a non-diagnostic self-reflection questionnaire. It is not a medical test, diagnosis, or substitute for professional care.";

      result.append(
        heading,
        summaryParagraph,
        recommendationParagraph,
        disclaimer
      );

      result.hidden = false;
    }

    updateDashboard();
    notify("Wellness reflection saved.", "success");

    return entry;
  }

  /* -------------------- BREATHING TIMER -------------------- */

  let breathingInterval = null;
  let breathingRemaining = 60;
  let breathingRunning = false;
  let breathingPhase = "Ready";

  function updateBreathingDisplay() {
    const timer = byId("breathingTimer") ||
      byId("breathTimer") ||
      $("[data-breathing-timer]");

    const phase = byId("breathingPhase") ||
      byId("breathPhase") ||
      $("[data-breathing-phase]");

    const minutes = Math.floor(breathingRemaining / 60);
    const seconds = breathingRemaining % 60;
    const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (timer) timer.textContent = text;
    if (phase) phase.textContent = breathingPhase;
  }

  function startBreathingExercise() {
    if (breathingRunning) return;

    breathingRunning = true;
    breathingRemaining = 60;
    breathingPhase = "Breathe in gently";

    let elapsed = 0;

    updateBreathingDisplay();

    breathingInterval = window.setInterval(() => {
      elapsed += 1;
      breathingRemaining = Math.max(0, 60 - elapsed);

      const cycle = elapsed % 8;

      if (cycle < 4) {
        breathingPhase = "Breathe in gently";
      } else {
        breathingPhase = "Breathe out slowly";
      }

      updateBreathingDisplay();

      if (breathingRemaining <= 0) {
        stopBreathingExercise();
        breathingPhase = "Session complete";
        updateBreathingDisplay();
        notify("Breathing session completed.", "success");
      }
    }, 1000);
  }

  function stopBreathingExercise() {
    if (breathingInterval !== null) {
      clearInterval(breathingInterval);
      breathingInterval = null;
    }

    breathingRunning = false;

    if (breathingRemaining > 0) {
      breathingPhase = "Paused";
    }

    updateBreathingDisplay();
  }

  /* -------------------- HYDRATION TRACKER -------------------- */

  function getWaterToday() {
    const today = new Date().toDateString();

    return hydrationEntries.filter((entry) => {
      const date = new Date(entry.createdAt);

      return !Number.isNaN(date.getTime()) &&
        date.toDateString() === today;
    }).length;
  }

  function addWater() {
    hydrationEntries.unshift({
      id: `${Date.now()}`,
      createdAt: timestamp(),
      amountMl: 250
    });

    hydrationEntries = hydrationEntries.slice(0, 500);

    writeStorage(STORAGE_KEYS.hydration, hydrationEntries);
    updateDashboard();

    const waterMessage = byId("waterMessage");

    if (waterMessage) {
      waterMessage.textContent =
        `${getWaterToday()} logged drinks today. Each entry represents 250 ml.`;
    }

    notify("One drink logged (250 ml).", "success");
  }

  function undoWater() {
    const today = new Date().toDateString();

    const index = hydrationEntries.findIndex((entry) => {
      const date = new Date(entry.createdAt);

      return !Number.isNaN(date.getTime()) &&
        date.toDateString() === today;
    });

    if (index === -1) {
      notify("No drink entry to undo today.", "warning");
      return;
    }

    hydrationEntries.splice(index, 1);
    writeStorage(STORAGE_KEYS.hydration, hydrationEntries);
    updateDashboard();

    notify("Latest drink entry removed.");
  }

  /* -------------------- MOOD DIARY -------------------- */

  function saveMood() {
    const moodInput = byId("moodSelect") ||
      byId("moodInput") ||
      $("select[name='mood']");

    const noteInput = byId("moodNote") ||
      byId("moodNotes") ||
      $("textarea[name='moodNote']");

    if (!moodInput || !moodInput.value) {
      notify("Choose a mood first.", "warning");
      return;
    }

    moodEntries.unshift({
      id: `${Date.now()}`,
      createdAt: timestamp(),
      mood: moodInput.value,
      note: noteInput ? noteInput.value.trim().slice(0, 1000) : ""
    });

    moodEntries = moodEntries.slice(0, 100);

    writeStorage(STORAGE_KEYS.mood, moodEntries);

    if (noteInput) noteInput.value = "";

    renderMoodHistory();
    notify("Mood entry saved privately in this browser.", "success");
  }

  function renderMoodHistory() {
    const container = byId("moodHistory") ||
      $("[data-mood-history]");

    if (!container) return;

    container.replaceChildren();

    if (moodEntries.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No mood entries yet.";
      container.appendChild(empty);
      return;
    }

    moodEntries.slice(0, 10).forEach((entry) => {
      const item = document.createElement("article");

      const title = document.createElement("strong");
      title.textContent = entry.mood;

      const date = document.createElement("small");
      date.textContent = ` — ${formatDate(new Date(entry.createdAt))}`;

      const note = document.createElement("p");
      note.textContent = entry.note || "No note added.";

      item.append(title, date, note);
      container.appendChild(item);
    });
  }

  /* -------------------- SLEEP LOG -------------------- */

  function saveSleep() {
    const hoursInput = byId("sleepHours") ||
      $("input[name='sleepHours']");

    const qualityInput = byId("sleepQuality") ||
      $("select[name='sleepQuality']");

    const hours = Number(hoursInput?.value);
    const quality = qualityInput?.value || "not specified";

    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      notify("Enter sleep hours between 0 and 24.", "warning");
      return;
    }

    sleepEntries.unshift({
      id: `${Date.now()}`,
      createdAt: timestamp(),
      hours,
      quality
    });

    sleepEntries = sleepEntries.slice(0, 100);
    writeStorage(STORAGE_KEYS.sleep, sleepEntries);

    renderSleepHistory();
    notify("Sleep entry saved.", "success");
  }

  function renderSleepHistory() {
    const container = byId("sleepHistory") ||
      $("[data-sleep-history]");

    if (!container) return;

    container.replaceChildren();

    sleepEntries.slice(0, 10).forEach((entry) => {
      const item = document.createElement("p");

      item.textContent =
        `${formatDate(new Date(entry.createdAt))}: ${entry.hours} hours, quality: ${entry.quality}`;

      container.appendChild(item);
    });

    if (sleepEntries.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No sleep records yet.";
      container.appendChild(empty);
    }
  }

  /* -------------------- REPORT GENERATOR -------------------- */

  function createReportText() {
    const latestWellness = wellnessEntries[0];
    const todayWater = getWaterToday();

    const report = [
      "NAOL HEALTH SCANNER 3D",
      "PERSONAL WELLNESS REFLECTION",
      "========================================",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "IMPORTANT NOTICE",
      "This report is for personal wellness tracking only.",
      "It is not a diagnosis, medical scan, or medical advice.",
      "",
      "PHOTO CAPTURES",
      `Saved photos: ${captures.length}`,
      "",
      "HYDRATION TRACKER",
      `Logged drinks today: ${todayWater}`,
      `Logged amount (assuming 250 ml per entry): ${todayWater * 250} ml`,
      "",
      "WELLNESS SELF-CHECK"
    ];

    if (latestWellness) {
      report.push(
        `Latest check: ${new Date(latestWellness.createdAt).toLocaleString()}`,
        `Reflection score: ${latestWellness.percentage}%`,
        latestWellness.summary,
        latestWellness.recommendation
      );
    } else {
      report.push("No wellness self-check has been recorded.");
    }

    report.push("", "MOOD HISTORY");

    if (moodEntries.length) {
      moodEntries.slice(0, 10).forEach((entry) => {
        report.push(
          `${new Date(entry.createdAt).toLocaleString()} — ${entry.mood}: ${entry.note}`
        );
      });
    } else {
      report.push("No mood entries recorded.");
    }

    report.push("", "SLEEP HISTORY");

    if (sleepEntries.length) {
      sleepEntries.slice(0, 10).forEach((entry) => {
        report.push(
          `${new Date(entry.createdAt).toLocaleString()} — ${entry.hours} hours; ${entry.quality}`
        );
      });
    } else {
      report.push("No sleep entries recorded.");
    }

    report.push(
      "",
      "Privacy: report generated in this browser.",
      "The illustrated 3D body is not a real anatomical scan.",
      "Seek qualified medical care for medical concerns."
    );

    return report.join("\n");
  }

  function downloadReport() {
    const reportText = createReportText();
    const blob = new Blob([reportText], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `naol-wellness-report-${new Date().toISOString().slice(0, 10)}.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    notify("Wellness report downloaded.", "success");
  }

  function showReportPreview() {
    const target = byId("reportPreview") ||
      byId("wellnessReport") ||
      $("[data-report-preview]");

    if (!target) {
      downloadReport();
      return;
    }

    target.textContent = createReportText();
    target.hidden = false;
  }

  /* -------------------- SETTINGS -------------------- */

  function applyTheme() {
    const theme = settings.theme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;

    document.documentElement.classList.toggle(
      "theme-light",
      theme === "light"
    );

    document.documentElement.classList.toggle(
      "theme-dark",
      theme === "dark"
    );

    const themeButton = byId("toggleTheme") ||
      byId("themeToggle");

    if (themeButton) {
      themeButton.textContent =
        theme === "light" ? "Switch to dark mode" : "Switch to light mode";
    }
  }

  function toggleTheme() {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    saveSettings();
    applyTheme();
    notify(`Theme changed to ${settings.theme} mode.`);
  }

  function loadSettingsIntoForm() {
    const mapping = {
      autoRotate: settings.autoRotate,
      rotationSpeed: settings.rotationSpeed,
      scanSound: settings.scanSound,
      autosave: settings.autosave,
      showGrid: settings.showGrid,
      showSkeleton: settings.showSkeleton,
      hydrationGoal: settings.hydrationGoal
    };

    Object.entries(mapping).forEach(([name, value]) => {
      const element = byId(name) ||
        $(`[name="${name}"]`) ||
        $(`[data-setting="${name}"]`);

      if (!element) return;

      if (element.type === "checkbox") {
        element.checked = Boolean(value);
      } else {
        element.value = String(value);
      }
    });

    const resolution = byId("cameraResolution");

    if (resolution) {
      resolution.value =
        `${settings.cameraWidth}x${settings.cameraHeight}`;
    }

    applyTheme();
  }

  function saveSettingsFromForm() {
    const names = [
      "autoRotate",
      "rotationSpeed",
      "scanSound",
      "autosave",
      "showGrid",
      "showSkeleton",
      "hydrationGoal"
    ];

    names.forEach((name) => {
      const element = byId(name) ||
        $(`[name="${name}"]`) ||
        $(`[data-setting="${name}"]`);

      if (!element) return;

      if (element.type === "checkbox") {
        settings[name] = element.checked;
      } else if (name === "rotationSpeed" ||
                 name === "hydrationGoal") {
        const value = Number(element.value);

        if (Number.isFinite(value)) {
          settings[name] = value;
        }
      }
    });

    const resolution = byId("cameraResolution");

    if (resolution?.value) {
      const match = resolution.value.match(/^(\d+)x(\d+)$/);

      if (match) {
        settings.cameraWidth = Number(match[1]);
        settings.cameraHeight = Number(match[2]);
      }
    }

    settings.rotationSpeed = clamp(
      Number(settings.rotationSpeed) || 0.5,
      0.1,
      3
    );

    settings.hydrationGoal = clamp(
      Math.round(Number(settings.hydrationGoal) || 8),
      1,
      30
    );

    saveSettings();

    if (orbitControls) {
      orbitControls.autoRotate = Boolean(settings.autoRotate);
      orbitControls.autoRotateSpeed =
        Number(settings.rotationSpeed) || 0.5;
    }

    if (gridHelper) {
      gridHelper.visible = Boolean(settings.showGrid);
    }

    if (skeletonGroup) {
      skeletonGroup.visible = Boolean(settings.showSkeleton);
    }

    updateDashboard();
    notify("Settings saved.", "success");
  }

  function clearAllLocalData() {
    const confirmed = window.confirm(
      "Delete all saved photos, wellness entries, hydration logs, mood entries and sleep records from this browser? This cannot be undone."
    );

    if (!confirmed) return;

    captures = [];
    wellnessEntries = [];
    hydrationEntries = [];
    moodEntries = [];
    sleepEntries = [];

    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn("Could not remove local storage:", error);
      }
    });

    settings = { ...defaultSettings };

    saveSettings();
    loadSettingsIntoForm();
    updateDashboard();
    renderMoodHistory();
    renderSleepHistory();

    notify("Local application data cleared.", "success");
  }

  /* -------------------- BODY REGION INFORMATION -------------------- */

  const bodyRegions = {
    head: {
      title: "Head",
      description:
        "The head contains the brain and sensory organs. This illustration cannot inspect or assess them."
    },
    brain: {
      title: "Brain",
      description:
        "The brain supports thinking, memory, sensation, movement, and many automatic body functions. This is educational information, not a brain scan."
    },
    heart: {
      title: "Heart",
      description:
        "The heart pumps blood through the circulatory system. This viewer does not measure heart function."
    },
    lungs: {
      title: "Lungs",
      description:
        "The lungs exchange oxygen and carbon dioxide during breathing. This viewer cannot assess lung health."
    },
    chest: {
      title: "Chest",
      description:
        "The chest contains important organs including the heart and lungs. The 3D model is illustrative only."
    },
    abdomen: {
      title: "Abdomen",
      description:
        "The abdomen contains digestive organs and other structures. This illustration cannot detect abnormalities."
    },
    stomach: {
      title: "Stomach",
      description:
        "The stomach helps digest food. This application cannot examine your stomach or digestive system."
    },
    muscles: {
      title: "Muscles",
      description:
        "Muscles help move and stabilize the body. The displayed model does not measure muscle size or strength."
    },
    skeleton: {
      title: "Skeleton",
      description:
        "The skeleton supports the body and protects some organs. This illustrative overlay is not a bone scan."
    },
    arms: {
      title: "Arms",
      description:
        "The arms help with lifting, reaching, and manipulating objects. This viewer does not assess injuries."
    },
    legs: {
      title: "Legs",
      description:
        "The legs support standing and walking. This viewer cannot diagnose joint, bone, or muscle problems."
    },
    nervous: {
      title: "Nervous system",
      description:
        "The nervous system transmits signals throughout the body. It cannot be evaluated by this illustrative viewer."
    },
    circulation: {
      title: "Circulatory system",
      description:
        "The circulatory system transports blood, oxygen, and nutrients. This application does not measure blood flow."
    },
    digestive: {
      title: "Digestive system",
      description:
        "The digestive system processes food and absorbs nutrients. The illustration is not an internal scan."
    }
  };

  function showBodyRegion(regionName) {
    const key = String(regionName || "").toLowerCase();
    const region = bodyRegions[key];

    if (!region) {
      notify("Body region information is unavailable.", "warning");
      return;
    }

    const title = byId("bodyRegionTitle") ||
      byId("anatomyTitle");

    const description = byId("bodyRegionDescription") ||
      byId("anatomyDescription");

    if (title) title.textContent = region.title;
    if (description) description.textContent = region.description;

    const panel = byId("bodyRegionInfo") ||
      byId("anatomyInfo");

    if (panel) panel.hidden = false;
  }

  /* -------------------- EVENT HELPERS -------------------- */

  function bindClick(ids, handler) {
    ids.forEach((id) => {
      const element = byId(id);

      if (element) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          handler(event);
        });
      }
    });
  }

  function bindInput(ids, handler) {
    ids.forEach((id) => {
      const element = byId(id);

      if (element) {
        element.addEventListener("change", handler);
      }
    });
  }

  /* -------------------- STANDARD BUTTONS -------------------- */

  bindClick(
    ["startCamera", "startCameraBtn", "openCamera", "cameraStart"],
    startCamera
  );

  bindClick(
    ["stopCamera", "stopCameraBtn", "cameraStop"],
    () => stopCamera(true)
  );

  bindClick(
    ["switchCamera", "switchCameraBtn", "flipCamera"],
    switchCamera
  );

  bindClick(
    ["capturePhoto", "captureBtn", "takePhoto", "scanCapture"],
    () => capturePhoto("front")
  );

  bindClick(
    ["captureFront", "frontCapture"],
    () => capturePhoto("front")
  );

  bindClick(
    ["captureLeft", "leftCapture"],
    () => capturePhoto("left")
  );

  bindClick(
    ["captureRight", "rightCapture"],
    () => capturePhoto("right")
  );

  bindClick(
    ["captureBack", "backCapture"],
    () => capturePhoto("back")
  );

  bindClick(
    ["startScanSession", "start360Scan", "beginScan"],
    startScanSession
  );

  bindClick(
    ["captureNextView", "nextScanView", "capture360View"],
    captureNextView
  );

  bindClick(
    ["downloadAllCaptures", "downloadPhotos"],
    downloadAllCaptures
  );

  bindClick(
    ["downloadReport", "generateReport", "exportReport"],
    downloadReport
  );

  bindClick(
    ["previewReport", "showReport"],
    showReportPreview
  );

  bindClick(
    ["startWellnessCheck", "submitWellness", "runSelfCheck"],
    runWellnessCheck
  );

  bindClick(
    ["startBreathing", "startBreathingExercise", "breathStart"],
    startBreathingExercise
  );

  bindClick(
    ["stopBreathing", "stopBreathingExercise", "breathStop"],
    stopBreathingExercise
  );

  bindClick(
    ["addWater", "logWater", "drinkWater"],
    addWater
  );

  bindClick(
    ["undoWater", "removeWater"],
    undoWater
  );

  bindClick(
    ["saveMood", "addMood"],
    saveMood
  );

  bindClick(
    ["saveSleep", "addSleep"],
    saveSleep
  );

  bindClick(
    ["saveSettings", "applySettings"],
    saveSettingsFromForm
  );

  bindClick(
    ["toggleTheme", "themeToggle"],
    toggleTheme
  );

  bindClick(
    ["toggleAutoRotate", "autoRotateToggle"],
    toggleAutoRotate
  );

  bindClick(
    ["toggleSkeleton", "skeletonToggle"],
    toggleSkeleton
  );

  bindClick(
    ["toggleGrid", "gridToggle"],
    toggleGrid
  );

  bindClick(
    ["reset3DView", "resetViewer", "reset3D"],
    reset3DViewer
  );

  bindClick(
    ["clearLocalData", "clearData", "deleteAllData"],
    clearAllLocalData
  );

  bindClick(
    ["openSettings", "settingsButton"],
    () => showSection("settings")
  );

  bindClick(
    ["openCameraPage", "cameraPageButton"],
    () => showSection("camera")
  );

  bindClick(
    ["openWellnessPage", "wellnessPageButton"],
    () => showSection("wellness")
  );

  bindClick(
    ["openAnatomyPage", "anatomyPageButton"],
    () => showSection("anatomy")
  );

  bindClick(
    ["openDashboard", "dashboardButton"],
    () => showSection("dashboard")
  );

  /* -------------------- 3D VIEW BUTTONS -------------------- */

  bindClick(
    ["viewFront", "frontView", "bodyFrontView"],
    () => set3DView("front")
  );

  bindClick(
    ["viewBack", "backView", "bodyBackView"],
    () => set3DView("back")
  );

  bindClick(
    ["viewLeft", "leftView", "bodyLeftView"],
    () => set3DView("left")
  );

  bindClick(
    ["viewRight", "rightView", "bodyRightView"],
    () => set3DView("right")
  );

  bindClick(
    ["viewTop", "topView", "bodyTopView"],
    () => set3DView("top")
  );

  /* -------------------- DYNAMIC DATA ATTRIBUTES -------------------- */

  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-action], [data-section], [data-page-link], [data-view], [data-region]"
    );

    if (!target) return;

    const action = target.dataset.action;
    const section = target.dataset.section ||
      target.dataset.pageLink;
    const view = target.dataset.view;
    const region = target.dataset.region;

    if (section) {
      event.preventDefault();
      showSection(section);
      return;
    }

    if (view) {
      event.preventDefault();
      set3DView(view);
      return;
    }

    if (region) {
      event.preventDefault();
      showBodyRegion(region);
      return;
    }

    if (!action) return;

    const actions = {
      "start-camera": startCamera,
      "stop-camera": () => stopCamera(true),
      "switch-camera": switchCamera,
      "capture-photo": () => capturePhoto("front"),
      "capture-front": () => capturePhoto("front"),
      "capture-left": () => capturePhoto("left"),
      "capture-right": () => capturePhoto("right"),
      "capture-back": () => capturePhoto("back"),
      "start-scan": startScanSession,
      "capture-next-view": captureNextView,
      "download-photos": downloadAllCaptures,
      "download-report": downloadReport,
      "preview-report": showReportPreview,
      "wellness-check": runWellnessCheck,
      "breathing-start": startBreathingExercise,
      "breathing-stop": stopBreathingExercise,
      "add-water": addWater,
      "undo-water": undoWater,
      "save-mood": saveMood,
      "save-sleep": saveSleep,
      "save-settings": saveSettingsFromForm,
      "toggle-theme": toggleTheme,
      "toggle-rotation": toggleAutoRotate,
      "toggle-skeleton": toggleSkeleton,
      "toggle-grid": toggleGrid,
      "reset-3d": reset3DViewer,
      "clear-data": clearAllLocalData,
      "view-front": () => set3DView("front"),
      "view-back": () => set3DView("back"),
      "view-left": () => set3DView("left"),
      "view-right": () => set3DView("right"),
      "view-top": () => set3DView("top")
    };

    const handler = actions[action];

    if (handler) {
      event.preventDefault();
      handler();
    }
  });

  /* -------------------- SETTING INPUT LISTENERS -------------------- */

  bindInput(
    ["autoRotate", "rotationSpeed", "scanSound", "autosave",
     "showGrid", "showSkeleton", "hydrationGoal", "cameraResolution"],
    () => {
      saveSettingsFromForm();
    }
  );

  /* -------------------- OPTIONAL MOBILE MENU -------------------- */

  bindClick(
    ["menuToggle", "mobileMenuToggle", "hamburgerButton"],
    () => {
      const menu =
        byId("mobileMenu") ||
        byId("sidebar") ||
        $(".sidebar");

      if (!menu) return;

      menu.classList.toggle("open");
      menu.classList.toggle("active");
    }
  );

  /* -------------------- TAB SUPPORT -------------------- */

  $$("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.tabTarget;

      $$("[data-tab-target]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      $$("[data-tab-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== targetId;
      });
    });
  });

  /* -------------------- KEYBOARD SUPPORT -------------------- */

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;

    if (
      activeTag === "INPUT" ||
      activeTag === "TEXTAREA" ||
      activeTag === "SELECT" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (event.key === "Escape") {
      stopBreathingExercise();

      const menu =
        byId("mobileMenu") ||
        byId("sidebar") ||
        $(".sidebar");

      menu?.classList.remove("open", "active");
    }
  });

  /* -------------------- PAGE VISIBILITY -------------------- */

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && cameraActive) {
      stopCamera(false);
      updateCameraStatus("Camera stopped while the page was hidden.", "idle");
    }
  });

  window.addEventListener("beforeunload", () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    if (animationFrame3D !== null) {
      cancelAnimationFrame(animationFrame3D);
    }

    if (breathingInterval !== null) {
      clearInterval(breathingInterval);
    }
  });

  /* -------------------- ERROR HANDLING -------------------- */

  window.addEventListener("error", (event) => {
    console.error("Naol Health Scanner error:", event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Naol Health Scanner async error:", event.reason);
  });

  /* -------------------- INITIALIZE APP -------------------- */

  function initializeApp() {
    applyTheme();
    loadSettingsIntoForm();

    renderWellnessQuestions();
    renderCaptureGallery();
    renderMoodHistory();
    renderSleepHistory();

    updateDashboard();
    updateBreathingDisplay();
    updateScanProgress();
    updateCameraButtons();

    init3DViewer();

    console.info(
      "Naol Health Scanner 3D initialized. This application is for educational wellness tracking, not medical diagnosis."
    );
  }

  initializeApp();
});

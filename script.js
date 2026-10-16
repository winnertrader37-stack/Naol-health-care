"use strict";

/* ============================================================
   NAOL HEALTH SCANNER 3D
   Complete JavaScript
   Camera, Navigation, Wellness, Hydration, Diary, Reports,
   Breathing Exercises, Settings and 3D Viewer
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {

    /* ========================================================
       1. HELPER FUNCTIONS
       ======================================================== */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        Array.from(parent.querySelectorAll(selector));

    const getById = (id) => document.getElementById(id);

    function safeJSONParse(value, fallback) {
        try {
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            console.warn("Could not read saved data:", error);
            return fallback;
        }
    }

    function readStorage(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : safeJSONParse(value, fallback);
        } catch (error) {
            console.warn("Local storage is unavailable:", error);
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn("Could not save data:", error);
            showToast(
                "Could not save data. Browser storage may be full.",
                "error"
            );
            return false;
        }
    }

    function removeStorage(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn("Could not remove saved data:", error);
        }
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[char];
        });
    }

    function formatDate(date = new Date()) {
        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatDateTime(date = new Date()) {
        return date.toLocaleString();
    }

    function showToast(message, type = "success") {
        let container = getById("toastContainer");

        if (!container) {
            container = document.createElement("div");
            container.id = "toastContainer";

            Object.assign(container.style, {
                position: "fixed",
                right: "16px",
                bottom: "20px",
                zIndex: "99999",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                maxWidth: "min(360px, calc(100vw - 32px))"
            });

            document.body.appendChild(container);
        }

        const toast = document.createElement("div");

        const background =
            type === "error" ? "#b91c1c" :
            type === "warning" ? "#92400e" :
            "#047857";

        Object.assign(toast.style, {
            background,
            color: "#ffffff",
            padding: "13px 17px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,.22)",
            fontSize: "14px",
            lineHeight: "1.5",
            opacity: "0",
            transform: "translateY(10px)",
            transition: "opacity .2s ease, transform .2s ease",
            overflowWrap: "anywhere"
        });

        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(function () {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        });

        window.setTimeout(function () {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";

            window.setTimeout(function () {
                toast.remove();
            }, 250);
        }, 3200);
    }

    function bind(id, eventName, callback) {
        const element = getById(id);

        if (!element) {
            return;
        }

        element.addEventListener(eventName, function (event) {
            try {
                callback(event, element);
            } catch (error) {
                console.error("Action failed:", id, error);
                showToast("Something went wrong. Please try again.", "error");
            }
        });
    }

    function setText(id, value) {
        const element = getById(id);

        if (element) {
            element.textContent = value;
        }
    }

    function setHTML(id, value) {
        const element = getById(id);

        if (element) {
            element.innerHTML = value;
        }
    }

    function downloadText(filename, content, mimeType = "text/plain") {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = filename;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 1000);

            showToast("Download started.");
        } catch (error) {
            console.error(error);
            showToast("Download failed.", "error");
        }
    }


    /* ========================================================
       2. GLOBAL STATE
       ======================================================== */

    let cameraStream = null;
    let currentCamera = "environment";
    let breathingTimer = null;
    let breathingRunning = false;
    let breathingPhase = 0;
    let breathingSeconds = 4;
    let threeScene = null;
    let threeRenderer = null;
    let threeCamera = null;
    let threeControls = null;
    let threeModel = null;
    let threeAnimationId = null;
    let threeInitialized = false;
    let autoRotate = true;
    let skeletonVisible = false;
    let gridVisible = true;

    let gallery = readStorage("naol_gallery", []);
    let wellnessHistory = readStorage("naol_wellness_history", []);
    let diaryHistory = readStorage("naol_diary_history", []);
    let waterData = readStorage("naol_water_data", {
        date: new Date().toDateString(),
        amount: 0,
        goal: 2000
    });

    if (!Array.isArray(gallery)) gallery = [];
    if (!Array.isArray(wellnessHistory)) wellnessHistory = [];
    if (!Array.isArray(diaryHistory)) diaryHistory = [];

    if (!waterData || typeof waterData !== "object") {
        waterData = {
            date: new Date().toDateString(),
            amount: 0,
            goal: 2000
        };
    }

    if (waterData.date !== new Date().toDateString()) {
        waterData = {
            date: new Date().toDateString(),
            amount: 0,
            goal: Number(waterData.goal) || 2000
        };
    }


    /* ========================================================
       3. NAVIGATION
       ======================================================== */

    function navigateToPage(pageName) {
        const sections = $$(".page-section");

        let target = sections.find(function (section) {
            return section.id === pageName ||
                section.dataset.page === pageName;
        });

        if (!target) {
            console.warn("Page not found:", pageName);
            showToast("This page could not be found.", "error");
            return;
        }

        sections.forEach(function (section) {
            section.classList.remove("active");
            section.hidden = true;
        });

        target.classList.add("active");
        target.hidden = false;

        $$(".nav-button").forEach(function (button) {
            const active =
                button.dataset.section === pageName;

            button.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });

        const title = target.dataset.title ||
            target.querySelector("h1, h2")?.textContent ||
            pageName.charAt(0).toUpperCase() + pageName.slice(1);

        setText("pageTitle", title);
        setText("pageSubtitle", "Naol Health Scanner 3D");

        const sidebar = $(".sidebar");

        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove("open");
        }

        if (pageName === "viewer") {
            initialize3DViewer();
        }

        if (pageName === "camera") {
            updateCameraStatus();
        }

        if (pageName === "hydration") {
            renderHydration();
        }

        if (pageName === "diary") {
            renderDiaryHistory();
        }

        if (pageName === "wellness") {
            renderWellnessHistory();
        }

        if (pageName === "reports") {
            renderReportSummary();
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    $$(".nav-button").forEach(function (button) {
        button.addEventListener("click", function (event) {
            event.preventDefault();

            const pageName = button.dataset.section;

            if (pageName) {
                navigateToPage(pageName);
            }
        });
    });

    bind("menuToggle", "click", function () {
        const sidebar = $(".sidebar");

        if (sidebar) {
            sidebar.classList.toggle("open");
        } else {
            showToast("Navigation menu is unavailable.", "warning");
        }
    });

    $$(".nav-button").forEach(function (button) {
        button.setAttribute("type", "button");
    });

    // Ensure only the current page is visible on startup.
    (function initializeNavigation() {
        const sections = $$(".page-section");

        if (!sections.length) {
            console.warn("No .page-section elements were found.");
            return;
        }

        let initialPage = sections.find(function (section) {
            return section.classList.contains("active");
        }) || sections[0];

        sections.forEach(function (section) {
            const isActive = section === initialPage;

            section.classList.toggle("active", isActive);
            section.hidden = !isActive;
        });

        $$(".nav-button").forEach(function (button) {
            button.classList.toggle(
                "active",
                button.dataset.section === initialPage.id
            );
        });
    })();


    /* ========================================================
       4. THEME SETTINGS
       ======================================================== */

    function applyTheme(theme) {
        const isDark = theme === "dark";

        document.body.classList.toggle("dark-theme", isDark);
        document.documentElement.dataset.theme = theme;

        try {
            localStorage.setItem("naol_theme", theme);
        } catch (error) {
            console.warn("Theme preference could not be saved.");
        }

        const themeButton = getById("themeToggle");

        if (themeButton) {
            themeButton.textContent = isDark ? "☀️" : "🌙";
            themeButton.setAttribute(
                "aria-label",
                isDark ? "Switch to light mode" : "Switch to dark mode"
            );
        }

        const settingsToggle = getById("settingsThemeToggle");

        if (settingsToggle) {
            settingsToggle.checked = isDark;
        }
    }

    let savedTheme = "dark";

    try {
        savedTheme = localStorage.getItem("naol_theme") || "dark";
    } catch (error) {
        console.warn("Could not read theme preference.");
    }

    applyTheme(savedTheme);

    bind("themeToggle", "click", function () {
        const isDark = document.body.classList.contains("dark-theme");

        applyTheme(isDark ? "light" : "dark");

        showToast(
            isDark ? "Light theme enabled." : "Dark theme enabled."
        );
    });

    bind("settingsThemeToggle", "change", function (event, element) {
        applyTheme(element.checked ? "dark" : "light");
        showToast("Theme updated.");
    });

    bind("soundToggle", "change", function (event, element) {
        try {
            localStorage.setItem(
                "naol_sound_enabled",
                element.checked ? "true" : "false"
            );
        } catch (error) {
            // Sound preference is optional.
        }

        showToast(
            element.checked ? "Sound preference enabled." :
                "Sound preference disabled."
        );
    });


    /* ========================================================
       5. CAMERA SYSTEM
       ======================================================== */

    function updateCameraStatus(message) {
        if (message) {
            setText("cameraStatus", message);
            return;
        }

        const video = getById("cameraVideo");

        if (cameraStream && video && video.srcObject) {
            setText("cameraStatus", "Camera is running");
        } else {
            setText("cameraStatus", "Camera is not active");
        }
    }

    function stopCameraStream() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(function (track) {
                track.stop();
            });

            cameraStream = null;
        }

        const video = getById("cameraVideo");

        if (video) {
            video.pause();
            video.srcObject = null;
        }

        const placeholder = getById("cameraPlaceholder");

        if (placeholder) {
            placeholder.hidden = false;
        }

        updateCameraStatus("Camera stopped");
    }

    async function startCameraStream() {
        const video = getById("cameraVideo");

        if (!video) {
            showToast("Camera video element was not found in index.html.", "error");
            return;
        }

        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            updateCameraStatus("Camera requires HTTPS or localhost.");

            showToast(
                "Open this website through HTTPS and allow camera access.",
                "error"
            );

            return;
        }

        stopCameraStream();

        updateCameraStatus("Requesting camera permission...");

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: currentCamera,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            video.srcObject = cameraStream;
            video.muted = true;
            video.playsInline = true;

            await video.play();

            const placeholder = getById("cameraPlaceholder");

            if (placeholder) {
                placeholder.hidden = true;
            }

            updateCameraStatus("Camera is running");

            showToast("Camera started successfully.");

        } catch (error) {
            console.error("Camera error:", error);

            let message = "Unable to open camera.";

            if (error.name === "NotAllowedError" ||
                error.name === "PermissionDeniedError") {

                message = "Camera permission denied. Allow camera access in browser settings.";

            } else if (error.name === "NotFoundError") {

                message = "No compatible camera was found.";

            } else if (error.name === "NotReadableError") {

                message = "Camera may already be in use by another app.";

            } else if (error.name === "OverconstrainedError") {

                message = "Requested camera settings are not supported.";

            } else if (error.name === "SecurityError") {

                message = "Camera access requires a secure HTTPS connection.";
            }

            updateCameraStatus(message);
            showToast(message, "error");
        }
    }

    bind("startCamera", "click", startCameraStream);

    bind("stopCamera", "click", function () {
        stopCameraStream();
        showToast("Camera stopped.");
    });

    bind("switchCamera", "click", async function () {
        currentCamera =
            currentCamera === "environment" ? "user" : "environment";

        if (cameraStream) {
            await startCameraStream();
        } else {
            showToast(
                currentCamera === "user" ?
                    "Front camera selected." :
                    "Rear camera selected."
            );
        }
    });

    function captureCameraPhoto() {
        const video = getById("cameraVideo");
        const canvas = getById("captureCanvas") ||
            getById("cameraCanvas");

        if (!video || !canvas) {
            showToast("Camera or canvas element was not found.", "error");
            return;
        }

        if (!video.srcObject ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !video.videoWidth) {

            showToast("Start the camera and wait for the preview.", "warning");
            return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
            showToast("Photo capture is unavailable.", "error");
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        canvas.toBlob(function (blob) {
            if (!blob) {
                showToast("Could not create the photo.", "error");
                return;
            }

            const reader = new FileReader();

            reader.onload = function () {
                const photo = {
                    id: Date.now() + Math.random(),
                    date: new Date().toISOString(),
                    data: reader.result
                };

                gallery.unshift(photo);

                // Avoid exceeding localStorage quota.
                const maxPhotos = 8;

                gallery = gallery.slice(0, maxPhotos);

                const saved = writeStorage("naol_gallery", gallery);

                renderGallery();

                if (saved) {
                    showToast("Photo captured and saved.");
                }
            };

            reader.onerror = function () {
                showToast("Could not read the captured photo.", "error");
            };

            reader.readAsDataURL(blob);

        }, "image/jpeg", 0.88);
    }

    bind("capturePhoto", "click", captureCameraPhoto);

    let scanInterval = null;

    bind("startScan", "click", function () {
        if (!cameraStream) {
            showToast("Start the camera before scanning.", "warning");
            return;
        }

        if (scanInterval) {
            showToast("Camera preview is already active.");
            return;
        }

        updateCameraStatus("Preview monitoring is active.");

        scanInterval = window.setInterval(function () {
            if (!cameraStream) {
                clearInterval(scanInterval);
                scanInterval = null;
                return;
            }

            updateCameraStatus(
                "Camera preview active — no medical diagnosis performed."
            );
        }, 2000);

        showToast(
            "Preview monitoring started. This does not scan or diagnose the body."
        );
    });

    function stopPreviewMonitoring() {
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }

        updateCameraStatus(
            cameraStream ? "Camera is running" : "Camera is not active"
        );
    }

    bind("stopScan", "click", function () {
        stopPreviewMonitoring();
        showToast("Preview monitoring stopped.");
    });


    /* ========================================================
       6. PHOTO GALLERY
       ======================================================== */

    function renderGallery() {
        setText("galleryCount", String(gallery.length));

        const container = getById("captureGallery");

        if (!container) {
            return;
        }

        if (!gallery.length) {
            container.innerHTML =
                '<p class="empty-state">No photos captured yet.</p>';
            return;
        }

        container.innerHTML = gallery.map(function (photo, index) {
            return `
                <div class="gallery-item"
                     style="display:inline-block;vertical-align:top;
                            margin:6px;max-width:180px">

                    <img
                        src="${photo.data}"
                        alt="Captured photo ${index + 1}"
                        loading="lazy"
                        style="width:160px;height:120px;object-fit:cover;
                               border-radius:10px;display:block">

                    <div style="margin-top:6px;font-size:12px">
                        ${escapeHTML(formatDateTime(new Date(photo.date)))}
                    </div>

                    <button
                        type="button"
                        data-download-photo="${index}"
                        style="margin-top:6px">

                        Download
                    </button>
                </div>
            `;
        }).join("");
    }

    bind("captureGallery", "click", function (event, element) {
        const button = event.target.closest("[data-download-photo]");

        if (!button || !element.contains(button)) {
            return;
        }

        const index = Number(button.dataset.downloadPhoto);
        const photo = gallery[index];

        if (!photo || !photo.data) {
            showToast("Photo not found.", "error");
            return;
        }

        const link = document.createElement("a");

        link.href = photo.data;
        link.download = "naol-photo-" + (index + 1) + ".jpg";

        document.body.appendChild(link);
        link.click();
        link.remove();
    });

    bind("downloadAllPhotos", "click", function () {
        if (!gallery.length) {
            showToast("There are no photos to download.", "warning");
            return;
        }

        // Download photos individually because no ZIP library is included.
        gallery.forEach(function (photo, index) {
            window.setTimeout(function () {
                const link = document.createElement("a");

                link.href = photo.data;
                link.download = "naol-photo-" + (index + 1) + ".jpg";

                document.body.appendChild(link);
                link.click();
                link.remove();
            }, index * 250);
        });

        showToast("Photo downloads started.");
    });

    bind("clearGallery", "click", function () {
        if (!gallery.length) {
            showToast("Gallery is already empty.");
            return;
        }

        if (!window.confirm("Delete all saved photos?")) {
            return;
        }

        gallery = [];
        writeStorage("naol_gallery", gallery);
        renderGallery();

        showToast("Gallery cleared.");
    });

    renderGallery();


    /* ========================================================
       7. 3D HUMAN VIEWER
       ======================================================== */

    function createFallback3D() {
        const container = getById("body3DViewer");

        if (!container || container.dataset.fallbackReady === "true") {
            return;
        }

        container.dataset.fallbackReady = "true";

        container.innerHTML = `
            <div class="naol-fallback-viewer"
                 style="min-height:350px;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;
                        gap:15px;perspective:800px;overflow:hidden;
                        border-radius:16px">

                <div class="naol-fallback-person"
                     style="position:relative;width:150px;height:245px;
                            transform-style:preserve-3d;
                            animation:naolFloat 4s ease-in-out infinite">

                    <div style="position:absolute;top:0;left:52px;
                                width:46px;height:46px;border-radius:50%;
                                background:linear-gradient(135deg,#f6c99c,#dca06f);
                                box-shadow:inset -5px -3px 8px #9a6347">
                    </div>

                    <div style="position:absolute;top:50px;left:38px;
                                width:74px;height:95px;border-radius:25px 25px 15px 15px;
                                background:linear-gradient(120deg,#42d7ee,#2563eb);
                                box-shadow:inset -10px -5px 12px rgba(0,0,0,.2)">
                    </div>

                    <div style="position:absolute;top:55px;left:12px;
                                width:23px;height:90px;border-radius:14px;
                                background:linear-gradient(90deg,#f2c39d,#cf926b);
                                transform:rotate(8deg)">
                    </div>

                    <div style="position:absolute;top:55px;right:12px;
                                width:23px;height:90px;border-radius:14px;
                                background:linear-gradient(90deg,#cf926b,#f2c39d);
                                transform:rotate(-8deg)">
                    </div>

                    <div style="position:absolute;top:143px;left:42px;
                                width:28px;height:95px;border-radius:13px;
                                background:linear-gradient(90deg,#334155,#64748b)">
                    </div>

                    <div style="position:absolute;top:143px;right:42px;
                                width:28px;height:95px;border-radius:13px;
                                background:linear-gradient(90deg,#64748b,#334155)">
                    </div>
                </div>

                <p style="text-align:center;max-width:280px;padding:0 12px">
                    Illustrative 3D-style human model.
                    External 3D rendering is not available.
                </p>
            </div>

            <style>
                @keyframes naolFloat {
                    0%,100% { transform: rotateY(-8deg) translateY(0); }
                    50% { transform: rotateY(8deg) translateY(-7px); }
                }
            </style>
        `;
    }

    async function initialize3DViewer() {
        if (threeInitialized) {
            return;
        }

        const container = getById("body3DViewer");

        if (!container) {
            return;
        }

        threeInitialized = true;

        // Keep the website functional if external 3D libraries are blocked.
        try {
            const THREE = await import(
                "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
            );

            const { OrbitControls } = await import(
                "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"
            );

            build3DViewer(THREE, OrbitControls, container);

        } catch (error) {
            console.warn("Three.js could not load:", error);

            createFallback3D();

            showToast(
                "Using the basic 3D-style model. Check your internet connection for full 3D.",
                "warning"
            );
        }
    }

    function build3DViewer(THREE, OrbitControls, container) {
        container.innerHTML = "";

        const width = Math.max(container.clientWidth, 300);
        const height = Math.max(container.clientHeight, 350);

        threeScene = new THREE.Scene();
        threeScene.background = new THREE.Color(0x101827);

        threeCamera = new THREE.PerspectiveCamera(
            45,
            width / height,
            0.1,
            100
        );

        threeCamera.position.set(4, 3, 7);

        threeRenderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        threeRenderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        threeRenderer.setSize(width, height);

        container.appendChild(threeRenderer.domElement);

        threeRenderer.domElement.style.display = "block";
        threeRenderer.domElement.style.width = "100%";
        threeRenderer.domElement.style.borderRadius = "14px";

        const ambient = new THREE.HemisphereLight(
            0xffffff,
            0x334155,
            2
        );

        threeScene.add(ambient);

        const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
        mainLight.position.set(4, 8, 5);
        threeScene.add(mainLight);

        const fillLight = new THREE.PointLight(0x38bdf8, 25);
        fillLight.position.set(-4, 2, -3);
        threeScene.add(fillLight);

        if (gridVisible) {
            const grid = new THREE.GridHelper(
                8,
                16,
                0x38bdf8,
                0x334155
            );

            grid.position.y = -2.1;
            threeScene.add(grid);
            threeScene.userData.grid = grid;
        }

        threeControls = new OrbitControls(
            threeCamera,
            threeRenderer.domElement
        );

        threeControls.enableDamping = true;
        threeControls.dampingFactor = 0.06;
        threeControls.target.set(0, 0, 0);

        const person = new THREE.Group();

        function createSphere(radius, position, color, scale = [1, 1, 1]) {
            const geometry = new THREE.SphereGeometry(radius, 24, 20);

            const material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.5,
                metalness: 0.05
            });

            const mesh = new THREE.Mesh(geometry, material);

            mesh.position.set(...position);
            mesh.scale.set(...scale);

            person.add(mesh);

            return mesh;
        }

        function createCapsule(radius, length, position, color) {
            const geometry = new THREE.CapsuleGeometry(
                radius,
                length,
                6,
                12
            );

            const material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.55
            });

            const mesh = new THREE.Mesh(geometry, material);

            mesh.position.set(...position);

            person.add(mesh);

            return mesh;
        }

        const skin = 0xdba47c;
        const shirt = 0x38bdf8;
        const trousers = 0x334155;
        const joints = [];

        // Head and neck.
        createSphere(0.35, [0, 1.55, 0], skin, [0.85, 1.05, 0.9]);

        createCapsule(0.13, 0.15, [0, 1.12, 0], skin);

        // Torso.
        createSphere(0.57, [0, 0.45, 0], shirt, [0.8, 1.15, 0.5]);

        // Pelvis.
        createSphere(0.38, [0, -0.35, 0], trousers, [1, 0.7, 0.6]);

        // Arms.
        const leftUpperArm = createCapsule(
            0.15, 0.52, [-0.58, 0.53, 0], skin
        );

        leftUpperArm.rotation.z = 0.15;

        const rightUpperArm = createCapsule(
            0.15, 0.52, [0.58, 0.53, 0], skin
        );

        rightUpperArm.rotation.z = -0.15;

        const leftForearm = createCapsule(
            0.12, 0.48, [-0.69, -0.1, 0], skin
        );

        leftForearm.rotation.z = 0.06;

        const rightForearm = createCapsule(
            0.12, 0.48, [0.69, -0.1, 0], skin
        );

        rightForearm.rotation.z = -0.06;

        // Legs.
        const leftLeg = createCapsule(
            0.18, 0.78, [-0.22, -1.1, 0], trousers
        );

        const rightLeg = createCapsule(
            0.18, 0.78, [0.22, -1.1, 0], trousers
        );

        // Feet.
        createSphere(0.19, [-0.22, -1.68, 0.08], 0xe5e7eb, [1, 0.55, 1.6]);
        createSphere(0.19, [0.22, -1.68, 0.08], 0xe5e7eb, [1, 0.55, 1.6]);

        // Decorative joints.
        joints.push(
            createSphere(0.14, [-0.58, 0.25, 0], skin),
            createSphere(0.14, [0.58, 0.25, 0], skin),
            createSphere(0.12, [-0.69, -0.38, 0], skin),
            createSphere(0.12, [0.69, -0.38, 0], skin),
            createSphere(0.2, [-0.22, -0.8, 0], trousers),
            createSphere(0.2, [0.22, -0.8, 0], trousers)
        );

        // The model is illustrative and does not represent real anatomy.
        threeModel = person;

        threeScene.add(person);

        // Optional decorative outline.
        const edges = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(1.6, 3.8, 0.7)
        );

        const outline = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.14
            })
        );

        outline.position.y = 0.05;
        threeScene.add(outline);

        threeScene.userData.person = person;
        threeScene.userData.outline = outline;
        threeScene.userData.joints = joints;
        threeScene.userData.legs = [leftLeg, rightLeg];

        const resizeObserver = new ResizeObserver(function () {
            if (!threeRenderer || !threeCamera) {
                return;
            }

            const newWidth = Math.max(container.clientWidth, 300);
            const newHeight = Math.max(container.clientHeight, 350);

            threeCamera.aspect = newWidth / newHeight;
            threeCamera.updateProjectionMatrix();

            threeRenderer.setSize(newWidth, newHeight);
        });

        resizeObserver.observe(container);

        function animate() {
            threeAnimationId = requestAnimationFrame(animate);

            if (autoRotate && threeModel) {
                threeModel.rotation.y += 0.003;
            }

            if (threeControls) {
                threeControls.update();
            }

            threeRenderer.render(threeScene, threeCamera);
        }

        animate();

        showToast("3D viewer loaded.");
    }

    function set3DView(view) {
        if (!threeCamera || !threeControls) {
            initialize3DViewer();

            showToast(
                "Open the 3D viewer and wait for it to load.",
                "warning"
            );

            return;
        }

        const views = {
            front: [0, 1.2, 7],
            back: [0, 1.2, -7],
            left: [-7, 1.2, 0],
            right: [7, 1.2, 0],
            top: [0, 8, 0.1]
        };

        const position = views[view];

        if (!position) {
            return;
        }

        threeCamera.position.set(...position);
        threeControls.target.set(0, 0, 0);
        threeControls.update();
    }

    bind("viewFront", "click", function () {
        set3DView("front");
    });

    bind("viewBack", "click", function () {
        set3DView("back");
    });

    bind("viewLeft", "click", function () {
        set3DView("left");
    });

    bind("viewRight", "click", function () {
        set3DView("right");
    });

    bind("viewTop", "click", function () {
        set3DView("top");
    });

    bind("reset3D", "click", function () {
        if (threeModel) {
            threeModel.rotation.set(0, 0, 0);
        }

        set3DView("front");

        showToast("3D view reset.");
    });

    bind("autoRotate", "change", function (event, element) {
        autoRotate = element.checked;

        if (autoRotate && !threeInitialized) {
            initialize3DViewer();
        }

        showToast(
            autoRotate ? "Auto-rotation enabled." :
                "Auto-rotation disabled."
        );
    });

    bind("autoRotateSetting", "change", function (event, element) {
        autoRotate = element.checked;

        const mainToggle = getById("autoRotate");

        if (mainToggle) {
            mainToggle.checked = autoRotate;
        }

        showToast(
            autoRotate ? "Auto-rotation enabled." :
                "Auto-rotation disabled."
        );
    });

    bind("toggleGrid", "click", function () {
        gridVisible = !gridVisible;

        if (threeScene) {
            const grid = threeScene.userData.grid;

            if (grid) {
                grid.visible = gridVisible;
            }
        }

        showToast(gridVisible ? "Grid enabled." : "Grid disabled.");
    });

    bind("toggleSkeleton", "click", function () {
        skeletonVisible = !skeletonVisible;

        if (threeScene) {
            const joints = threeScene.userData.joints || [];

            joints.forEach(function (joint) {
                joint.visible = skeletonVisible;
            });

            const outline = threeScene.userData.outline;

            if (outline) {
                outline.visible = skeletonVisible;
            }
        }

        showToast(
            skeletonVisible ?
                "Illustrative structure enabled." :
                "Illustrative structure hidden."
        );
    });

    const anatomyDescriptions = {
        head: "Head: an illustrative part of the 3D model.",
        brain: "Brain: this model does not visualize or measure brain activity.",
        chest: "Chest: the model cannot measure heart or lung function.",
        heart: "Heart: heart health cannot be determined using this illustration.",
        lungs: "Lungs: this illustration cannot assess breathing or lung function.",
        abdomen: "Abdomen: no internal organs are medically visualized.",
        arms: "Arms: illustrative upper limbs.",
        legs: "Legs: illustrative lower limbs."
    };

    $$("[data-region]").forEach(function (button) {
        button.addEventListener("click", function () {
            const region = button.dataset.region;
            const description = anatomyDescriptions[region] ||
                "This is an illustrative body region.";

            setText("anatomyInfo", description);

            $$("#body3DViewer [data-highlight]").forEach(function (item) {
                item.classList.remove("selected");
            });

            button.classList.add("selected");
        });
    });


    /* ========================================================
       8. WELLNESS ASSESSMENT
       ======================================================== */

    function renderWellnessHistory() {
        const container = getById("wellnessHistory");

        if (!container) {
            return;
        }

        if (!wellnessHistory.length) {
            container.innerHTML =
                '<p class="empty-state">No wellness entries yet.</p>';
            return;
        }

        container.innerHTML = wellnessHistory
            .slice(0, 10)
            .map(function (item) {
                return `
                    <article class="history-item"
                             style="padding:12px;margin-bottom:10px;
                                    border-radius:10px">

                        <strong>${escapeHTML(item.date)}</strong>

                        <p>
                            Energy: ${escapeHTML(item.energy)}/5 |
                            Sleep: ${escapeHTML(item.sleep)} hours
                        </p>

                        <p>
                            Mood: ${escapeHTML(item.mood)} |
                            Activity: ${escapeHTML(item.activity)}
                        </p>

                        <p>Water: ${escapeHTML(item.water)} ml</p>

                        <p>${escapeHTML(item.notes || "")}</p>
                    </article>
                `;
            }).join("");
    }

    bind("wellnessForm", "submit", function (event, form) {
        event.preventDefault();

        const formData = new FormData(form);

        const entry = {
            date: formatDateTime(),
            timestamp: Date.now(),
            energy: String(formData.get("energy") || "3"),
            sleep: String(formData.get("sleep") || "0"),
            mood: String(formData.get("mood") || "Okay"),
            activity: String(formData.get("activity") || "Light"),
            water: String(formData.get("water") || "0"),
            notes: String(
                formData.get("wellnessNotes") ||
                getById("wellnessNotes")?.value ||
                ""
            ).slice(0, 1000)
        };

        wellnessHistory.unshift(entry);
        wellnessHistory = wellnessHistory.slice(0, 100);

        writeStorage("naol_wellness_history", wellnessHistory);

        const result = getById("wellnessResult");

        if (result) {
            result.hidden = false;

            result.textContent =
                "Your wellness entry has been saved. " +
                "Review your sleep, mood, hydration, and activity habits over time. " +
                "This is not a medical diagnosis.";
        }

        renderWellnessHistory();

        showToast("Wellness entry saved.");
    });

    renderWellnessHistory();


    /* ========================================================
       9. BREATHING EXERCISE
       ======================================================== */

    const breathingPhases = [
        {
            label: "Breathe in",
            duration: 4,
            scale: 1.35
        },
        {
            label: "Hold",
            duration: 4,
            scale: 1.35
        },
        {
            label: "Breathe out",
            duration: 4,
            scale: 0.85
        },
        {
            label: "Rest",
            duration: 2,
            scale: 0.85
        }
    ];

    function renderBreathingPhase() {
        const phase = breathingPhases[breathingPhase];

        setText("breathingInstruction", phase.label);
        setText("breathingCountdown", String(breathingSeconds));

        const orb = getById("breathingOrb");

        if (orb) {
            orb.style.transition = "transform 1s ease-in-out";
            orb.style.transform = "scale(" + phase.scale + ")";
        }
    }

    function stopBreathingExercise() {
        breathingRunning = false;

        if (breathingTimer) {
            clearInterval(breathingTimer);
            breathingTimer = null;
        }

        setText("breathingInstruction", "Ready to breathe?");
        setText("breathingCountdown", "0");

        const orb = getById("breathingOrb");

        if (orb) {
            orb.style.transform = "scale(1)";
        }
    }

    function startBreathingExercise() {
        if (breathingRunning) {
            showToast("Breathing exercise is already running.");
            return;
        }

        breathingRunning = true;
        breathingPhase = 0;
        breathingSeconds = breathingPhases[0].duration;

        renderBreathingPhase();

        breathingTimer = window.setInterval(function () {
            if (!breathingRunning) {
                return;
            }

            breathingSeconds--;

            if (breathingSeconds <= 0) {
                breathingPhase =
                    (breathingPhase + 1) % breathingPhases.length;

                breathingSeconds =
                    breathingPhases[breathingPhase].duration;
            }

            renderBreathingPhase();

        }, 1000);

        showToast("Breathing exercise started.");
    }

    bind("startBreathing", "click", startBreathingExercise);

    bind("stopBreathing", "click", function () {
        stopBreathingExercise();
        showToast("Breathing exercise stopped.");
    });


    /* ========================================================
       10. HYDRATION TRACKER
       ======================================================== */

    function renderHydration() {
        if (waterData.date !== new Date().toDateString()) {
            waterData = {
                date: new Date().toDateString(),
                amount: 0,
                goal: Number(waterData.goal) || 2000
            };
        }

        waterData.amount = Math.max(
            0,
            Number(waterData.amount) || 0
        );

        waterData.goal = Math.max(
            1,
            Number(waterData.goal) || 2000
        );

        const percentage = Math.min(
            100,
            Math.round((waterData.amount / waterData.goal) * 100)
        );

        setText("waterProgress", percentage + "%");
        setText(
            "waterGoalText",
            waterData.amount + " / " + waterData.goal + " ml"
        );

        const progressElement = getById("waterProgress");

        if (progressElement) {
            if (progressElement.tagName === "PROGRESS") {
                progressElement.max = 100;
                progressElement.value = percentage;
            } else {
                progressElement.style.width = percentage + "%";
            }
        }

        const goalInput = getById("waterGoal");

        if (goalInput && !goalInput.matches(":focus")) {
            goalInput.value = waterData.goal;
        }

        writeStorage("naol_water_data", waterData);
    }

    function addWater(amount) {
        amount = Number(amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            showToast("Enter a valid water amount.", "error");
            return;
        }

        waterData.amount += amount;

        writeStorage("naol_water_data", waterData);

        renderHydration();

        showToast(amount + " ml added.");
    }

    bind("addWater", "click", function () {
        const input = getById("waterAmount");

        if (!input) {
            showToast("Water amount input not found.", "error");
            return;
        }

        const amount = Number(input.value);

        if (!amount || amount <= 0) {
            showToast("Enter a positive water amount.", "warning");
            return;
        }

        addWater(amount);
        input.value = "";
    });

    bind("addWater500", "click", function () {
        addWater(500);
    });

    bind("resetWater", "click", function () {
        if (!window.confirm("Reset today's water tracker?")) {
            return;
        }

        waterData.amount = 0;

        writeStorage("naol_water_data", waterData);

        renderHydration();

        showToast("Water tracker reset.");
    });

    bind("saveWaterGoal", "click", function () {
        const input = getById("waterGoal");

        if (!input) {
            return;
        }

        const goal = Number(input.value);

        if (!Number.isFinite(goal) || goal < 100 || goal > 10000) {
            showToast(
                "Choose a goal between 100 and 10000 ml.",
                "warning"
            );

            return;
        }

        waterData.goal = Math.round(goal);

        writeStorage("naol_water_data", waterData);

        renderHydration();

        showToast("Daily water goal saved.");
    });

    renderHydration();


    /* ========================================================
       11. MOOD AND SLEEP DIARY
       ======================================================== */

    function renderDiaryHistory() {
        const container = getById("diaryHistory");

        if (!container) {
            return;
        }

        if (!diaryHistory.length) {
            container.innerHTML =
                '<p class="empty-state">No diary entries yet.</p>';
            return;
        }

        container.innerHTML = diaryHistory
            .slice(0, 30)
            .map(function (entry) {
                return `
                    <article class="diary-entry"
                             style="padding:12px;margin-bottom:10px;
                                    border-radius:10px">

                        <strong>${escapeHTML(entry.date)}</strong>

                        <p>Mood: ${escapeHTML(entry.mood)}</p>

                        <p>Sleep: ${escapeHTML(entry.sleep)} hours</p>

                        <p>${escapeHTML(entry.notes || "")}</p>
                    </article>
                `;
            }).join("");
    }

    bind("diaryForm", "submit", function (event, form) {
        event.preventDefault();

        const formData = new FormData(form);

        const dateValue =
            String(formData.get("diaryDate") ||
                getById("diaryDate")?.value ||
                new Date().toISOString().slice(0, 10));

        const moodValue =
            String(formData.get("diaryMood") ||
                getById("diaryMood")?.value ||
                "Okay");

        const sleepValue =
            Number(formData.get("sleepHours") ||
                getById("sleepHours")?.value ||
                0);

        const notesValue =
            String(formData.get("diaryNotes") ||
                getById("diaryNotes")?.value ||
                "");

        if (!Number.isFinite(sleepValue) ||
            sleepValue < 0 ||
            sleepValue > 24) {

            showToast("Sleep hours must be between 0 and 24.", "error");
            return;
        }

        const entry = {
            id: Date.now(),
            date: dateValue,
            mood: moodValue,
            sleep: sleepValue,
            notes: notesValue.slice(0, 2000),
            savedAt: new Date().toISOString()
        };

        diaryHistory.unshift(entry);
        diaryHistory = diaryHistory.slice(0, 200);

        writeStorage("naol_diary_history", diaryHistory);

        renderDiaryHistory();

        showToast("Diary entry saved.");

        form.reset();

        const dateInput = getById("diaryDate");

        if (dateInput) {
            dateInput.value = new Date().toISOString().slice(0, 10);
        }
    });

    bind("exportDiary", "click", function () {
        if (!diaryHistory.length) {
            showToast("No diary entries to export.", "warning");
            return;
        }

        const csvRows = [
            ["Date", "Mood", "Sleep Hours", "Notes"]
        ];

        diaryHistory.forEach(function (entry) {
            csvRows.push([
                entry.date,
                entry.mood,
                entry.sleep,
                entry.notes || ""
            ]);
        });

        const csv = csvRows.map(function (row) {
            return row.map(function (cell) {
                return '"' +
                    String(cell ?? "").replace(/"/g, '""') +
                    '"';
            }).join(",");
        }).join("\r\n");

        downloadText(
            "naol-diary.csv",
            "\uFEFF" + csv,
            "text/csv;charset=utf-8"
        );
    });

    const diaryDateInput = getById("diaryDate");

    if (diaryDateInput && !diaryDateInput.value) {
        diaryDateInput.value = new Date().toISOString().slice(0, 10);
    }

    renderDiaryHistory();


    /* ========================================================
       12. REPORTS
       ======================================================== */

    function renderReportSummary() {
        const container = getById("reportOutput");

        if (!container) {
            return;
        }

        const latestWellness = wellnessHistory[0];
        const today = new Date().toDateString();

        const todaysDiary = diaryHistory.filter(function (entry) {
            return entry.date === new Date().toISOString().slice(0, 10);
        });

        container.innerHTML = `
            <div class="report-summary">
                <h3>Wellness Summary</h3>

                <p><strong>Report date:</strong>
                    ${escapeHTML(formatDate())}</p>

                <p><strong>Wellness entries:</strong>
                    ${wellnessHistory.length}</p>

                <p><strong>Diary entries:</strong>
                    ${diaryHistory.length}</p>

                <p><strong>Today's diary entries:</strong>
                    ${todaysDiary.length}</p>

                <p><strong>Today's recorded water:</strong>
                    ${Number(waterData.amount) || 0} ml</p>

                <p><strong>Water goal:</strong>
                    ${Number(waterData.goal) || 2000} ml</p>

                <p><strong>Saved photos:</strong>
                    ${gallery.length}</p>

                ${
                    latestWellness
                        ? `
                            <hr>

                            <h4>Latest Wellness Entry</h4>

                            <p>Energy: ${escapeHTML(latestWellness.energy)}/5</p>

                            <p>Sleep: ${escapeHTML(latestWellness.sleep)} hours</p>

                            <p>Mood: ${escapeHTML(latestWellness.mood)}</p>

                            <p>Activity: ${escapeHTML(latestWellness.activity)}</p>
                        `
                        : "<p>No wellness entries have been saved yet.</p>"
                }

                <hr>

                <p>
                    This report summarizes user-entered information.
                    It is not a medical examination or diagnosis.
                </p>
            </div>
        `;
    }

    bind("generateReport", "click", function () {
        renderReportSummary();
        showToast("Report generated.");
    });

    bind("downloadReport", "click", function () {
        const report = {
            title: "Naol Health Scanner 3D - Wellness Report",
            generatedAt: new Date().toISOString(),
            disclaimer:
                "This report is based on user-entered information and is not a medical diagnosis.",
            water: waterData,
            wellnessHistory,
            diaryHistory,
            photoCount: gallery.length
        };

        downloadText(
            "naol-wellness-report.json",
            JSON.stringify(report, null, 2),
            "application/json"
        );
    });

    renderReportSummary();


    /* ========================================================
       13. CLEAR LOCAL DATA
       ======================================================== */

    bind("clearLocalData", "click", function () {
        const confirmed = window.confirm(
            "Delete saved wellness entries, diary records, photos, " +
            "and water data from this browser? This cannot be undone."
        );

        if (!confirmed) {
            return;
        }

        gallery = [];
        wellnessHistory = [];
        diaryHistory = [];

        waterData = {
            date: new Date().toDateString(),
            amount: 0,
            goal: 2000
        };

        removeStorage("naol_gallery");
        removeStorage("naol_wellness_history");
        removeStorage("naol_diary_history");

        writeStorage("naol_water_data", waterData);

        renderGallery();
        renderWellnessHistory();
        renderDiaryHistory();
        renderHydration();
        renderReportSummary();

        showToast("Saved local data cleared.");
    });


    /* ========================================================
       14. OPTIONAL BUTTONS AND FORM SAFETY
       ======================================================== */

    // Prevent accidental form submissions for buttons that perform actions.
    $$("button").forEach(function (button) {
        if (!button.hasAttribute("type")) {
            button.setAttribute("type", "button");
        }
    });

    // Make data-region controls accessible.
    $$("[data-region]").forEach(function (button) {
        if (!button.hasAttribute("type")) {
            button.setAttribute("type", "button");
        }
    });

    // Keep the footer year current.
    setText("footerYear", String(new Date().getFullYear()));

    // Initialize the initial camera status.
    updateCameraStatus();

    // The camera should not start automatically.
    // The user must click Start Camera and grant permission.

    console.log(
        "Naol Health Scanner 3D initialized successfully."
    );

    showToast("Naol Health Scanner 3D is ready.");

});

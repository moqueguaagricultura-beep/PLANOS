// 1. Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// 1.1 Handle files opened from the system (Open with...)
if ('launchQueue' in window) {
    launchQueue.setConsumer((launchParams) => {
        if (launchParams.files && launchParams.files.length > 0) {
            for (const fileHandle of launchParams.files) {
                processFileHandle(fileHandle);
            }
        }
    });
}

async function processFileHandle(fileHandle) {
    const file = await fileHandle.getFile();
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parser = new window.DxfParser();
            const dxf = parser.parseSync(event.target.result);
            processDxf(file.name, dxf, null, null, event.target.result);
        } catch (error) {
            console.error("Error parsing DXF from Launch:", error);
            showAlert("Error al abrir el archivo desde el sistema.");
        }
    };
    reader.readAsText(file);
}

// 1. Definition of CRS WGS84 UTM Zone 19S (EPSG:32719)
proj4.defs("EPSG:32719", "+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs");

// 2. Initialize Map & Basemaps (Centered on Moquegua, Peru)
// Set maxZoom astronomically high so users can zoom deeply into small lots
const map = L.map('map', { zoomControl: false, maxZoom: 26 }).setView([-17.195, -70.936], 9);
map.attributionControl.setPrefix('EDWIN DIAZ CAMACHO');

// Semantic Zooming: Hide text annotations if map is zoomed out too far to prevent clutter
map.on('zoomend', function () {
    if (map.getZoom() < 17) {
        document.body.classList.add('hide-dxf-texts');
    } else {
        document.body.classList.remove('hide-dxf-texts');
    }
});
if (map.getZoom() < 17) document.body.classList.add('hide-dxf-texts');

const basemaps = {
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 26, maxNativeZoom: 18
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        // In rural areas, Esri lacks zoom 18+ and returns a gray picture saying "Map Data Not Available" (HTTP 200)
        // Capping maxNativeZoom to 17 stops Leaflet from asking for those gray pictures and stretches the last good photo instead.
        maxZoom: 26, maxNativeZoom: 17
    }),
    history2020: L.tileLayer('https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/29260/{z}/{y}/{x}', {
        attribution: 'Esri Wayback (Dec 2020)',
        maxZoom: 26,
        maxNativeZoom: 17
    })
};
let currentBasemap = 'light';
basemaps[currentBasemap].addTo(map);

// AutoCAD Extended Color mapping (Standard 255 ACI Palette)
const ACI_COLORS = [
    "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FFFFFF", "#808080", "#C0C0C0",
    "#FF0000", "#FF7F7F", "#A50000", "#A55252", "#7F0000", "#7F3F3F", "#4C0000", "#4C2626", "#260000", "#261313",
    "#FF3F00", "#FF9F7F", "#A52900", "#A56752", "#7F1F00", "#7F4F3F", "#4C1300", "#4C2F26", "#260900", "#261713",
    "#FF7F00", "#FFBF7F", "#A55200", "#A57C52", "#7F3F00", "#7F5F3F", "#4C2600", "#4C3926", "#261300", "#261C13",
    "#FFBF00", "#FFDF7F", "#A57C00", "#A59152", "#7F5F00", "#7F6F3F", "#4C3900", "#4C4226", "#261C00", "#262113",
    "#FFFF00", "#FFFF7F", "#A5A500", "#A5A552", "#7F7F00", "#7F7F3F", "#4C4C00", "#4C4C26", "#262600", "#262613",
    "#BFFF00", "#DFFF7F", "#7CA500", "#91A552", "#5F7F00", "#6F7F3F", "#394C00", "#424C26", "#1C2600", "#212613",
    "#7FFF00", "#BFFF7F", "#52A500", "#7CA552", "#3F7F00", "#5F7F3F", "#264C00", "#394C26", "#132600", "#1C2613",
    "#3FFF00", "#9FFF7F", "#29A500", "#67A552", "#1F7F00", "#4F7F3F", "#134C00", "#2F4C26", "#092600", "#172613",
    "#00FF00", "#7FFF7F", "#00A500", "#52A552", "#007F00", "#3F7F3F", "#004C00", "#264C26", "#002600", "#132613",
    "#00FF3F", "#7FFF9F", "#00A529", "#52A567", "#007F1F", "#3F7F4F", "#004C13", "#264C2F", "#002609", "#132617",
    "#00FF7F", "#7FFFBF", "#00A552", "#52A57C", "#007F3F", "#3F7F5F", "#004C26", "#264C39", "#002613", "#13261C",
    "#00FFBF", "#7FFFDF", "#00A57C", "#52A591", "#007F5F", "#3F7F6F", "#004C39", "#264C42", "#00261C", "#132621",
    "#00FFFF", "#7FFFFF", "#00A5A5", "#52A5A5", "#007F7F", "#3F7F7F", "#004C4C", "#264C4C", "#002626", "#132626",
    "#00BFFF", "#7FDFFF", "#007CA5", "#5291A5", "#005F7F", "#3F6F7F", "#00394C", "#26424C", "#001C26", "#132126",
    "#007FFF", "#7FBFFF", "#0052A5", "#527CA5", "#003F7F", "#3F5F7F", "#00264C", "#26394C", "#001326", "#131C26",
    "#003FFF", "#7F9FFF", "#0029A5", "#5267A5", "#001F7F", "#3F4F7F", "#00134C", "#262F4C", "#000926", "#131726",
    "#0000FF", "#7F7FFF", "#0000A5", "#5252A5", "#00007F", "#3F3F7F", "#00004C", "#26264C", "#000026", "#131326",
    "#3F00FF", "#9F7FFF", "#2900A5", "#6752A5", "#1F007F", "#4F3F7F", "#13004C", "#2F264C", "#090026", "#171326",
    "#7F00FF", "#BF7FFF", "#5200A5", "#7C52A5", "#3F007F", "#5F3F7F", "#26004C", "#39264C", "#130026", "#1C1326",
    "#BF00FF", "#DF7FFF", "#7C00A5", "#9152A5", "#5F007F", "#6F3F7F", "#39004C", "#42264C", "#1C0026", "#211326",
    "#FF00FF", "#FF7FFF", "#A500A5", "#A552A5", "#7F007F", "#7F3F7F", "#4C004C", "#4C264C", "#260026", "#261326",
    "#FF00BF", "#FF7FDF", "#A5007C", "#A55291", "#7F005F", "#7F3F6F", "#4C0039", "#4C2642", "#26001C", "#261321",
    "#FF007F", "#FF7FBF", "#A50052", "#A5527C", "#7F003F", "#7F3F5F", "#4C0026", "#4C2639", "#260013", "#26131C",
    "#FF003F", "#FF7F9F", "#A50029", "#A55267", "#7F001F", "#7F3F4F", "#4C0013", "#4C262F", "#260009", "#261317",
    "#333333", "#505050", "#696969", "#828282", "#9C9C9C", "#B5B5B5", "#CECECE", "#E7E7E7", "#FFFFFF"
];

function getEntityColor(colorNumber) {
    // If absolutely no color is passed (null, undefined, 256 "ByLayer", 0 "ByBlock"), use standard ACI 7 (White/Black)
    let c = colorNumber;
    if (c === undefined || c === null || c === 256 || c === 0) c = 7;

    // Handle string colors from newer DXF specs (like "128" or hexadecimal "#00ff00") that might bypass ACI
    if (typeof c === 'string') {
        if (c.startsWith('#')) return c;
        c = parseInt(c, 10);
    }

    // Safety fallback
    if (isNaN(c) || c < 0 || c > 255) c = 7;

    let hex = ACI_COLORS[c] || '#333333';

    // Auto adjust white/black contrast based on basemap
    if (c === 7) {
        hex = currentBasemap === 'satellite' ? '#FFFFFF' : '#000000';
    }
    return hex;
}

// --- IndexedDB Configuration ---
const DB_NAME = "PlanosDXF_DB";
const DB_VERSION = 2; // Upgraded for notes
const STORE_NAME = "plans";
const NOTES_STORE = "notes";

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(NOTES_STORE)) {
                db.createObjectStore(NOTES_STORE, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function savePlanToDB(planData) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    // We only save raw data and basic config, not Leaflet objects
    const dataToSave = {
        id: planData.id,
        name: planData.name,
        rawDxf: planData.rawDxf,
        visible: planData.visible,
        layersConfig: {} // Store color/visibility per layer
    };
    Object.keys(planData.layersData).forEach(layerName => {
        dataToSave.layersConfig[layerName] = {
            customColor: planData.layersData[layerName].customColor,
            visible: planData.layersData[layerName].visible
        };
    });
    store.put(dataToSave);
}

async function deletePlanFromDB(planId) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(planId);
}

async function updatePlanConfigInDB(planId, layerName, config) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(planId);
    request.onsuccess = () => {
        const data = request.result;
        if (data) {
            if (!data.layersConfig[layerName]) data.layersConfig[layerName] = {};
            Object.assign(data.layersConfig[layerName], config);
            store.put(data);
        }
    };
}

async function loadPlansFromDB() {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
        const savedPlans = request.result;
        if (savedPlans && savedPlans.length > 0) {
            loadingOverlay.classList.remove('hidden');
            const parser = new window.DxfParser();
            
            // Temporary collection to fit bounds after all are processed
            const allBounds = L.latLngBounds();
            let plansWithBounds = 0;

            savedPlans.forEach(saved => {
                try {
                    const dxf = parser.parseSync(saved.rawDxf);
                    // processDxf adds the plan to loadedPlans
                    processDxf(saved.name, dxf, saved.id, saved);
                    
                    // We need the bounds from the newly loaded plan
                    const lastPlan = loadedPlans[loadedPlans.length - 1];
                    if (lastPlan && lastPlan.bounds) {
                        allBounds.extend(lastPlan.bounds);
                        plansWithBounds++;
                    }
                } catch (e) {
                    console.error("Error loading saved plan:", saved.name, e);
                }
            });

            if (plansWithBounds > 0) {
                map.fitBounds(allBounds, { padding: [50, 50] });
            }

            loadingOverlay.classList.add('hidden');
        }
    };
}

// State Management
let loadedPlans = []; // Array of plans and their layers
let activeLayersRegistry = {};

// --- Measurement Tool State ---
let isMeasuring = false;
let measurePoints = [];
let measureLayer = L.layerGroup().addTo(map);
let measureLine = null;
let measureMarkers = [];
// 3. UI Elements
const dxfUpload = document.getElementById('dxf-upload');
const panelLayers = document.getElementById('layer-panel');
const panelPlans = document.getElementById('plan-panel');
const layerList = document.getElementById('layer-list');
const planList = document.getElementById('plan-list');
const loadingOverlay = document.getElementById('loading');

const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');

const btnLayers = document.getElementById('btn-layers');
const btnPlans = document.getElementById('btn-plans');
const btnBasemap = document.getElementById('btn-basemap');
const btnBasemap2020 = document.getElementById('btn-basemap-2020');
const btnGps = document.getElementById('btn-gps');
const btnNote = document.getElementById('btn-note');
const btnMeasure = document.getElementById('btn-measure');

const btnCloseLayers = document.getElementById('close-layers');
const btnClosePlans = document.getElementById('close-plans');

const modalAlert = document.getElementById('custom-alert');
const alertMsg = document.getElementById('alert-message');
const btnAlertOk = document.getElementById('alert-ok');

const coordsDisplay = document.getElementById('coords-display');

// Custom Alert Replacement
function showAlert(message) {
    // Simple alert without pushing history state
    alertMsg.innerText = message;
    modalAlert.classList.remove('hidden');
}

btnAlertOk.addEventListener('click', () => {
    modalAlert.classList.add('hidden');
});

// UI Interactions
function closeAllUI(shouldGoBack = true, resetInteractions = true) {
    // 1. Panels
    panelLayers.classList.add('hidden');
    panelPlans.classList.add('hidden');
    btnLayers.classList.remove('active');
    btnPlans.classList.remove('active');

    // 2. Modals
    if (typeof closeNoteModal === 'function') closeNoteModal(false, resetInteractions);
    modalAlert.classList.add('hidden');

    // 3. Loading Overlay
    loadingOverlay.classList.add('hidden');

    // 4. Reset Interaction Modes (only if requested)
    if (resetInteractions) {
        deactivateInteractionModes();
    }

    // 5. Mobile Search Collapse
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) searchContainer.classList.remove('expanded');

    // 6. History Management
    if (shouldGoBack && window.history.state && window.history.state.uiOpen) {
        window.history.back();
    }
}

function deactivateInteractionModes() {
    isMeasuring = false;
    btnMeasure.classList.remove('active');
    if (typeof clearMeasurement === 'function') clearMeasurement();
    map.getContainer().style.cursor = '';

    isNoteMode = false;
    if (typeof btnNote !== 'undefined') btnNote.classList.remove('active');
    if (typeof coordsDisplay !== 'undefined') coordsDisplay.classList.remove('visible');
    if (typeof centerCrosshair !== 'undefined') centerCrosshair.classList.add('hidden');
}

// Global Back Button Handler (Mobile)
window.addEventListener('popstate', (e) => {
    // If the new state doesn't have uiOpen, it means the user hit 'back' to exit a UI state
    if (!e.state || !e.state.uiOpen) {
        closeAllUI(false, true);
    }
});

function openUIComponent(openFn) {
    // Only push state if we are opening a major panel or modal that should be closeable via Back button
    if (!window.history.state || !window.history.state.uiOpen) {
        window.history.pushState({ uiOpen: true }, '');
    }
    openFn();
}

btnLayers.addEventListener('click', () => {
    let isHidden = panelLayers.classList.contains('hidden');
    if (isHidden) {
        openUIComponent(() => {
            closeAllUI(false);
            panelLayers.classList.remove('hidden');
            btnLayers.classList.add('active');
        });
    } else {
        closeAllUI(true);
    }
});

btnPlans.addEventListener('click', () => {
    let isHidden = panelPlans.classList.contains('hidden');
    if (isHidden) {
        openUIComponent(() => {
            closeAllUI(false);
            panelPlans.classList.remove('hidden');
            btnPlans.classList.add('active');
        });
    } else {
        closeAllUI(true);
    }
});

btnCloseLayers.addEventListener('click', () => closeAllUI(true));
btnClosePlans.addEventListener('click', () => closeAllUI(true));

// Function to switch basemaps safely
function setBasemap(name) {
    Object.keys(basemaps).forEach(key => map.removeLayer(basemaps[key]));
    basemaps[name].addTo(map);
    currentBasemap = name;

    // Update UI active states
    btnBasemap.classList.toggle('active', name === 'satellite');
    btnBasemap2020.classList.toggle('active', name === 'history2020');
}

btnBasemap.addEventListener('click', () => {
    if (currentBasemap === 'satellite') {
        setBasemap('light');
    } else {
        setBasemap('satellite');
    }
    refreshAllPlansStyling();
});

btnBasemap2020.addEventListener('click', () => {
    if (currentBasemap === 'history2020') {
        setBasemap('light');
    } else {
        setBasemap('history2020');
    }
    refreshAllPlansStyling();
});

// Measurement Tool Logic
btnMeasure.addEventListener('click', () => {
    if (isMeasuring) {
        closeAllUI(true, true); // This will call deactivateInteractionModes()
    } else {
        openUIComponent(() => {
            closeAllUI(false, true); // Clear any other open state first
            isMeasuring = true; 
            btnMeasure.classList.add('active');
            map.getContainer().style.cursor = 'crosshair';
            showAlert("Modo Medición: Toca puntos en el mapa para medir distancias.");
        });
    }
});

function clearMeasurement() {
    measureLayer.clearLayers();
    measurePoints = [];
    measureLine = null;
    measureMarkers = [];
    map.getContainer().style.cursor = '';
}

function addMeasurementPoint(latlng) {
    measurePoints.push(latlng);

    const marker = L.circleMarker(latlng, { radius: 5, color: '#ef4444', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(measureLayer);
    measureMarkers.push(marker);

    if (measurePoints.length > 1) {
        if (measureLine) measureLayer.removeLayer(measureLine);
        measureLine = L.polyline(measurePoints, { color: '#ef4444', weight: 3, dashArray: '5, 10' }).addTo(measureLayer);

        let totalDist = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
            totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
        }
        marker.bindTooltip(`${totalDist.toFixed(2)} m`, { permanent: true, direction: 'right', className: 'measure-tooltip' }).openTooltip();
    } else {
        marker.bindTooltip(`Inicio`, { permanent: true, direction: 'right', className: 'measure-tooltip' }).openTooltip();
    }
}

map.on('click', (e) => {
    if (isMeasuring) {
        addMeasurementPoint(e.latlng);
    }
});

// 4. File Upload and Parsing
dxfUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadingOverlay.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (event) => {
        setTimeout(() => {
            try {
                const parser = new window.DxfParser();
                const dxf = parser.parseSync(event.target.result);
                processDxf(file.name, dxf, null, null, event.target.result);
            } catch (error) {
                console.error("Error parsing DXF:", error);
                showAlert("Ocurrió un error al procesar el archivo DXF.");
            } finally {
                loadingOverlay.classList.add('hidden');
                dxfUpload.value = '';
            }
        }, 50);
    };
    reader.readAsText(file);
});

// Push history state when user clicks the "Cargar DXF" button (Mobile Back support)
dxfUpload.addEventListener('click', () => {
    if (!window.history.state || !window.history.state.uiOpen) {
        window.history.pushState({ uiOpen: true }, '');
    }
});

// Search Logic
function performSearch() {
    const term = searchInput.value.trim().toLowerCase();
    const container = searchInput.parentElement;

    // Mobile Toggle Logic: if on mobile, clicking the button triggers expansion/collapse
    if (window.innerWidth <= 600) {
        if (!container.classList.contains('expanded')) {
            openUIComponent(() => {
                container.classList.add('expanded');
                searchInput.focus();
            });
            return; // Just expand on first click
        }
        // If already expanded but empty, collapse it
        if (!term) {
            closeAllUI(true);
            return;
        }
    }

    if (!term) return;

    let matchBounds = L.latLngBounds();
    let found = false;

    // Remove zoom limitation class temporarily so elements render and we can pick them
    document.body.classList.remove('hide-dxf-texts');

    loadedPlans.forEach(plan => {
        if (!plan.visible) return;
        Object.keys(plan.layersData).forEach(layerName => {
            if (!activeLayersRegistry[layerName] || !activeLayersRegistry[layerName].visible) return;
            const lData = plan.layersData[layerName];
            lData.features.forEach(feat => {
                if (feat._isText && feat._textOptions.text.toLowerCase().includes(term)) {
                    matchBounds.extend(feat.getLatLng());
                    found = true;

                    // Highlight effect visually
                    const el = feat.getElement();
                    if (el) {
                        const originalColor = el.style.color;
                        el.style.transition = "all 0.3s";
                        el.style.transform += " scale(1.5)";
                        el.style.color = "#ef4444"; // Red highlight
                        el.style.textShadow = "0 0 8px yellow";
                        el.style.zIndex = 1000;
                        setTimeout(() => {
                            if (el) {
                                el.style.transform = el.style.transform.replace(" scale(1.5)", "");
                                el.style.color = originalColor;
                                el.style.textShadow = "";
                                el.style.zIndex = "";
                            }
                        }, 4000);
                    }
                }
            });
        });
    });

    if (found) {
        map.fitBounds(matchBounds, { padding: [50, 50], maxZoom: 22 });
        // Collapse search after finding results on mobile
        if (window.innerWidth <= 600) {
            container.classList.remove('expanded');
        }
    } else {
        showAlert("No se encontraron textos que coincidan con la búsqueda: " + term);
        // Put class back if zoomed out
        if (map.getZoom() < 17) document.body.classList.add('hide-dxf-texts');
    }
}

btnSearch.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

// Geometric Helpers
function calculatePlanarArea(vertices) {
    if (!vertices || vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        area += (vertices[j].x + vertices[i].x) * (vertices[j].y - vertices[i].y);
    }
    return Math.abs(area / 2);
}

// 5. Plan and Layer Management
function processDxf(fileName, dxf, existingId = null, savedConfig = null, rawDxfString = null) {
    const planId = existingId || 'plan_' + Date.now();
    const group = L.layerGroup().addTo(map);

    if (savedConfig && !savedConfig.visible) group.remove();

    let bounds = L.latLngBounds();
    let hasGeoms = false;
    let layersData = {}; // Internal registry for this specific plan

    const tableLayers = dxf.tables?.layer?.layers || {};

    const convertPoint = (x, y) => {
        const wgs84 = proj4("EPSG:32719", "EPSG:4326", [x, y]);
        const latlng = [wgs84[1], wgs84[0]];
        bounds.extend(latlng);
        hasGeoms = true;
        return latlng;
    };

    dxf.entities.forEach(entity => {
        const layerName = entity.layer || "Default";

        // --- 1. RESOLVE LAYER DEFAULT COLOR ---
        let tableLayerColorNum = 7; // Default White/Black Contrast
        if (tableLayers && tableLayers[layerName]) {
            const lData = tableLayers[layerName];
            // Check standard ACI index properties
            if (lData.colorNumber !== undefined) tableLayerColorNum = lData.colorNumber;
            else if (lData.colorIndex !== undefined) tableLayerColorNum = lData.colorIndex;
            else if (lData.color !== undefined) tableLayerColorNum = lData.color;
            // Support DXF TrueColor in Layer (24-bit RGB)
            else if (lData.trueColor) tableLayerColorNum = `#${lData.trueColor.toString(16).padStart(6, '0')}`;
        }

        // --- 2. RESOLVE ENTITY OVERRIDE COLOR ---
        let entityColorNum = entity.colorNumber;
        if (entityColorNum === undefined) entityColorNum = entity.colorIndex; // Support missing colorIndex variant!
        if (entityColorNum === undefined) entityColorNum = entity.color;

        // Check for direct TrueColor (RGB) string override on the entity itself
        if (entity.trueColor) {
            entityColorNum = `#${entity.trueColor.toString(16).padStart(6, '0')}`;
        }

        // --- 3. APPLY LAYER INHERITANCE ---
        // Apply Layer Fallback. "ByLayer" (256) or unassigned properties default to the Layer table object definition
        if (entityColorNum === 256 || entityColorNum === undefined || entityColorNum === null || entityColorNum === 0) {
            entityColorNum = tableLayerColorNum;
        }

        if (!layersData[layerName]) {
            const lConfig = savedConfig?.layersConfig?.[layerName];
            layersData[layerName] = {
                color: getEntityColor(tableLayerColorNum),
                customColor: lConfig?.customColor || null,
                visible: lConfig !== undefined ? lConfig.visible : true,
                features: []
            };
        }

        const featureColor = getEntityColor(entityColorNum);
        let geom = null;
        let isText = false;
        let isPolygon = false;

        if (entity.type === 'LINE') {
            const p1 = convertPoint(entity.vertices[0].x, entity.vertices[0].y);
            const p2 = convertPoint(entity.vertices[1].x, entity.vertices[1].y);
            geom = L.polyline([p1, p2]);
        }
        else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const points = entity.vertices.map(v => convertPoint(v.x, v.y));
            // Always treat polylines as lines to avoid the "grey blob" effect on maps
            let isClosedPoly = entity.shape || entity.closed;

            // Check implicitly closed
            if (!isClosedPoly && entity.vertices.length > 2) {
                const first = entity.vertices[0];
                const last = entity.vertices[entity.vertices.length - 1];
                if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
                    isClosedPoly = true;
                }
            }

            if (isClosedPoly) {
                isPolygon = true;
                geom = L.polygon(points, { fillOpacity: 0 }); // Use L.polygon for area shapes
            } else {
                geom = L.polyline(points);
            }

            if (isPolygon) {
                const areaM2 = calculatePlanarArea(entity.vertices);
                if (areaM2 > 0) {
                    const areaHa = areaM2 / 10000;
                    geom.bindPopup(`<div style="text-align:center; min-width:120px; font-family:sans-serif;"><b>Área del Polígono</b><br><b style="color:#2563eb; font-size:1.2em;">${areaM2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</b><br><span style="color:#6b7280;">${areaHa.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha</span></div>`);

                    // Highlight on selection
                    geom.on('popupopen', function () {
                        this.setStyle({ fillOpacity: 0.3 });
                    });
                    geom.on('popupclose', function () {
                        this.setStyle({ fillOpacity: 0 });
                    });
                }
            }
        }
        else if (entity.type === 'CIRCLE') {
            const center = convertPoint(entity.center.x, entity.center.y);
            geom = L.circle(center, { radius: entity.radius, fillOpacity: 0 });
            isPolygon = true;

            const areaM2 = Math.PI * Math.pow(entity.radius, 2);
            const areaHa = areaM2 / 10000;
            geom.bindPopup(`<div style="text-align:center; min-width:120px; font-family:sans-serif;"><b>Área del Círculo</b><br><b style="color:#2563eb; font-size:1.2em;">${areaM2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</b><br><span style="color:#6b7280;">${areaHa.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha</span></div>`);

            // Highlight on selection
            geom.on('popupopen', function () {
                this.setStyle({ fillOpacity: 0.3 });
            });
            geom.on('popupclose', function () {
                this.setStyle({ fillOpacity: 0 });
            });
        }
        else if (entity.type === 'POINT') {
            const ptX = entity.position?.x ?? entity.x;
            const ptY = entity.position?.y ?? entity.y;

            if (ptX !== undefined && ptY !== undefined && !isNaN(ptX)) {
                const pt = convertPoint(ptX, ptY);
                // Create a small circle marker for the point
                geom = L.circleMarker(pt, {
                    radius: 3,
                    stroke: true,
                    weight: 1,
                    opacity: 1,
                    fill: true,
                    fillOpacity: 0.8
                });
            }
        }
        else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
            const ptX = entity.startPoint?.x ?? entity.position?.x ?? entity.insertionPoint?.x ?? entity.x;
            const ptY = entity.startPoint?.y ?? entity.position?.y ?? entity.insertionPoint?.y ?? entity.y;

            if (ptX !== undefined && ptY !== undefined && !isNaN(ptX)) {
                const pt = convertPoint(ptX, ptY);
                // Extract string robustly - MTEXT uses .text, text uses .string, some DXF specs use .value
                let textStr = entity.text || entity.string || entity.value || "";

                if (textStr) {
                    // AutoCAD MTEXT Regex cleaner - eliminates fonts, color codes (\C), text heights (\H), formatting overrides
                    textStr = textStr.replace(/\\[^;]+;/g, '') // Remove complex codes like \fArial|b0;
                        .replace(/\\[A-Z]/g, '')            // Remove simple codes like \P, \L
                        .replace(/[{}]/g, '')               // Remove grouping braces
                        .trim();

                    if (textStr !== '') {
                        isText = true;
                        const textHeight = entity.textHeight || 12;
                        const rotation = entity.rotation || 0;

                        geom = L.marker(pt, {
                            icon: L.divIcon({
                                className: `dxf-text ${currentBasemap === 'satellite' ? 'satellite-shadow' : ''}`,
                                html: `<span style="color: ${featureColor}; font-family: sans-serif; font-size: ${Math.max(10, textHeight * 2.5)}px; transform: rotate(${-rotation}deg); display: inline-block; transform-origin: left center;">${textStr}</span>`,
                                iconSize: null
                            })
                        });
                        geom._textOptions = { text: textStr, colorNumber: entityColorNum, textHeight: textHeight, rotation: rotation };
                    }
                }
            }
        }
        else if (entity.type === 'HATCH') {
            if (entity.loops && entity.loops.length > 0) {
                const polygons = [];
                entity.loops.forEach(loop => {
                    let loopPoints = [];
                    if (loop.polyline) {
                        loopPoints = loop.polyline.map(v => convertPoint(v.x, v.y));
                    } else if (loop.edges) {
                        loop.edges.forEach(edge => {
                            if (edge.type === 1) { // Line Edge
                                if (edge.start && edge.end) {
                                    loopPoints.push(convertPoint(edge.start.x, edge.start.y));
                                    loopPoints.push(convertPoint(edge.end.x, edge.end.y));
                                } else if (edge.vertices && edge.vertices.length > 0) {
                                  edge.vertices.forEach(v => loopPoints.push(convertPoint(v.x, v.y)));
                                }
                            } else if (edge.type === 2) { // Arc Edge
                                const center = edge.center;
                                const radius = edge.radius;
                                const startAngle = edge.startAngle;
                                const endAngle = edge.endAngle;
                                const isCCW = edge.isCounterClockwise;
                                const steps = 12;
                                let diff = endAngle - startAngle;
                                if (isCCW && diff < 0) diff += 360;
                                if (!isCCW && diff > 0) diff -= 360;
                                for (let i = 0; i <= steps; i++) {
                                    const ang = startAngle + (diff * i / steps);
                                    const rad = ang * Math.PI / 180;
                                    loopPoints.push(convertPoint(center.x + radius * Math.cos(rad), center.y + radius * Math.sin(rad)));
                                }
                            }
                        });
                    }
                    if (loopPoints.length > 2) polygons.push(loopPoints);
                });

                if (polygons.length > 0) {
                    isPolygon = true;
                    geom = L.polygon(polygons, {
                        fillColor: featureColor,
                        fillOpacity: 0.5,
                        weight: 1,
                        color: featureColor
                    });
                    geom._isHatch = true;
                }
            }
        }
        else if (entity.type === 'SOLID' || entity.type === 'TRACE') {
            const pts = entity.points || entity.vertices || [];
            if (pts.length >= 3) {
                const p1 = convertPoint(pts[0].x, pts[0].y);
                const p2 = convertPoint(pts[1].x, pts[1].y);
                const p3 = convertPoint(pts[2].x, pts[2].y);
                const p4 = pts[3] ? convertPoint(pts[3].x, pts[3].y) : p3;
                
                // DXF SOLIDs use 1, 2, 4, 3 vertex order for polygons (quads)
                geom = L.polygon([p1, p2, p4, p3], {
                    fillColor: featureColor,
                    fillOpacity: 0.5,
                    weight: 1,
                    color: featureColor
                });
                isPolygon = true;
                geom._isHatch = true; // Treat as hatch for rendering logic
            }
        }

        if (geom) {
            geom._isText = isText;
            geom._isPolygon = isPolygon;
            geom._featureColor = featureColor;

            // Prioritize measurement clicks when active
            geom.on('click', (e) => {
                if (isMeasuring) {
                    L.DomEvent.stopPropagation(e);
                    addMeasurementPoint(e.latlng);
                }
            });

            layersData[layerName].features.push(geom);
        }
    });

    if (hasGeoms) {
        const newPlan = {
            id: planId,
            name: fileName,
            layerGroup: group,
            bounds: bounds,
            layersData: layersData,
            visible: savedConfig ? savedConfig.visible : true,
            rawDxf: rawDxfString || savedConfig?.rawDxf
        };
        loadedPlans.push(newPlan);

        if (!existingId) {
            savePlanToDB(newPlan);
            map.fitBounds(bounds, { padding: [50, 50] });
        }

        renderPlanAndLayersMap();
    } else {
        if (!existingId) showAlert("No se encontraron entidades compatibles en el plano.");
        group.remove();
    }
}

function refreshAllPlansStyling() {
    loadedPlans.forEach(plan => {
        Object.keys(plan.layersData).forEach(layerName => {
            const lData = plan.layersData[layerName];
            lData.features.forEach(feat => {
                if (feat._isText) {
                    const cName = `dxf-text ${currentBasemap === 'satellite' ? 'satellite-shadow' : ''}`;
                    const customCol = lData.customColor || getEntityColor(feat._textOptions.colorNumber);
                    feat.setIcon(L.divIcon({
                        className: cName,
                        html: `<span style="color: ${customCol}; opacity: ${lData.visible ? 1 : 0}; font-family: sans-serif; font-size: ${Math.max(10, feat._textOptions.textHeight * 2.5)}px; transform: rotate(${-feat._textOptions.rotation}deg); display: inline-block; transform-origin: left center;">${feat._textOptions.text}</span>`,
                        iconSize: null
                    }));
                } else if (feat instanceof L.CircleMarker && !feat._isPolygon) {
                    // For POINT entities (rendered as circleMarker but not the polygon radius Circle)
                    const customCol = lData.customColor || feat._featureColor;
                    feat.setStyle({ color: customCol, fillColor: customCol });
                } else if (feat.setStyle) {
                    const customCol = lData.customColor || feat._featureColor;
                    feat.setStyle({ color: customCol });
                }
            });
        });
    });
}

function renderPlanAndLayersMap() {
    loadedPlans.forEach(plan => plan.layerGroup.clearLayers());

    // Reset feature counts but retain persistence for custom colors and visibility toggles
    Object.keys(activeLayersRegistry).forEach(k => { activeLayersRegistry[k].featureCount = 0; });

    loadedPlans.forEach(plan => {
        Object.keys(plan.layersData).forEach(layerName => {
            const lData = plan.layersData[layerName];

            if (!activeLayersRegistry[layerName]) {
                activeLayersRegistry[layerName] = {
                    color: lData.color,
                    customColor: lData.customColor, // FIX: Pass saved customColor to global registry
                    visible: lData.visible,
                    featureCount: 0
                };
            }
            activeLayersRegistry[layerName].featureCount += lData.features.length;

            if (activeLayersRegistry[layerName].visible) {
                lData.features.forEach(feat => {
                    if (feat._isText) {
                        const customCol = activeLayersRegistry[layerName].customColor || getEntityColor(feat._textOptions.colorNumber);
                        const cName = `dxf-text ${currentBasemap === 'satellite' ? 'satellite-shadow' : ''}`;
                        feat.setIcon(L.divIcon({
                            className: cName,
                            html: `<span style="color: ${customCol}; font-family: sans-serif; font-size: ${Math.max(10, feat._textOptions.textHeight * 2.5)}px; transform: rotate(${-feat._textOptions.rotation}deg); display: inline-block; transform-origin: left center;">${feat._textOptions.text}</span>`,
                            iconSize: null
                        }));
                    } else if (feat.setStyle) {
                        const customCol = activeLayersRegistry[layerName].customColor || feat._featureColor;
                        // Draw clean solid boundary lines (no inner fill) unless it is a HATCH
                        feat.setStyle({
                            color: customCol,
                            fillColor: customCol,
                            weight: feat._isHatch ? 1 : 2,
                            fillOpacity: feat._isHatch ? 0.5 : 0
                        });
                    }

                    // Special handling for circle markers (points)
                    if (feat instanceof L.CircleMarker && !feat._isPolygon) {
                        const customCol = activeLayersRegistry[layerName].customColor || feat._featureColor;
                        feat.setStyle({
                            color: customCol,
                            fillColor: customCol,
                            weight: 1,
                            fillOpacity: 0.8
                        });
                    }
                    
                    plan.layerGroup.addLayer(feat);
                });
            }
        });
    });

    buildPlanPanel();
    buildLayerPanel();
}

function buildPlanPanel() {
    planList.innerHTML = '';
    if (loadedPlans.length === 0) {
        planList.innerHTML = '<p class="empty-state">No hay planos cargados</p>';
        return;
    }

    loadedPlans.forEach(plan => {
        const div = document.createElement('div');
        div.className = 'plan-item';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
                <input type="checkbox" class="plan-visible-toggle" ${plan.visible ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                <span class="plan-name" title="${plan.name}" style="cursor: pointer; flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">📄 ${plan.name}</span>
            </div>
            <button class="btn-delete" title="Borrar Plano">Eliminar</button>
        `;

        div.querySelector('.btn-delete').addEventListener('click', () => {
            plan.layerGroup.remove();
            deletePlanFromDB(plan.id);
            loadedPlans = loadedPlans.filter(p => p.id !== plan.id);
            renderPlanAndLayersMap();
        });

        div.querySelector('.plan-visible-toggle').addEventListener('change', (e) => {
            plan.visible = e.target.checked;
            updatePlanConfigInDB(plan.id, null, { visible: plan.visible });
            if (plan.visible) {
                plan.layerGroup.addTo(map);
            } else {
                plan.layerGroup.remove();
            }
        });

        div.querySelector('.plan-name').addEventListener('click', () => {
            if (plan.bounds.isValid()) map.fitBounds(plan.bounds, { padding: [50, 50] });
            closeAllUI(false);
        });

        planList.appendChild(div);
    });
}

function buildLayerPanel() {
    layerList.innerHTML = '';
    const layerNames = Object.keys(activeLayersRegistry).sort();

    if (layerNames.length === 0) {
        layerList.innerHTML = '<p class="empty-state">No hay capas cargadas</p>';
        return;
    }

    layerNames.forEach(layerName => {
        const layerData = activeLayersRegistry[layerName];
        const div = document.createElement('div');
        div.className = 'layer-item';
        // Set the input display to the custom color or default color
        const displayColor = layerData.customColor || layerData.color;

        div.innerHTML = `
            <div class="layer-info">
                <input type="color" class="layer-color" value="${displayColor}" title="Forzar color unificado">
                <span class="layer-name">${layerName} (${layerData.featureCount})</span>
            </div>
            <label class="switch">
                <input type="checkbox" class="layer-visible" ${layerData.visible ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        `;

        const colorInput = div.querySelector('.layer-color');
        colorInput.addEventListener('input', (e) => {
            const newColor = e.target.value;
            // Update the global active visual registry
            activeLayersRegistry[layerName].customColor = newColor;

            // Push changes down to the individual plan data source so text/lines reflect it
            loadedPlans.forEach(plan => {
                if (plan.layersData[layerName]) {
                    plan.layersData[layerName].customColor = newColor;
                    updatePlanConfigInDB(plan.id, layerName, { customColor: newColor });
                }
            });
            // Re-render everything with the new color overlay
            renderPlanAndLayersMap();
        });

        const visibleInput = div.querySelector('.layer-visible');
        visibleInput.addEventListener('change', (e) => {
            const isVisible = e.target.checked;
            activeLayersRegistry[layerName].visible = isVisible;

            loadedPlans.forEach(plan => {
                if (plan.layersData[layerName]) {
                    plan.layersData[layerName].visible = isVisible;
                    updatePlanConfigInDB(plan.id, layerName, { visible: isVisible });
                }
            });
            renderPlanAndLayersMap();
        });

        layerList.appendChild(div);
    });
}

// 6. GPS Tracking
let gpsMarker = null;
let gpsCircle = null;
let watchId = null;

btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) {
        showAlert("Tu navegador no soporta geolocalización.");
        return;
    }

    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (gpsMarker) map.removeLayer(gpsMarker);
        if (gpsCircle) map.removeLayer(gpsCircle);
        gpsMarker = null;
        gpsCircle = null;
        btnGps.classList.remove('active');
        return;
    }

    btnGps.classList.add('active');

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const acc = position.coords.accuracy;
            const latlng = [lat, lng];

            if (!gpsMarker) {
                gpsCircle = L.circle(latlng, { radius: acc, color: "#3b82f6", weight: 1, fillOpacity: 0.15, interactive: false }).addTo(map);
                gpsMarker = L.circleMarker(latlng, { radius: 7, fillColor: "#2563eb", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1, interactive: false }).addTo(map);
                map.setView(latlng, 18);
            } else {
                gpsMarker.setLatLng(latlng);
                gpsCircle.setLatLng(latlng);
                gpsCircle.setRadius(acc);
            }
        },
        (error) => {
            console.error(error);
            showAlert("No se pudo obtener tu ubicación GPS.");
            btnGps.classList.remove('active');
            if (watchId) navigator.geolocation.clearWatch(watchId);
            watchId = null;
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
});

// Start DB processing
loadPlansFromDB();

const centerCrosshair = document.getElementById('center-crosshair');
const noteModal = document.getElementById('note-modal');
const noteText = document.getElementById('note-text');
const btnNoteSave = document.getElementById('note-save');
const btnNoteCancel = document.getElementById('note-cancel');

// --- Map Notes Logic ---
let isNoteMode = false;
let notes = [];

async function saveNoteToDB(note) {
    const db = await initDB();
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    store.put(note);
}

async function deleteNoteFromDB(id) {
    const db = await initDB();
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    store.delete(id);
}

async function loadNotesFromDB() {
    const db = await initDB();
    const tx = db.transaction(NOTES_STORE, "readonly");
    const store = tx.objectStore(NOTES_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
        notes = request.result;
        notes.forEach(renderNote);
    };
}

function renderNote(note) {
    const marker = L.marker(note.latlng, {
        icon: L.divIcon({
            className: 'note-marker',
            html: '📌',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        })
    }).addTo(map);

    const popupContent = `
        <div class="note-popup">
            <p>${note.text}</p>
            <button onclick="deleteNote('${note.id}')" class="btn-delete" style="width:100%; margin-top:8px;">Eliminar</button>
        </div>
    `;
    marker.bindPopup(popupContent);
    note.marker = marker;
}

window.deleteNote = async (id) => {
    const index = notes.findIndex(n => n.id === id);
    if (index !== -1) {
        map.removeLayer(notes[index].marker);
        notes.splice(index, 1);
        await deleteNoteFromDB(id);
    }
};

btnNote.addEventListener('click', () => {
    if (isNoteMode) {
        // If already in note mode, clicking the button again should open the modal at the center
        const center = map.getCenter();
        openUIComponent(() => {
            openNoteModal(center);
        });
        return;
    }
    
    openUIComponent(() => {
        closeAllUI(false, true); // Clear other modes/panels
        isNoteMode = true;
        btnNote.classList.add('active');
        coordsDisplay.classList.toggle('visible', true);
        centerCrosshair.classList.remove('hidden');
        updateCoordsFromCenter();
        showAlert("Ubica el punto con la cruz central y toca el botón 'Agregar Nota' nuevamente o toca el mapa.");
    });
});

function updateCoordsFromCenter() {
    const center = map.getCenter();
    try {
        const utm = proj4("EPSG:4326", "EPSG:32719", [center.lng, center.lat]);
        const easting = utm[0].toLocaleString('es-PE', { maximumFractionDigits: 2 });
        const northing = utm[1].toLocaleString('es-PE', { maximumFractionDigits: 2 });
        coordsDisplay.innerText = `UTM: ${easting} E, ${northing} N`;
    } catch (err) {
        coordsDisplay.innerText = `UTM: --`;
    }
}

map.on('click', (e) => {
    if (!isNoteMode) return;
    
    // Use click point for PC, or center for mobile (user choice, but let's use center for consistency if Mode is active)
    const latlng = e.latlng; 
    openUIComponent(() => {
        openNoteModal(latlng);
    });
});

function openNoteModal(latlng) {
    noteText.value = "";
    noteModal.classList.remove('hidden');
    
    const saveHandler = async () => {
        const text = noteText.value.trim();
        if (text) {
            const note = {
                id: Date.now().toString(),
                latlng: [latlng.lat, latlng.lng],
                text: text
            };
            notes.push(note);
            renderNote(note);
            // Close modal immediately for a snappy feel
            closeAllUI(true);
            // Then save to DB in background
            try {
                await saveNoteToDB(note);
            } catch (err) {
                console.error("Error saving note:", err);
            }
        } else {
            closeAllUI(true);
        }
    };

    btnNoteSave.onclick = saveHandler;
    btnNoteCancel.onclick = () => closeAllUI(true);
}

function closeNoteModal(shouldGoBack = true, resetMode = true) {
    noteModal.classList.add('hidden');
    if (resetMode) {
        isNoteMode = false;
        btnNote.classList.remove('active');
        coordsDisplay.classList.remove('visible');
        centerCrosshair.classList.add('hidden');
    }
    if (shouldGoBack && window.history.state && window.history.state.uiOpen) {
        window.history.back();
    }
}

// Load everything on start
loadNotesFromDB();

// (coordsDisplay already declared at top)

map.on('mousemove', (e) => {
    if (isNoteMode) return; // In note mode, we track center
    const latlng = e.latlng;
    updateCoords(latlng);
});

map.on('move', () => {
    if (isNoteMode) {
        updateCoordsFromCenter();
    }
});

function updateCoords(latlng) {
    try {
        // Convert from WGS84 (EPSG:4326) to UTM Zone 19S (EPSG:32719)
        const utm = proj4("EPSG:4326", "EPSG:32719", [latlng.lng, latlng.lat]);
        const easting = utm[0].toLocaleString('es-PE', { maximumFractionDigits: 2 });
        const northing = utm[1].toLocaleString('es-PE', { maximumFractionDigits: 2 });
        coordsDisplay.innerText = `UTM: ${easting} E, ${northing} N`;
    } catch (err) {
        coordsDisplay.innerText = `UTM: --`;
    }
}

// Offline support notifications
window.addEventListener('online', () => {
    showAlert("Conexión restaurada. Los mapas se seguirán guardando para uso offline.");
});

window.addEventListener('offline', () => {
    showAlert("Sin conexión. Usando mapas guardados en caché.");
});

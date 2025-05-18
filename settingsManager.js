// --- Settings Schema ---
const SETTINGS_SCHEMA = [
    { key: 'playerSpeed',           input: 'playerSpeed',           value: 'playerSpeedValue',        type: 'number',  default: 200.0 },
    { key: 'playerEyeLevel',        input: 'playerHeight',          value: 'playerHeightValue',       type: 'number',  default: 1.7 },
    { key: 'directionalLightStrength', input: 'mainLightStrength',  value: 'mainLightStrengthValue',  type: 'number',  default: 2.5 }, 
    { key: 'ambientLightColor',     input: 'ambientLightColor',     value: null,                      type: 'color',   default: '#ffffff' },
    { key: 'ambientLightStrength',  input: 'ambientLightStrength',  value: 'ambientLightStrengthValue',type: 'number',  default: 1.0 },
    { key: 'fogNear',               input: 'fogNear',               value: 'fogNearValue',            type: 'number',  default: 45 },
    { key: 'fogFar',                input: 'fogFar',                value: 'fogFarValue',             type: 'number',  default: 187 },
    { key: 'imageZoffset',          input: 'imageZoffset',          value: 'imageZoffsetValue',       type: 'number',  default: 0.01 },
    { key: 'shadowsEnabled',        input: 'shadowToggle',          value: null,                      type: 'checkbox',default: true },
    { key: 'wallColor',             input: 'wallColor',             value: null,                      type: 'color',   default: '#998877' },
    { key: 'wallRoughness',         input: 'wallRoughness',         value: 'wallRoughnessValue',      type: 'number',  default: 0.8 },
    { key: 'wallMetalness',         input: 'wallMetalness',         value: 'wallMetalnessValue',      type: 'number',  default: 0.2 },
    { key: 'ceilingColor',          input: 'ceilingColor',          value: null,                      type: 'color',   default: '#aaaaaa' },
    { key: 'ceilingRoughness',      input: 'ceilingRoughness',      value: 'ceilingRoughnessValue',    type: 'number',  default: 0.8 },
    { key: 'ceilingMetalness',      input: 'ceilingMetalness',      value: 'ceilingMetalnessValue',    type: 'number',  default: 0.2 },
    { key: 'floorColor',            input: 'floorColor',            value: null,                      type: 'color',   default: '#806040' },
    { key: 'floorRoughness',        input: 'floorRoughness',        value: 'floorRoughnessValue',      type: 'number',  default: 0.8 },
    { key: 'floorMetalness',        input: 'floorMetalness',        value: 'floorMetalnessValue',      type: 'number',  default: 0.2 },
    { key: 'wallHeight',         input: 'wallHeight',         value: 'wallHeightValue',         type: 'number',  default: 5 },
    { key: 'wallDepth',          input: 'wallDepth',          value: 'wallDepthValue',          type: 'number',  default: 0.2 },
    { key: 'galleryWallZ',       input: 'galleryWallZ',       value: 'galleryWallZValue',       type: 'number',  default: -5 },
    { key: 'minGalleryLength',   input: 'minGalleryLength',   value: 'minGalleryLengthValue',   type: 'number',  default: 10 },
  //  { key: 'showFps',               input: 'showFpsToggle',         value: null,                      type: 'checkbox',default: false }
];

// --- Internal State ---
const settingsMenu = document.getElementById('settingsMenu');
let _onSettingsChangeCallback = null;
let _isSettingsOpen = false;
const currentSettings = {};
const elements = {};

// --- Utility: Get element and warn if missing ---
function getElementSafe(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`settingsManager.js: Element with id '${id}' not found.`);
    return el;
}

// --- Initialize settings and cache elements ---
SETTINGS_SCHEMA.forEach(({ key, input, value, default: def }) => {
    currentSettings[key] = def;
    elements[input] = getElementSafe(input);
    if (value) elements[value] = getElementSafe(value);
});

// --- Main API ---
function updateAndNotify() {
    if (_onSettingsChangeCallback) _onSettingsChangeCallback(getSettingsState());
}

export function initSettingsControls(onSettingsChangeCallback) {
    _onSettingsChangeCallback = onSettingsChangeCallback;
    setSettingsUI(currentSettings);

    SETTINGS_SCHEMA.forEach(({ key, input, value, type }) => {
        const el = elements[input];
        if (!el) return;
        const handler = (e) => {
            if (type === 'checkbox') {
                currentSettings[key] = el.checked;
            } else if (type === 'color') {
                currentSettings[key] = el.value;
            } else {
                currentSettings[key] = parseFloat(el.value);
            }
            if (value && elements[value]) elements[value].textContent = el.value;
            updateAndNotify();
        };
        el.addEventListener(type === 'checkbox' ? 'change' : 'input', handler);
    });

    // Initial notification
    updateAndNotify();
}

export function getSettingsState() {
    SETTINGS_SCHEMA.forEach(({ key, input, type }) => {
        const el = elements[input];
        if (!el) return;
        if (type === 'checkbox') {
            currentSettings[key] = el.checked;
        } else if (type === 'color') {
            currentSettings[key] = el.value;
        } else {
            currentSettings[key] = parseFloat(el.value);
        }
    });
    return { ...currentSettings };
}

export function setSettingsUI(settings) {
    if (!settings) return;
    SETTINGS_SCHEMA.forEach(({ key, input, value, type }) => {
        const el = elements[input];
        if (!el) return;
        if (type === 'checkbox') {
            el.checked = settings[key];
        } else {
            el.value = settings[key];
        }
        if (value && elements[value]) elements[value].textContent = settings[key];
        currentSettings[key] = settings[key];
    });
    updateAndNotify();
}

export function toggleMenu(controlsRef) {
    _isSettingsOpen = !_isSettingsOpen;
    let wasLocked = false;
    if (_isSettingsOpen) {
        wasLocked = controlsRef.isLocked;
        if (controlsRef.isLocked) controlsRef.unlock();
        settingsMenu.style.display = 'block';
        document.body.style.cursor = 'auto';
    } else {
        settingsMenu.style.display = 'none';
    }
    return { isOpen: _isSettingsOpen, wasLockedBefore: wasLocked };
}

export function isMenuOpen() {
    return _isSettingsOpen;
}

export function showMenu(show) {
    _isSettingsOpen = show;
    settingsMenu.style.display = show ? 'block' : 'none';
    if (show) document.body.style.cursor = 'auto';
}

// --- Add new settings easily ---
// 1. Add a new entry to SETTINGS_SCHEMA with key, input, value, type, and default.
// 2. Add the corresponding input element to your HTML.
// 3. Done! The system will handle UI sync and state.
import * as THREE from 'three';
import * as SceneSetup from './sceneSetup.js';
import * as PlayerControls from './playerControls.js';
import * as ItemManager from './itemManager.js';
import * as FileManager from './fileManager.js';
import * as SettingsManager from './settingsManager.js';
import { showLoadingIndicator } from './utils.js';



// DOM elements
const captionModal = document.getElementById('captionModal');
const captionInput = document.getElementById('captionInput');
const submitCaptionButton = document.getElementById('submitCaptionButton');
const museumCanvas = document.getElementById('museumCanvas');

let scene, camera, renderer;
let controls; // Player controls are managed by PlayerControls module, but reference needed here.
let prevTime = performance.now();
let animationFrameId = null;

// State variables
let isSettingsOpen = false;
let wasControlsLockedBeforeSettings = false; // State to remember if controls were locked when settings opened

// --- Animation Loop ---
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls && controls.isLocked === true) {
        PlayerControls.updatePlayerMovement(delta, SceneSetup.getFloorWidth());
    }
    // Update shadow position to follow player/camera
    if (controls) {
        SceneSetup.updateCameraShadow(controls.getObject());
    }
    renderer.render(scene, camera);

    prevTime = time;
}

// --- Centralized Cursor Lock Logic ---
// Call this after any menu/caption open/close
function updateCursorLock() {
    const menuOpen = SettingsManager.isMenuOpen();
    const captionOpen = captionModal.style.display === 'block';
    if (controls) {
        if (!menuOpen && !captionOpen && !controls.isLocked) {
            controls.lock();
        }
        // Never unlock cursor here; only lock when both are closed
    }
}

// --- Callbacks for Module Interactions ---

// Callback for settingsManager to apply settings changes
function onSettingsChange(settings) {
    PlayerControls.setPlayerSpeed(settings.playerSpeed);
    PlayerControls.setPlayerEyeLevel(settings.playerEyeLevel);
    SceneSetup.applyLightSettings(
        settings.directionalLightStrength,
        settings.ambientLightStrength,
        settings.ambientLightColor,
        settings.shadowsEnabled // <-- this is the shadow toggle
    );
    SceneSetup.applyFogSettings(
        settings.fogNear,
        settings.fogFar,
        settings.ambientLightColor
    );
    SceneSetup.applySurfaceColors({
        wall: settings.wallColor,
        wallRoughness: settings.wallRoughness,
        wallMetalness: settings.wallMetalness,
        ceiling: settings.ceilingColor,
        ceilingRoughness: settings.ceilingRoughness,
        ceilingMetalness: settings.ceilingMetalness,
        floor: settings.floorColor,
        floorRoughness: settings.floorRoughness,
        floorMetalness: settings.floorMetalness,
    });
    SceneSetup.updateMuseumLayout(SceneSetup.getFloorWidth());
    ItemManager.setImageZoffset(settings.imageZoffset); // Update item position immediately
    SceneSetup.updateRoomParameters({
        wallHeight: settings.wallHeight,
        wallDepth: settings.wallDepth,
        galleryWallZ: settings.galleryWallZ,
        minGalleryLength: settings.minGalleryLength
    });
}

// Callbacks for fileManager to handle caption modal
function showCaptionModal(file) {
    // Always close the menu when opening caption modal
    if (SettingsManager.isMenuOpen()) {
        SettingsManager.showMenu(false);
    }
    captionModal.querySelector('p').textContent = `Enter caption for: ${file.name}`;
    captionModal.style.display = 'block';
    captionInput.value = ''; // Clear previous input
    captionInput.focus();
    PlayerControls.enableMovementKeys(false); // Disable movement
    updateCursorLock();
}

function hideCaptionModal() {
    captionModal.style.display = 'none';
    PlayerControls.enableMovementKeys(true); // Re-enable movement
    // Block pointer lock for 400ms to absorb very fast/spam clicks (20+ per second)
    setTimeout(updateCursorLock, 400);
}

// Callback for fileManager and load process after items change
async function afterItemChange() {
    await ItemManager.sortAndDisplayItems();
    // Optionally update player position if museum size changed significantly,
    // but for now, just redrawing items is enough.
}


// --- Main Event Listeners and Game Flow ---

// General keydown listener for menu toggle
function onKeyDownGeneral(event) {
    // Always allow 'H' to toggle settings
    if (event.key.toLowerCase() === 'h') {
        toggleSettings();
        return;
    }
    // Allow 'Escape' to close settings menu if open
    if (event.key === 'Escape' && SettingsManager.isMenuOpen()) {
        toggleSettings();
        return;
    }
 
}

function toggleSettings() {
    const { isOpen } = SettingsManager.toggleMenu(controls);
    isSettingsOpen = isOpen;
    PlayerControls.enableMovementKeys(!isSettingsOpen); // Disable movement when menu is open
    updateCursorLock();
}

// --- Initialization ---
function startGame() {
    // Get initial settings
    const initialSettings = SettingsManager.getSettingsState();

    // Setup Scene, Camera, Renderer
    const { scene: initializedScene, camera: initializedCamera, renderer: initializedRenderer } = SceneSetup.initSceneAndRenderer(museumCanvas, initialSettings);
    scene = initializedScene;
    camera = initializedCamera;
    renderer = initializedRenderer;

    // Add the camera shadow mesh under the player
    SceneSetup.addCameraShadow(scene, camera);

    // Setup Player Controls
    controls = PlayerControls.initPlayerControls(
        camera,
        renderer.domElement,
        initialSettings.playerSpeed,
        initialSettings.playerEyeLevel,
        () => { /* onLockCallback - cursor hidden */ document.body.style.cursor = 'none'; PlayerControls.enableMovementKeys(true); },
        () => { /* onUnlockCallback - cursor shown */ document.body.style.cursor = 'auto'; PlayerControls.enableMovementKeys(false); }
    );
    scene.add(controls.getObject()); // Add controls camera group to the scene

    // Initialize Settings Manager UI and logic
    SettingsManager.initSettingsControls(onSettingsChange);

    // Initialize File Handling (File Input, Text Input, Save/Load)
    FileManager.initFileHandling(showCaptionModal, hideCaptionModal, afterItemChange);

    // Camera FOV controls
    const cameraFovSlider = document.getElementById('cameraFov');
    const cameraFovValue = document.getElementById('cameraFovValue');
    if (cameraFovSlider && cameraFovValue) {
        // Set initial slider and value display to match camera
        cameraFovSlider.value = camera.fov;
        cameraFovValue.textContent = camera.fov;
        // Update camera FOV on slider input
        cameraFovSlider.addEventListener('input', () => {
            const newFov = Number(cameraFovSlider.value);
            camera.fov = newFov;
            camera.updateProjectionMatrix();
            cameraFovValue.textContent = newFov;
        });
    }

    // --- Shadow Light and Shadow Settings Controls ---
    const mainLightStrengthSlider = document.getElementById('mainLightStrength');
    const mainLightStrengthValue = document.getElementById('mainLightStrengthValue');
    const shadowBlurSlider = document.getElementById('shadowBlur');
    const shadowBlurValue = document.getElementById('shadowBlurValue');
    const shadowOpacitySlider = document.getElementById('shadowOpacity');
    const shadowOpacityValue = document.getElementById('shadowOpacityValue');

    // Updater for shadow settings
    function updateShadowSettings() {
        // Opacity
        if (shadowOpacitySlider && typeof SceneSetup.setCameraShadowOpacity === "function") {
            const opacity = Number(shadowOpacitySlider.value);
            SceneSetup.setCameraShadowOpacity(opacity);
            if (shadowOpacityValue) shadowOpacityValue.textContent = opacity;
        }
        // Blur (simulate by changing circle scale)
        if (shadowBlurSlider && typeof SceneSetup.setCameraShadowBlur === "function") {
            const blur = Number(shadowBlurSlider.value);
            SceneSetup.setCameraShadowBlur(blur);
            if (shadowBlurValue) shadowBlurValue.textContent = blur;
        }
        // Main light strength (was shadow light)
      /*  if (window.dirLight && mainLightStrengthSlider) {
            const strength = Number(mainLightStrengthSlider.value);
            window.dirLight.intensity = strength;
            if (mainLightStrengthValue) mainLightStrengthValue.textContent = strength;
        } */

    }

    // Attach event listeners
    if (mainLightStrengthSlider) mainLightStrengthSlider.addEventListener('input', updateShadowSettings);
    if (shadowBlurSlider) shadowBlurSlider.addEventListener('input', updateShadowSettings);
    if (shadowOpacitySlider) shadowOpacitySlider.addEventListener('input', updateShadowSettings);

    // Set initial values
    updateShadowSettings();

    // Setup event listeners
    document.addEventListener('keydown', onKeyDownGeneral); // For menu toggle
    window.addEventListener('resize', SceneSetup.onWindowResize); // Window resize handler

    // Setup caption modal submit button listener
    submitCaptionButton.addEventListener('click', () => {
        FileManager.resolveCaptionPrompt(captionInput.value);
    });

    // Initial display of items (if any loaded from save later, this will re-run)
    // It's also good to run initially in case loading happens before player interaction
    afterItemChange(); 

    // Instead of calling updateCursorLock() from setTimeout or after loading,
    // attach a click handler to the canvas or a "Start" button:

    if (museumCanvas) {
        museumCanvas.addEventListener('click', () => {
            if (controls && !controls.isLocked) {
                controls.lock();
            }
        });
    }

    animate(); // Start the animation loop
}


// Auto-lock pointer when window regains focus and not in menu/caption
window.addEventListener('focus', () => {
    setTimeout(updateCursorLock, 50); // Small delay to allow browser to settle
});

// --- Start game immediately ---
startGame();

// Re-export necessary items for other modules if needed (less likely with this structure)
export { scene, camera, renderer, controls, toggleSettings }; // Exporting toggleSettings so FileManger can call it on Save/Load (optional, FileManager could trigger an event or call Main directly)

import * as THREE from 'three';

export let scene, camera, renderer;
let dirLight, ambientLight;
let floor, ceiling, wallN, wallS, wallE, wallW;

// Constants, these will be updated by settings
export let WALL_HEIGHT = 5;
export let WALL_DEPTH = 0.2;
export let GALLERY_WALL_Z = -5; 
export let MIN_GALLERY_LENGTH = 10;
export let CAMERA_FOV = 75; // Default, can be overridden by settings

// Internal state for colors and materials
let currentWallColor = "#998877";
let currentCeilingColor = "#aaaaaa";
let currentFloorColor = "#806040";
let currentWallRoughness = 0.8;
let currentWallMetalness = 0.2;
let currentCeilingRoughness = 0.8;
let currentCeilingMetalness = 0.2;
let currentFloorRoughness = 0.8;
let currentFloorMetalness = 0.2;
let currentBackgroundColor = 0x303040; 

let cameraShadowMesh = null; // For the simple player shadow

function createDirectionalLight(strength, enableShadows, position, targetPosition) {
    const light = new THREE.DirectionalLight(0xffffff, strength);
    light.position.set(position.x, position.y, position.z);
    light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    light.castShadow = enableShadows; // Items can cast shadows if this is true
    light.shadow.mapSize.width = 1024; // Default shadow map size
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50; // Increased far plane for larger scenes
    // Dynamic shadow camera frustum might be needed for very long galleries
    // For simplicity, keeping it fixed for now.
    light.shadow.camera.left = -25;
    light.shadow.camera.right = 25;
    light.shadow.camera.top = 25;
    light.shadow.camera.bottom = -25;
    return light;
}

export function initSceneAndRenderer(canvasElement, initialSettings) {
    scene = new THREE.Scene();
    currentBackgroundColor = initialSettings.ambientLightColor || currentBackgroundColor; // Use ambient light color for fog initially for harmony
    scene.background = new THREE.Color(currentBackgroundColor);
    scene.fog = new THREE.Fog(scene.background, initialSettings.fogNear, initialSettings.fogFar);

    CAMERA_FOV = initialSettings.cameraFov !== undefined ? initialSettings.cameraFov : CAMERA_FOV;
    camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = initialSettings.shadowsEnabled || false; 
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    renderer.toneMapping = THREE.NoToneMapping; // Explicitly set to NoToneMapping
    
    ambientLight = new THREE.AmbientLight(initialSettings.ambientLightColor, initialSettings.ambientLightStrength);
    scene.add(ambientLight);

    dirLight = createDirectionalLight(
        initialSettings.directionalLightStrength,
        initialSettings.shadowsEnabled,
        { x: 10, y: 15, z: 10 }, // Adjusted position for better overall lighting
        { x: 0, y: 0, z: 0 }
    );
    scene.add(dirLight.target); // Target needs to be in the scene
    scene.add(dirLight);
    
    applySurfaceColors({ 
        wall: initialSettings.wallColor,
        wallRoughness: initialSettings.wallRoughness,
        wallMetalness: initialSettings.wallMetalness,
        ceiling: initialSettings.ceilingColor,
        ceilingRoughness: initialSettings.ceilingRoughness,
        ceilingMetalness: initialSettings.ceilingMetalness,
        floor: initialSettings.floorColor,
        floorRoughness: initialSettings.floorRoughness,
        floorMetalness: initialSettings.floorMetalness,
    });
    
    // Apply initial room parameters
    updateRoomParameters({
        wallHeight: initialSettings.wallHeight,
        wallDepth: initialSettings.wallDepth,
        galleryWallZ: initialSettings.galleryWallZ,
        minGalleryLength: initialSettings.minGalleryLength
    }, false); // false to skip immediate layout, as sortAndDisplayItems will do it

    updateMuseumLayout(initialSettings.minGalleryLength || MIN_GALLERY_LENGTH); // Initial layout based on min length
    return { scene, camera, renderer };
}

export function updateMuseumLayout(galleryLength = MIN_GALLERY_LENGTH) {
    [floor, ceiling, wallN, wallS, wallE, wallW].forEach(obj => {
        if (obj) {
            scene.remove(obj);
            obj.geometry?.dispose();
            if (obj.material) {
                (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
            }
        }
    });

    const roomWidth = Math.abs(GALLERY_WALL_Z * 2) + WALL_DEPTH * 2 + 0.4; // Renamed roomDepth to roomWidth as it's along Z axis
                                                                    // but plane geometry uses width/height terminology
    const floorGeometry = new THREE.PlaneGeometry(galleryLength, roomWidth);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(currentFloorColor), roughness: currentFloorRoughness, metalness: currentFloorMetalness });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = renderer.shadowMap.enabled; // Only receive shadows if enabled
    scene.add(floor);

    ceiling = new THREE.Mesh(
        floorGeometry.clone(), // Use cloned geometry
        new THREE.MeshStandardMaterial({ color: new THREE.Color(currentCeilingColor), side: THREE.DoubleSide, roughness: currentCeilingRoughness, metalness: currentCeilingMetalness })
    );
    ceiling.position.y = WALL_HEIGHT;
    ceiling.rotation.x = -Math.PI / 2; // Rotate to be parallel to floor
    ceiling.receiveShadow = renderer.shadowMap.enabled;
    scene.add(ceiling);

    const mainWallMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(currentWallColor), roughness: currentWallRoughness, metalness: currentWallMetalness });

    // North/South walls (along X axis, at Z = GALLERY_WALL_Z and -GALLERY_WALL_Z)
    const wallNSGeometry = new THREE.BoxGeometry(galleryLength, WALL_HEIGHT, WALL_DEPTH);
    wallN = new THREE.Mesh(wallNSGeometry, mainWallMaterial.clone());
    wallN.position.set(0, WALL_HEIGHT / 2, GALLERY_WALL_Z - WALL_DEPTH / 2);
    wallN.castShadow = renderer.shadowMap.enabled;
    wallN.receiveShadow = renderer.shadowMap.enabled;
    scene.add(wallN);

    wallS = new THREE.Mesh(wallNSGeometry.clone(), mainWallMaterial.clone());
    wallS.position.set(0, WALL_HEIGHT / 2, -GALLERY_WALL_Z + WALL_DEPTH / 2);
    wallS.castShadow = renderer.shadowMap.enabled;
    wallS.receiveShadow = renderer.shadowMap.enabled;
    scene.add(wallS);

    // East/West walls (along Z axis, at X = galleryLength/2 and -galleryLength/2)
    const wallEWGeometry = new THREE.BoxGeometry(roomWidth, WALL_HEIGHT, WALL_DEPTH); // Width of these walls is roomWidth
    wallE = new THREE.Mesh(wallEWGeometry, mainWallMaterial.clone());
    wallE.position.set(galleryLength / 2 + WALL_DEPTH / 2, WALL_HEIGHT / 2, 0);
    wallE.rotation.y = Math.PI / 2; // Rotate to align
    wallE.castShadow = renderer.shadowMap.enabled;
    wallE.receiveShadow = renderer.shadowMap.enabled;
    scene.add(wallE);

    wallW = new THREE.Mesh(wallEWGeometry.clone(), mainWallMaterial.clone());
    wallW.position.set(-(galleryLength / 2) - WALL_DEPTH / 2, WALL_HEIGHT / 2, 0);
    wallW.rotation.y = Math.PI / 2;
    wallW.castShadow = renderer.shadowMap.enabled;
    wallW.receiveShadow = renderer.shadowMap.enabled;
    scene.add(wallW);
}

export function applyFogSettings(near, far, color) {
    if (scene?.fog) {
        scene.fog.near = near;
        scene.fog.far = far;
        if (color !== undefined) { 
            currentBackgroundColor = color; // This is the fog color
            scene.background = new THREE.Color(currentBackgroundColor);
            scene.fog.color.set(currentBackgroundColor);
        }
    }
}

export function applyLightSettings(directionalStrength, ambientStrength, ambientColor, enableShadows) {
    if (dirLight) {
        dirLight.intensity = directionalStrength;
        dirLight.castShadow = enableShadows; // This affects if items cast shadows
        dirLight.visible = true; 
    }
    if (ambientLight) {
        ambientLight.intensity = ambientStrength;
        ambientLight.color.set(ambientColor);
    }
    if (renderer) {
        const didShadowsChange = renderer.shadowMap.enabled !== enableShadows;
        renderer.shadowMap.enabled = enableShadows;
        // If shadows were toggled, materials might need update for receiveShadow.
        // This is handled by updateMuseumLayout and item creation.
        // For existing items, a full refresh via sortAndDisplayItems or specific update might be needed.
        // For now, wall/floor receiveShadow is set in updateMuseumLayout.
         if (didShadowsChange) {
            // Force re-evaluation of shadows on existing scene elements
            [floor, ceiling, wallN, wallS, wallE, wallW].forEach(obj => {
                if (obj) {
                    obj.receiveShadow = enableShadows;
                    obj.castShadow = enableShadows; // Walls can cast shadows too
                    if(obj.material) { // Materials might need update
                         (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.needsUpdate = true);
                    }
                }
            });
            // Items also need this, handled by itemManager sortAndDisplayItems
        }
    }
}

export function applySurfaceColors(colors) {
    let changed = false;
    if (colors.wall !== undefined && colors.wall !== currentWallColor) { currentWallColor = colors.wall; changed = true; }
    if (colors.wallRoughness !== undefined && colors.wallRoughness !== currentWallRoughness) { currentWallRoughness = colors.wallRoughness; changed = true; }
    if (colors.wallMetalness !== undefined && colors.wallMetalness !== currentWallMetalness) { currentWallMetalness = colors.wallMetalness; changed = true; }
    
    if (colors.ceiling !== undefined && colors.ceiling !== currentCeilingColor) { currentCeilingColor = colors.ceiling; changed = true; }
    if (colors.ceilingRoughness !== undefined && colors.ceilingRoughness !== currentCeilingRoughness) { currentCeilingRoughness = colors.ceilingRoughness; changed = true; }
    if (colors.ceilingMetalness !== undefined && colors.ceilingMetalness !== currentCeilingMetalness) { currentCeilingMetalness = colors.ceilingMetalness; changed = true; }

    if (colors.floor !== undefined && colors.floor !== currentFloorColor) { currentFloorColor = colors.floor; changed = true; }
    if (colors.floorRoughness !== undefined && colors.floorRoughness !== currentFloorRoughness) { currentFloorRoughness = colors.floorRoughness; changed = true; }
    if (colors.floorMetalness !== undefined && colors.floorMetalness !== currentFloorMetalness) { currentFloorMetalness = colors.floorMetalness; changed = true; }
    
    if (wallN?.material) {
    wallN.material.color.set(currentWallColor);
    wallN.material.roughness = currentWallRoughness;
    wallN.material.metalness = currentWallMetalness;
}
if (wallS?.material) {
    wallS.material.color.set(currentWallColor);
    wallS.material.roughness = currentWallRoughness;
    wallS.material.metalness = currentWallMetalness;
}
if (wallE?.material) {
    wallE.material.color.set(currentWallColor);
    wallE.material.roughness = currentWallRoughness;
    wallE.material.metalness = currentWallMetalness;
}
if (wallW?.material) {
    wallW.material.color.set(currentWallColor);
    wallW.material.roughness = currentWallRoughness;
    wallW.material.metalness = currentWallMetalness;
}
if (ceiling?.material) {
    ceiling.material.color.set(currentCeilingColor);
    ceiling.material.roughness = currentCeilingRoughness;
    ceiling.material.metalness = currentCeilingMetalness;
}
if (floor?.material) {
    floor.material.color.set(currentFloorColor);
    floor.material.roughness = currentFloorRoughness;
    floor.material.metalness = currentFloorMetalness;
}

    
}

export function getFloorWidth() { // This is actually gallery length along X
    return floor ? floor.geometry.parameters.width : MIN_GALLERY_LENGTH;
}
export function getGalleryDepth() { // This is gallery width along Z
    return floor ? floor.geometry.parameters.height : (Math.abs(GALLERY_WALL_Z * 2) + WALL_DEPTH * 2 + 0.4);
}

export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

export function addCameraShadow(sceneRef) {
    if (cameraShadowMesh) sceneRef.remove(cameraShadowMesh); // Remove old if exists
    const geometry = new THREE.CircleGeometry(0.35, 32); // Radius 0.35
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x000000, 
        transparent: true, 
        opacity: 0.22, // Default opacity
        depthTest: false // Render on top of floor but behind other objects if needed
    });
    cameraShadowMesh = new THREE.Mesh(geometry, material);
    cameraShadowMesh.rotation.x = -Math.PI / 2; // Align with floor
    // cameraShadowMesh.renderOrder = 1; // Ensure it's rendered after the floor
    sceneRef.add(cameraShadowMesh);
}

export function updateCameraShadow(playerObject) {
    if (!cameraShadowMesh || !renderer.shadowMap.enabled) { // Only show if shadows are globally enabled
        if(cameraShadowMesh) cameraShadowMesh.visible = false;
        return;
    }
    cameraShadowMesh.visible = true;
    cameraShadowMesh.position.x = playerObject.position.x;
    cameraShadowMesh.position.z = playerObject.position.z;
    cameraShadowMesh.position.y = 0.01; // Slightly above the floor
}

export function setCameraShadowOpacity(opacity) {
    if (cameraShadowMesh?.material) {
        cameraShadowMesh.material.opacity = Number(opacity);
    }
}

export function setCameraShadowBlur(blurFactor) { // blurFactor 0 to 1
    if (cameraShadowMesh) {
        // Scale the shadow to simulate blur: 1.0 is normal size, up to 2.0 for max blur
        const scale = 1 + Number(blurFactor); 
        cameraShadowMesh.scale.set(scale, scale, 1);
    }
}

export function setCameraFov(fov) {
    if (camera && typeof fov === 'number') {
        CAMERA_FOV = fov;
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }
}

export function updateRoomParameters(params = {}, performLayout = true) {
    let needsLayout = false;
    if (params.wallHeight !== undefined && params.wallHeight !== WALL_HEIGHT) { WALL_HEIGHT = params.wallHeight; needsLayout = true; }
    if (params.wallDepth !== undefined && params.wallDepth !== WALL_DEPTH) { WALL_DEPTH = params.wallDepth; needsLayout = true; }
    if (params.galleryWallZ !== undefined && params.galleryWallZ !== GALLERY_WALL_Z) { GALLERY_WALL_Z = params.galleryWallZ; needsLayout = true; }
    // MIN_GALLERY_LENGTH is primarily a suggestion for ItemManager; actual length determined by content.
    // But if it changes, it might affect the base layout if no items.
    if (params.minGalleryLength !== undefined && params.minGalleryLength !== MIN_GALLERY_LENGTH) { MIN_GALLERY_LENGTH = params.minGalleryLength; needsLayout = true; }
    
    if (needsLayout && performLayout) {
         // Use current gallery length or the new min length if it's larger
        const currentActualLength = floor ? floor.geometry.parameters.width : MIN_GALLERY_LENGTH;
        updateMuseumLayout(Math.max(currentActualLength, MIN_GALLERY_LENGTH));
    }
    return needsLayout; // Return if a relayout might be beneficial for item manager
}
import * as THREE from 'three';

    export let scene, camera, renderer;
    let dirLight, ambientLight;
    let floor, ceiling, wallN, wallS, wallE, wallW;

    // Constants
    export const WALL_HEIGHT = 5;
    export const WALL_DEPTH = 0.2;
    export const GALLERY_WALL_Z = -5; // Z position of one of the main display walls
    export const MIN_GALLERY_LENGTH = 10; // Minimum length for the gallery hall

    // Camera FOV
    export let CAMERA_FOV = 60; // Lowered from 75 to 60 for less distortion

    // Internal state for colors and materials
    let currentWallColor = "#998877";
    let currentCeilingColor = "#aaaaaa";
    let currentFloorColor = "#806040";
    let currentWallRoughness = 0.9;
    let currentWallMetalness = 0.0;
    let currentCeilingRoughness = 0.9;
    let currentCeilingMetalness = 0.0;
    let currentFloorRoughness = 0.8;
    let currentFloorMetalness = 0.2;
    let currentBackgroundColor = 0x303040; // Default background, fog might override visual

    let cameraShadowMesh = null;

    // Wall visibility toggles (default true)
    export let wallNVisible = true;
    export let wallSVisible = true;
    export let wallEVisible = true;
    export let wallWVisible = true;

    export function initSceneAndRenderer(canvasElement, initialSettings) {
        scene = new THREE.Scene();
        currentBackgroundColor = initialSettings.fogColor || currentBackgroundColor;
        scene.background = new THREE.Color(currentBackgroundColor);
        scene.fog = new THREE.Fog(scene.background, initialSettings.fogNear, initialSettings.fogFar);

        // Use FOV from settings if provided
        CAMERA_FOV = initialSettings.fov !== undefined ? initialSettings.fov : CAMERA_FOV;
        camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

        renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.PCFShadowMap  ; // Soft shadows

        renderer.toneMapping = THREE.PCFShadowMap ;
        renderer.toneMappingExposure = 1.0;
        
        ambientLight = new THREE.AmbientLight(initialSettings.ambientLightColor, initialSettings.ambientLightStrength);
        scene.add(ambientLight);

        // --- Use DirectionalLight instead of PointLight for dirLight ---
        dirLight = new THREE.DirectionalLight(0xffffff, initialSettings.directionalLightStrength);
        dirLight.position.set( 0.32, 0.39, 0.7 );
        dirLight.target.position.set(0, 0, 0);
        scene.add(dirLight.target);
        dirLight.castShadow = initialSettings.shadowsEnabled;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far =5;
        // Set shadow camera bounds to cover the gallery
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        scene.add(dirLight);
        if (typeof window !== 'undefined') {
            window.dirLight = dirLight;
            window.dirLight = dirLight; // For compatibility with main.js UI
        }
        // ---------------------------------------------------------------
    
        applySurfaceColors({ // Apply initial surface colors from settings
            wall: initialSettings.wallColor,
            ceiling: initialSettings.ceilingColor,
            floor: initialSettings.floorColor,
        });

        updateMuseumLayout(MIN_GALLERY_LENGTH); // Initial layout
        return { scene, camera, renderer };
    }

    export function updateMuseumLayout(galleryLength = MIN_GALLERY_LENGTH) {
        [floor, ceiling, wallN, wallS, wallE, wallW].forEach(obj => {
            if (obj) {
                scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            }
        });

        const roomDepth = Math.abs(GALLERY_WALL_Z * 2) + WALL_DEPTH * 2 + 0.4;

        const floorGeometry = new THREE.PlaneGeometry(galleryLength, roomDepth);
        const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(currentFloorColor), roughness: currentFloorRoughness, metalness: currentFloorMetalness });
        floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        ceiling = new THREE.Mesh(
            floorGeometry.clone(),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(currentCeilingColor), side: THREE.DoubleSide, roughness: currentCeilingRoughness, metalness: currentCeilingMetalness })
        );
        ceiling.position.y = WALL_HEIGHT;
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.receiveShadow = true;
        scene.add(ceiling);

        const mainWallMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(currentWallColor), roughness: currentWallRoughness, metalness: currentWallMetalness });

        const wallNSGeometry = new THREE.BoxGeometry(galleryLength, WALL_HEIGHT, WALL_DEPTH);
        wallN = new THREE.Mesh(wallNSGeometry, mainWallMaterial.clone());
        wallN.position.set(0, WALL_HEIGHT / 2, GALLERY_WALL_Z - WALL_DEPTH / 2);
        wallN.castShadow = true;
        wallN.receiveShadow = true;
        if (wallNVisible) scene.add(wallN);

        wallS = new THREE.Mesh(wallNSGeometry.clone(), mainWallMaterial.clone());
        wallS.position.set(0, WALL_HEIGHT / 2, -GALLERY_WALL_Z + WALL_DEPTH / 2);
        wallS.castShadow = true;
        wallS.receiveShadow = true;
        if (wallSVisible) scene.add(wallS);

        const wallEWGeometry = new THREE.BoxGeometry(roomDepth, WALL_HEIGHT, WALL_DEPTH);
        wallE = new THREE.Mesh(wallEWGeometry, mainWallMaterial.clone());
        wallE.position.set(galleryLength / 2 + WALL_DEPTH / 2, WALL_HEIGHT / 2, 0);
        wallE.rotation.y = Math.PI / 2;
        wallE.castShadow = true;
        wallE.receiveShadow = true;
        if (wallEVisible) scene.add(wallE);

        wallW = new THREE.Mesh(wallEWGeometry.clone(), mainWallMaterial.clone());
        wallW.position.set(-(galleryLength / 2) - WALL_DEPTH / 2, WALL_HEIGHT / 2, 0);
        wallW.rotation.y = Math.PI / 2;
        wallW.castShadow = true;
        wallW.receiveShadow = true;
        if (wallWVisible) scene.add(wallW);
    }

    export function applyFogSettings(near, far, color) {
        if (scene && scene.fog) {
            scene.fog.near = near;
            scene.fog.far = far;
            if (color !== undefined) { // Assuming color might not always be passed
                currentBackgroundColor = color;
                scene.background = new THREE.Color(currentBackgroundColor);
                scene.fog.color.set(currentBackgroundColor);
            }
        }
    }

    export function applyLightSettings(shadowStrength, ambientStrength, ambientColor, enableShadows) {
        if (dirLight) {
            dirLight.intensity = shadowStrength;
            dirLight.castShadow = enableShadows;
            // DirectionalLight does not have receiveShadow property
            dirLight.visible = true;
        }
        if (ambientLight) {
            ambientLight.intensity = ambientStrength;
            ambientLight.color.set(ambientColor);
        }
        if (renderer) {
            console.log("shadows on: " + enableShadows)
            renderer.shadowMap.enabled = enableShadows;

        }
        // Toggle receiveShadow/castShadow for all relevant meshes
        [floor, ceiling, wallN, wallS, wallE, wallW].forEach(obj => {
            if (obj) {
                obj.receiveShadow = !!enableShadows;
                obj.castShadow = !!enableShadows;
            }
        });
    }

    export function applySurfaceColors(colors) {
        if (colors.wall) currentWallColor = colors.wall;
        if (colors.ceiling) currentCeilingColor = colors.ceiling;
        if (colors.floor) currentFloorColor = colors.floor;
        if (colors.wallRoughness !== undefined) currentWallRoughness = colors.wallRoughness;
        if (colors.wallMetalness !== undefined) currentWallMetalness = colors.wallMetalness;
        if (colors.ceilingRoughness !== undefined) currentCeilingRoughness = colors.ceilingRoughness;
        if (colors.ceilingMetalness !== undefined) currentCeilingMetalness = colors.ceilingMetalness;
        if (colors.floorRoughness !== undefined) currentFloorRoughness = colors.floorRoughness;
        if (colors.floorMetalness !== undefined) currentFloorMetalness = colors.floorMetalness;
        // This function now just updates the state; updateMuseumLayout will use these
        // To force a redraw with new colors, call updateMuseumLayout(getCurrentGalleryLength())
        // or rely on the next item addition/settings change that triggers it.
        // For immediate effect, main.js should call updateMuseumLayout after this.
    }

    export function getFloorWidth() {
        return floor ? floor.geometry.parameters.width : MIN_GALLERY_LENGTH;
    }

    export function onWindowResize() {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    export function addCameraShadow(scene, camera) {
        if (cameraShadowMesh) return; // Only add once
        const geometry = new THREE.CircleGeometry(0.35, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
        cameraShadowMesh = new THREE.Mesh(geometry, material);
        cameraShadowMesh.rotation.x = -Math.PI / 2;
        cameraShadowMesh.position.y = 0; // Slightly above floor to avoid z-fighting
        cameraShadowMesh.renderOrder = 9999; // Always on top
      //  scene.add(cameraShadowMesh);
    }

    export function updateCameraShadow(playerObject) {
        if (!cameraShadowMesh) return;
        // Use the player's base position, but clamp to the floor area
        cameraShadowMesh.position.x = playerObject.position.x;
        cameraShadowMesh.position.z = playerObject.position.z;
        cameraShadowMesh.position.y = 0.01; // Always just above the floor
    }



    /**
     * Update the camera FOV at runtime.
     * @param {number} fov - The new field of view in degrees.
     */
    export function setCameraFov(fov) {
        if (camera && typeof fov === 'number') {
            CAMERA_FOV = fov;
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
    }

    /**
     * Set wall visibility flags and update layout.
     * @param {object} vis - { wallNVisible, wallSVisible, wallEVisible, wallWVisible }
     */
    export function setWallVisibility(vis) {
        if (typeof vis.wallNVisible === 'boolean') wallNVisible = vis.wallNVisible;
        if (typeof vis.wallSVisible === 'boolean') wallSVisible = vis.wallSVisible;
        if (typeof vis.wallEVisible === 'boolean') wallEVisible = vis.wallEVisible;
        if (typeof vis.wallWVisible === 'boolean') wallWVisible = vis.wallWVisible;
        updateMuseumLayout(getFloorWidth());
    }
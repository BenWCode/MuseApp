import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WALL_HEIGHT, WALL_DEPTH, GALLERY_WALL_Z } from './sceneSetup.js';

export let controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let _prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let _playerSpeed = 200.0;
let _playerEyeLevel = 1.7;
let _inputEnabled = true; // To disable WASD when menu is open etc.

export function initPlayerControls(camera, domElement, initialSpeed, initialEyeLevel, onLockCallback, onUnlockCallback) {
    _playerSpeed = initialSpeed;
    _playerEyeLevel = initialEyeLevel;

    controls = new PointerLockControls(camera, domElement);
    controls.getObject().position.y = _playerEyeLevel;
    controls.getObject().position.z = 5; // Start player a bit out

    controls.addEventListener('lock', () => {
        _inputEnabled = true;
        if(onLockCallback) onLockCallback();
    });
    controls.addEventListener('unlock', () => {
        _inputEnabled = false;
        if(onUnlockCallback) onUnlockCallback();
    });
    
    document.addEventListener('keydown', onKeyDownMovement);
    document.addEventListener('keyup', onKeyUpMovement);

    return controls;
}

export function setPlayerSpeed(speed) {
    _playerSpeed = parseFloat(speed);
}

export function setPlayerEyeLevel(height) {
    _playerEyeLevel = parseFloat(height);
    if (controls) {
        controls.getObject().position.y = _playerEyeLevel;
    }
}

function onKeyDownMovement(event) {
    if (!controls || !controls.isLocked || !_inputEnabled) return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
    }
}

function onKeyUpMovement(event) {
    // No need to check if locked here, just reset flags
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
    }
}

function checkCollisions(playerPosition, currentGalleryLength) {
    const playerRadius = 0.5;

    // Use gallery length for both X and Z for symmetry
    const eastWallX = currentGalleryLength / 2 + WALL_DEPTH / 2;
    const westWallX = -currentGalleryLength / 2 - WALL_DEPTH / 2;
    const northWallZ = -currentGalleryLength / 2 - WALL_DEPTH / 2;
    const southWallZ = currentGalleryLength / 2 + WALL_DEPTH / 2;

    // X-axis collision (East/West walls)
    if (playerPosition.x > eastWallX - playerRadius) {
        playerPosition.x = eastWallX - playerRadius;
        velocity.x = 0;
    }
    if (playerPosition.x < westWallX + playerRadius) {
        playerPosition.x = westWallX + playerRadius;
        velocity.x = 0;
    }

    // Z-axis collision (North/South walls)
    if (playerPosition.z < northWallZ + playerRadius) {
        playerPosition.z = northWallZ + playerRadius;
        velocity.z = 0;
    }
    if (playerPosition.z > southWallZ - playerRadius) {
        playerPosition.z = southWallZ - playerRadius;
        velocity.z = 0;
    }

    // Y-axis collision (floor)
    if (playerPosition.y < _playerEyeLevel) {
        playerPosition.y = _playerEyeLevel;
        velocity.y = 0;
    }
    // Optional: Prevent going through ceiling
    if (playerPosition.y > WALL_HEIGHT - playerRadius / 2) {
        playerPosition.y = WALL_HEIGHT - playerRadius / 2;
        velocity.y = 0;
    }
}

export function updatePlayerMovement(delta, currentGalleryLength) {
    if (controls && controls.isLocked === true) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * _playerSpeed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * _playerSpeed * delta;
        
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        checkCollisions(controls.getObject().position, currentGalleryLength);
        let playerPos = getPlayerPosition();
        console.log(playerPos.x, playerPos.y, playerPos.z);
    }
    _prevTime = performance.now(); // Update prevTime here, though delta is passed in
}

export function getPlayerPosition() {
    return controls ? controls.getObject().position.clone() : new THREE.Vector3();
}

export function enableMovementKeys(enable) {
    _inputEnabled = enable;
    if (!enable) { // Reset movement flags if disabling
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    }
}
import * as THREE from 'three';
import { createTextCanvas, createInfoTextCanvas } from './utils.js';
import { scene as threeScene, GALLERY_WALL_Z, MIN_GALLERY_LENGTH, updateMuseumLayout as sceneUpdateLayout } from './sceneSetup.js'; 

const museumItems = [];
let nextItemPositionX = 0; 
const ITEM_SPACING = 6;
let _imageZoffset = 0.01; 

export function getAllMuseumItems() {
    return [...museumItems]; 
}

export function addItem(itemData) {
    // Clone the itemData to avoid reference issues
    const clonedItem = { ...itemData };
    museumItems.push(clonedItem);
    // Always create a new group for the item
    clonedItem.group = new THREE.Group();
}

export function clearAllItemsAndSceneObjects() {
    museumItems.forEach(item => {   
        if (item.group) {
            threeScene.remove(item.group);
            item.group.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            if (child.material.map) child.material.map.dispose();
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        item.group = null;
    });
    museumItems.length = 0; 
}


export function setImageZoffset(offset) {
    _imageZoffset = parseFloat(offset);
    for (const item of museumItems) {
        if (item.group) {
            item.group.position.z = GALLERY_WALL_Z + _imageZoffset;
        }
    }
}

export function getImageZoffset() {
    return _imageZoffset;
}

export async function sortAndDisplayItems() {
    museumItems.sort((a, b) => a.date - b.date);

    museumItems.forEach(item => {
        if (item.group) {
            threeScene.remove(item.group); 
            item.group.traverse(child => {
                if (child.isMesh) {
                    if(child.geometry) child.geometry.dispose();
                    if(child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if(mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            if(child.material.map) child.material.map.dispose();
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        item.group = null;
    });
    
    const itemsVisualWidth = museumItems.length > 0 ? (museumItems.length * ITEM_SPACING) : 0;
    const requiredGalleryLength = Math.max(MIN_GALLERY_LENGTH, itemsVisualWidth + ITEM_SPACING);
    sceneUpdateLayout(requiredGalleryLength); 
    
    nextItemPositionX = -((museumItems.length - 1) * ITEM_SPACING) / 2;

    for (let index = 0; index < museumItems.length; index++) {
        const item = museumItems[index];
        const itemGroup = new THREE.Group();
        
        const displayPlaneHeight = 2.5;
        const displayPlaneWidth = 3.5;
        let mainMesh;

        if (item.type === 'image') {
            if (item.file instanceof File && (!item.sourceUrl || !item.sourceUrl.startsWith('blob:'))) {
                 item.sourceUrl = URL.createObjectURL(item.file);
            }
            if (item.sourceUrl) {
                try {
                    let texture;
                    if (item.texture && item.texture.source && item.texture.source.data && item.texture.source.data.src === item.sourceUrl) {
                        texture = item.texture;
                    } else {
                        // Only dispose if item.texture is a real THREE.Texture
                        if (item.texture && typeof item.texture.dispose === 'function') {
                            item.texture.dispose();
                        }
                        texture = await new THREE.TextureLoader().loadAsync(item.sourceUrl);
                        texture.colorSpace = THREE.SRGBColorSpace;
                        item.texture = texture; 
                    }
                    
                    const aspectRatio = texture.image.width / texture.image.height;
                    let planeWidth = displayPlaneWidth;
                    let planeHeight = displayPlaneWidth / aspectRatio;
                    if (planeHeight > displayPlaneHeight) {
                        planeHeight = displayPlaneHeight;
                        planeWidth = displayPlaneHeight * aspectRatio;
                    }
                    
                    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
                    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
                    mainMesh = new THREE.Mesh(geometry, material);
                    mainMesh.castShadow = true;
                } catch (e) {
                    console.error("Error loading image texture for:", item.file && item.file.name, e);
                    const placeholderGeo = new THREE.PlaneGeometry(displayPlaneWidth * 0.8, displayPlaneHeight * 0.8);
                    const errorTextCanvas = createInfoTextCanvas(`Error loading:\n${item.file.name}`, 512, 128);
                    const errorTexture = new THREE.CanvasTexture(errorTextCanvas);
                    const placeholderMat = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
                    mainMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
                }
            } else {
                 const placeholderGeo = new THREE.PlaneGeometry(displayPlaneWidth * 0.8, displayPlaneHeight * 0.8);
                 const errorTextCanvas = createInfoTextCanvas(`Image source missing:\n${item.file.name}`, 512, 128);
                 const errorTexture = new THREE.CanvasTexture(errorTextCanvas);
                 const placeholderMat = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
                 mainMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
            }
        } else if (item.type === 'text') {
            if (!item.textContent || item.textContent.trim() === "") item.textContent = "[No text content]";
            const title = item.file && item.file.name ? item.file.name : "Text Entry";
            const textCanvas = createTextCanvas(item.textContent, 1024, 1024 * 1.5, title);
            const texture = new THREE.CanvasTexture(textCanvas);
            texture.needsUpdate = true;
            const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.1 });
            const textPlaneWidth = displayPlaneWidth * 0.7;
            const textPlaneHeight = displayPlaneHeight;
            const geometry = new THREE.PlaneGeometry(textPlaneWidth, textPlaneHeight);
            mainMesh = new THREE.Mesh(geometry, material);
            mainMesh.castShadow = true;
        }

        if (mainMesh) {
            mainMesh.position.y = displayPlaneHeight / 2 + 0.5;
            itemGroup.add(mainMesh);
        }

        const dateStr = item.date.toLocaleString();
        const captionStr = item.caption ? `Caption: ${item.caption}` : '';
        const locationStr = (item.location && item.location !== 'N/A' && item.location !== 'The Museum') ? `Location: ${item.location}` : '';
        const infoText = [dateStr, captionStr, locationStr].filter(Boolean).join('\n');

        if (infoText) {
            const infoCanvas = createInfoTextCanvas(infoText, 512, 256);
            const infoTexture = new THREE.CanvasTexture(infoCanvas);
            infoTexture.needsUpdate = true;
            const infoMaterial = new THREE.MeshBasicMaterial({ map: infoTexture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 });
            const infoPlaneHeight = 0.5;
            const infoPlaneWidth = Math.min(displayPlaneWidth * 0.9, (infoPlaneHeight * infoCanvas.width) / infoCanvas.height);
            const infoGeometry = new THREE.PlaneGeometry(infoPlaneWidth, infoPlaneHeight);
            const infoMesh = new THREE.Mesh(infoGeometry, infoMaterial);
            infoMesh.position.y = 0.25;
            itemGroup.add(infoMesh);
        }

        itemGroup.position.set(nextItemPositionX + index * ITEM_SPACING, 0, GALLERY_WALL_Z + _imageZoffset);
        threeScene.add(itemGroup); 
        item.group = itemGroup;
    }
}
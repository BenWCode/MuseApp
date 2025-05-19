import { fileToDataURL, parseExifDate, formatGPS, showLoadingIndicator } from './utils.js';
import * as ItemManager from './itemManager.js'; 
import * as SettingsManager from './settingsManager.js'; 

const fileInput = document.getElementById('fileInput');
const addItemButton = document.getElementById('addItemButton');
const textWriterInput = document.getElementById('textWriterInput');
const addTextEntryButton = document.getElementById('addTextEntryButton');
const loadGameInput = document.getElementById('loadGameInput');
const saveToFileButton = document.getElementById('saveToFileButton');
const saveToLocalButton = document.getElementById('saveToLocalButton');
const loadFromLocalButton = document.getElementById('loadFromLocalButton');

let _showCaptionModalCallback = null; 
let _hideCaptionModalCallback = null; 
let _afterItemChangeCallback = null; 

let _currentImageFileForCaption = null;
let _currentImageResolve = null;

export function initFileHandling(showCaptionCb, hideCaptionCb, afterItemChangeCb) {
    _showCaptionModalCallback = showCaptionCb;
    _hideCaptionModalCallback = hideCaptionCb;
    _afterItemChangeCallback = afterItemChangeCb;

    if (!addItemButton) {
        console.error("addItemButton element not found. Check your HTML for id='addItemButton'.");
    } else {
        addItemButton.addEventListener('click', handleFiles);
    }
    if (!addTextEntryButton) {
        console.error("addTextEntryButton element not found. Check your HTML for id='addTextEntryButton'.");
    } else {
        addTextEntryButton.addEventListener('click', handleAddTextEntry);
    }
    if (!saveToFileButton) {
        console.error("saveToFileButton element not found. Check your HTML for id='saveToFileButton'.");
    } else {
        saveToFileButton.addEventListener('click', saveGameState);
    }
    if (!loadGameInput) {
        console.error("loadGameInput element not found. Check your HTML for id='loadGameInput'.");
    } else {
        loadGameInput.addEventListener('change', handleLoadGameFile);
    }
    if (!saveToLocalButton) {
        console.error("saveToLocalButton element not found. Check your HTML for id='saveToLocalButton'.");
    } else {
        saveToLocalButton.addEventListener('click', saveGameStateToLocalStorage);
    }
    if (!loadFromLocalButton) {
        console.error("loadFromLocalButton element not found. Check your HTML for id='loadFromLocalButton'.");
    } else {
        loadFromLocalButton.addEventListener('click', loadGameStateFromLocalStorage);
    }
}

async function handleFiles() {
    const files = fileInput.files;
    if (files.length === 0) return;
    console.log(`[handleFiles] Number of files selected: ${files.length}`);
    for (const file of files) {
        console.log(`[handleFiles] File: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    }
    showLoadingIndicator(true); // Move this to the very top, before any blocking work
    await Promise.resolve(); // Yield to the browser to allow the loading indicator to render

    const addItemPromises = [];
    for (const file of files) {
        let itemData = {
            file: file, 
            date: new Date(file.lastModified), 
            type: file.type.startsWith('image/') ? 'image' : (file.name.endsWith('.txt') ? 'text' : 'unknown'),
            caption: '',
            location: 'The Museum', 
        };

        if (itemData.type === 'image') {
            try {
                const exifData = await new Promise((resolve, reject) => {
                    if (typeof EXIF === 'undefined' || !EXIF.getData) {
                        console.warn("EXIF.js not loaded or not ready.");
                        resolve({}); 
                        return;
                    }
                    EXIF.getData(file, function() {
                        resolve(EXIF.getAllTags(this));
                    });
                });

                if (exifData && exifData.DateTimeOriginal) itemData.date = parseExifDate(exifData.DateTimeOriginal);
                if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
                    itemData.location = `Lat: ${formatGPS(exifData.GPSLatitude, exifData.GPSLatitudeRef)}, Lon: ${formatGPS(exifData.GPSLongitude, exifData.GPSLongitudeRef)}`;
                } else {
                    itemData.location = 'N/A'; 
                }
                itemData.caption = await promptForCaptionInternal(file);
            } catch (error) {
                console.warn("Could not read EXIF data for", file.name, error);
                itemData.location = 'N/A'; 
                try {
                    itemData.caption = await promptForCaptionInternal(file);
                } catch (captionError) { console.error("Caption error after EXIF fail:", captionError); }
            }
            itemData.sourceUrl = URL.createObjectURL(file); 
            console.log(`[handleFiles] Created object URL for image: ${itemData.sourceUrl}`);
        } else if (itemData.type === 'text') {
            itemData.textContent = await file.text();
            if (!itemData.textContent || itemData.textContent.trim() === "") itemData.textContent = "[Empty File]";
            itemData.location = 'N/A'; 
        } else {
            console.warn("Unsupported file type:", file.name);
            continue; 
        }
        // Add items in parallel
        addItemPromises.push(ItemManager.addItem(itemData));
    }
    await Promise.all(addItemPromises);
    if (_afterItemChangeCallback) await _afterItemChangeCallback();
    showLoadingIndicator(false);
    fileInput.value = ''; 
    console.log("[handleFiles] All files processed and added.");
}

async function handleAddTextEntry() {
    const textContent = textWriterInput.value.trim();
    if (!textContent) {
        alert("Please write some text before adding.");
        return;
    }
    showLoadingIndicator(true);
    const timestamp = new Date();
    const entryName = `Written Entry - ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}.txt`;
    
    const itemData = {
        file: { name: entryName, type: 'text/plain', lastModified: timestamp.getTime() }, 
        date: timestamp, type: 'text', caption: '', location: 'N/A', textContent: textContent, sourceUrl: null 
    };
    ItemManager.addItem(itemData);
    
    if (_afterItemChangeCallback) await _afterItemChangeCallback();
    textWriterInput.value = ''; 
    showLoadingIndicator(false);
}

function promptForCaptionInternal(file) { 
    return new Promise((resolve) => {
        _currentImageFileForCaption = file;
        _currentImageResolve = resolve;
        if (_showCaptionModalCallback) _showCaptionModalCallback(file);
    });
}

export function resolveCaptionPrompt(caption) {
    if (_currentImageResolve) {
        _currentImageResolve(caption);
        _currentImageFileForCaption = null;
        _currentImageResolve = null;
    }
    if (_hideCaptionModalCallback) _hideCaptionModalCallback();
}

// IndexedDB helpers for image storage
const DB_NAME = 'museumDB';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';

function openImageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE);
            }
        };
        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

async function saveImageToDB(id, file) {
    const db = await openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([IMAGE_STORE], 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.put(file, id);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
    });
}

async function getImageFromDB(id) {
    const db = await openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([IMAGE_STORE], 'readonly');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    });
}

async function deleteImageFromDB(id) {
    const db = await openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([IMAGE_STORE], 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
    });
}

// Utility: Read a File as Data URL (base64)


// Utility: Convert Data URL to File
function dataURLToFile(dataUrl, fileName, fileType) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], fileName, { type: fileType || mime });
}

// Modified getItemSaveData to embed images as data URLs for true exportability
async function getItemSaveData(item) {
    if (item.type === 'image') {
        let dataUrl = undefined;
        if (item.file instanceof File) {
            dataUrl = await fileToDataURL(item.file);
        } else if (item.sourceUrl && item.sourceUrl.startsWith('blob:')) {
            try {
                const response = await fetch(item.sourceUrl);
                const blob = await response.blob();
                const file = new File([blob], item.file.name, { type: item.file.type });
                dataUrl = await fileToDataURL(file);
            } catch (e) {
                console.error("Error converting blob URL to dataUrl:", item.file.name, e);
            }
        }
        return {
            type: 'image',
            fileName: item.file.name,
            fileType: item.file.type,
            dataUrl: dataUrl, // embed image data
            date: item.date.toISOString(),
            caption: item.caption,
            location: item.location,
        };
    } else if (item.type === 'text') {
        return {
            type: 'text',
            fileName: item.file.name,
            fileType: item.file.type || 'text/plain',
            textContent: item.textContent,
            date: item.date.toISOString(),
            caption: item.caption,
            location: item.location,
        };
    }
    return null;
}

async function saveGameState() {
    showLoadingIndicator(true);
    console.log("[saveGameState] Start (ZIP export)");
    const zip = new JSZip();
    const manifest = [];
    const settingsToSave = SettingsManager.getSettingsState();
    const currentItems = ItemManager.getAllMuseumItems();
    console.log(`[saveGameState] Number of items to save: ${currentItems.length}`);
    for (const item of currentItems) {
        if (item.type === 'image' && item.file) {
            let blob;
            if (item.file instanceof File) {
                blob = item.file;
            } else if (item.sourceUrl) {
                try {
                    blob = await fetch(item.sourceUrl).then(r => r.blob());
                } catch (e) {
                    console.warn("Could not fetch blob for image", item.file.name, e);
                    continue;
                }
            } else {
                continue;
            }
            // --- Ensure unique filename for each image in the ZIP ---
            let baseName = item.file.name.replace(/\.[^/.]+$/, "");
            let ext = item.file.name.split('.').pop();
            // Use ISO string for timestamp, replace : and . with -
            const timestamp = new Date(item.date).toISOString().replace(/[:.]/g, '-');
            let uniqueFilename = `${baseName}_${timestamp}.${ext}`;
            // If by some chance this path is still not unique, add a counter
            let counter = 1;
            let imgPath = `images/${uniqueFilename}`;
            while (manifest.some(m => m.path === imgPath)) {
                uniqueFilename = `${baseName}_${timestamp}_${counter}.${ext}`;
                imgPath = `images/${uniqueFilename}`;
                counter++;
            }
            // --------------------------------------------------------
            console.log(`[saveGameState] Adding image to zip: ${uniqueFilename}, size: ${blob.size} bytes`);
            zip.file(imgPath, blob);
            manifest.push({
                ...item,
                path: imgPath,
                sourceUrl: undefined,
                file: undefined,
            });
        } else if (item.type === 'text') {
            const txtPath = `texts/${item.file.name}`;
            console.log(`[saveGameState] Adding text to zip: ${item.file.name}, length: ${(item.textContent || "").length} chars`);
            zip.file(txtPath, item.textContent || "");
            manifest.push({
                ...item,
                path: txtPath,
                sourceUrl: undefined,
                file: undefined,
            });
        }
    }
    zip.file('manifest.json', JSON.stringify({ settings: settingsToSave, museumItems: manifest }, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    console.log(`[saveGameState] ZIP file size: ${content.size} bytes`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `museum_export_${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showLoadingIndicator(false);
    console.log("[saveGameState] ZIP export complete.");
}

async function handleLoadGameFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    console.log(`[handleLoadGameFile] Loading file: ${file.name}, size: ${file.size} bytes`);
    showLoadingIndicator(true);
    console.log("Loading game state...");
    try {
        // Try ZIP first
        if (file.name.endsWith('.zip')) {
            console.log("[handleLoadGameFile] Detected ZIP file.");
            const zip = await JSZip.loadAsync(file);
            const manifestText = await zip.file('manifest.json').async('string');
            const manifestObj = JSON.parse(manifestText);
            const { settings, museumItems: manifest } = manifestObj;
            // Always apply all settings, including minGalleryLength
            if (settings && typeof SettingsManager.setSettingsUI === 'function') {
                SettingsManager.setSettingsUI(settings);
                console.log("Settings restored from ZIP.");
            }
            if (typeof ItemManager.clearAllItemsAndSceneObjects === 'function') {
                ItemManager.clearAllItemsAndSceneObjects();
            }
            let count = 0;
            // FIX: Process items sequentially to ensure unique File and ObjectURL per image
            for (const entry of manifest) {
                if (entry.type === 'image' && entry.path) {
                    const blob = await zip.file(entry.path).async('blob');
                    console.log(`[handleLoadGameFile] Extracted image: ${entry.fileName}, size: ${blob.size} bytes`);
                    const fileObj = new File([blob], entry.fileName, { type: entry.fileType });
                    await ItemManager.addItem({
                        ...entry,
                        file: fileObj,
                        sourceUrl: URL.createObjectURL(fileObj),
                        date: new Date(entry.date),
                    });
                } else if (entry.type === 'text' && entry.path) {
                    const text = await zip.file(entry.path).async('string');
                    console.log(`[handleLoadGameFile] Extracted text: ${entry.fileName}, length: ${text.length} chars`);
                    await ItemManager.addItem({
                        ...entry,
                        textContent: text,
                        file: { name: entry.fileName, type: entry.fileType },
                        date: new Date(entry.date),
                    });
                }
                count++;
                if (count % 5 === 0 || count === manifest.length) {
                    console.log(`Imported ${count} / ${manifest.length} items...`);
                }
            }
            if (_afterItemChangeCallback) await _afterItemChangeCallback();
            showLoadingIndicator(false);
            event.target.value = '';
            console.log("Museum state loaded from ZIP successfully.");
            return;
        }
        // Fallback: try as LZJSON or plain JSON
        const compressedString = await file.text();
        console.log(`[handleLoadGameFile] Loaded text file, length: ${compressedString.length} chars`);
        let jsonString;
        try {
            jsonString = LZString.decompressFromBase64(compressedString);
            if (!jsonString) throw new Error('Not compressed or failed decompress');
            console.log("[handleLoadGameFile] Decompressed LZString data.");
        } catch (e) {
            jsonString = compressedString;
            console.log("[handleLoadGameFile] Using plain JSON data.");
        }
        const loadedData = JSON.parse(jsonString);
        const { settings, museumItems: loadedItems } = loadedData;
        // Always apply all settings, including minGalleryLength
        if (settings && typeof SettingsManager.setSettingsUI === 'function') {
            SettingsManager.setSettingsUI(settings);
            console.log("Settings restored from file.");
        }
        if (typeof ItemManager.clearAllItemsAndSceneObjects === 'function') {
            ItemManager.clearAllItemsAndSceneObjects();
        }
        if (Array.isArray(loadedItems)) {
            let count = 0;
            for (const item of loadedItems) {
                if (item.type === 'image' && item.dataUrl) {
                    let fileObj = null;
                    try {
                        fileObj = dataURLToFile(item.dataUrl, item.fileName, item.fileType);
                        console.log(`[handleLoadGameFile] Reconstructed image file: ${item.fileName}, size: ${fileObj.size} bytes`);
                    } catch (e) {
                        console.warn("Could not reconstruct File for image, using dataUrl only.", item.fileName, e);
                    }
                    ItemManager.addItem({
                        file: fileObj || { name: item.fileName, type: item.fileType },
                        date: new Date(item.date),
                        type: 'image',
                        caption: item.caption || '',
                        location: item.location || 'N/A',
                        sourceUrl: fileObj ? URL.createObjectURL(fileObj) : item.dataUrl
                    });
                } else if (item.type === 'text') {
                    console.log(`[handleLoadGameFile] Loaded text item: ${item.fileName}, length: ${(item.textContent || '').length} chars`);
                    ItemManager.addItem({
                        file: { name: item.fileName, type: item.fileType },
                        date: new Date(item.date),
                        type: 'text',
                        caption: item.caption || '',
                        location: item.location || 'N/A',
                        textContent: item.textContent || ''
                    });
                }
                count++;
                if (count % 5 === 0 || count === loadedItems.length) {
                    console.log(`Imported ${count} / ${loadedItems.length} items...`);
                }
            }
            console.log(`All ${loadedItems.length} items imported.`);
        }
        if (_afterItemChangeCallback) await _afterItemChangeCallback();
        showLoadingIndicator(false);
        event.target.value = '';
        console.log("Museum state loaded successfully.");
        // --- Ensure screen updates after load ---
        if (typeof ItemManager.sortAndDisplayItems === 'function') {
            await ItemManager.sortAndDisplayItems();
        }
    } catch (error) {
        console.error("Error loading game state:", error);
        showLoadingIndicator(false);
    }
}

async function saveGameStateToLocalStorage() {
    showLoadingIndicator(true);
    console.log("Saving game state to local storage...");
    // Always get the full settings object
    const settingsToSave = SettingsManager.getSettingsState();
    const itemsToSave = [];
    const currentItems = ItemManager.getAllMuseumItems();
    console.log(`[saveGameStateToLocalStorage] Number of items to save: ${currentItems.length}`);
    for (const item of currentItems) {
        if (item.type === 'image' && item.file) {
            // Save image file to IndexedDB, store only a reference in localStorage
            const imageId = `${item.file.name}_${item.file.lastModified}`;
            await saveImageToDB(imageId, item.file);
            itemsToSave.push({
                type: 'image',
                fileName: item.file.name,
                fileType: item.file.type,
                imageId: imageId,
                date: item.date.toISOString(),
                caption: item.caption,
                location: item.location,
            });
        } else if (item.type === 'text') {
            itemsToSave.push({
                type: 'text',
                fileName: item.file.name,
                fileType: item.file.type || 'text/plain',
                textContent: item.textContent,
                date: item.date.toISOString(),
                caption: item.caption,
                location: item.location,
            });
        }
    }
    const exportData = {
        settings: settingsToSave, // <-- full settings object
        museumItems: itemsToSave,
    };
    try {
        // No base64 encoding, just plain JSON to minimize size
        localStorage.setItem('museumSaveData', JSON.stringify(exportData));
        console.log("Game state saved to local storage.");
    } catch (e) {
        console.error("Error saving to local storage:", e);
    }
    showLoadingIndicator(false);
}

async function loadGameStateFromLocalStorage() {
    showLoadingIndicator(true);
    console.log("Loading game state from local storage...");
    try {
        const jsonString = localStorage.getItem('museumSaveData');
        if (!jsonString) {
            console.warn("No game state found in local storage.");
            showLoadingIndicator(false);
            return;
        }
        const loadedData = JSON.parse(jsonString);
        const { settings, museumItems: loadedItems } = loadedData;
        // Always apply all settings, including minGalleryLength
        if (settings && typeof SettingsManager.setSettingsUI === 'function') {
            SettingsManager.setSettingsUI(settings);
            console.log("Settings restored from local storage.");
        }
        if (typeof ItemManager.clearAllItemsAndSceneObjects === 'function') {
            ItemManager.clearAllItemsAndSceneObjects();
        }
        if (Array.isArray(loadedItems)) {
            let count = 0;
            for (const item of loadedItems) {
                if (item.type === 'image' && item.imageId) {
                    const fileObj = await getImageFromDB(item.imageId);
                    let file = null;
                    let sourceUrl = null;
                    if (fileObj instanceof File || fileObj instanceof Blob) {
                        file = new File([fileObj], item.fileName, { type: item.fileType });
                        sourceUrl = URL.createObjectURL(file);
                    }
                    ItemManager.addItem({
                        file: file || { name: item.fileName, type: item.fileType },
                        date: new Date(item.date),
                        type: 'image',
                        caption: item.caption || '',
                        location: item.location || 'N/A',
                        sourceUrl: sourceUrl
                    });
                } else if (item.type === 'text') {
                    ItemManager.addItem({
                        file: { name: item.fileName, type: item.fileType },
                        date: new Date(item.date),
                        type: 'text',
                        caption: item.caption || '',
                        location: item.location || 'N/A',
                        textContent: item.textContent || ''
                    });
                }
                count++;
            }
            console.log(`All ${loadedItems.length} items imported.`);
        }
        if (_afterItemChangeCallback) await _afterItemChangeCallback();
        showLoadingIndicator(false);
        console.log("Museum state loaded from local storage successfully.");
        // --- Ensure screen updates after load ---

        
        if (typeof ItemManager.sortAndDisplayItems === 'function') {
            await ItemManager.sortAndDisplayItems();
        }
    } catch (error) {
        console.error("Error loading game state from local storage:", error);
        showLoadingIndicator(false);
    }
}



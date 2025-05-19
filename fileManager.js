import { fileToDataURL, parseExifDate, formatGPS, showLoadingIndicator } from './utils.js';
import * as ItemManager from './itemManager.js'; 
import * as SettingsManager from './settingsManager.js'; 
import { applyAllSettings } from './main.js'; 

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

    addItemButton?.addEventListener('click', handleFiles);
    addTextEntryButton?.addEventListener('click', handleAddTextEntry);
    saveToFileButton?.addEventListener('click', saveGameStateToZip);
    loadGameInput?.addEventListener('change', handleLoadGameFile);
    saveToLocalButton?.addEventListener('click', saveGameStateToLocalStorage);
    loadFromLocalButton?.addEventListener('click', loadGameStateFromLocalStorage);
}

async function handleFiles() {
    const files = fileInput.files;
    if (files.length === 0) return;
    showLoadingIndicator(true);
    await Promise.resolve(); 

    const addItemPromises = [];
    for (const file of files) {
        let itemData = {
            file: file, 
            date: new Date(file.lastModified), 
            type: file.type.startsWith('image/') ? 'image' : (file.name.endsWith('.txt') ? 'text' : 'unknown'),
            caption: '',
            location: 'The Museum', 
            id: crypto.randomUUID(), // Unique ID for each item
        };

        if (itemData.type === 'image') {
            try {
                const exifData = await new Promise((resolve) => {
                    if (typeof EXIF === 'undefined' || !EXIF.getData) {
                        resolve({}); 
                        return;
                    }
                    EXIF.getData(file, function() {
                        resolve(EXIF.getAllTags(this));
                    });
                });

                if (exifData?.DateTimeOriginal) itemData.date = parseExifDate(exifData.DateTimeOriginal);
                if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
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
            // itemData.sourceUrl will be created on demand by itemManager or from IndexedDB
        } else if (itemData.type === 'text') {
            itemData.textContent = await file.text();
            if (!itemData.textContent || itemData.textContent.trim() === "") itemData.textContent = "[Empty File]";
            itemData.location = 'N/A'; 
        } else {
            console.warn("Unsupported file type:", file.name);
            continue; 
        }
        addItemPromises.push(ItemManager.addItem(itemData));
    }
    await Promise.all(addItemPromises);
    if (_afterItemChangeCallback) await _afterItemChangeCallback();
    showLoadingIndicator(false);
    fileInput.value = ''; 
}

async function handleAddTextEntry() {
    const textContent = textWriterInput.value.trim();
    if (!textContent) {
        alert("Please write some text before adding.");
        return;
    }
    showLoadingIndicator(true);
    const timestamp = new Date();
    const entryName = `Written Entry - ${timestamp.toISOString().slice(0,19).replace('T',' ')}.txt`;
    
    const itemData = {
        file: { name: entryName, type: 'text/plain', lastModified: timestamp.getTime() }, 
        date: timestamp, 
        type: 'text', 
        caption: '', 
        location: 'N/A', 
        textContent: textContent,
        id: crypto.randomUUID(),
    };
    await ItemManager.addItem(itemData); // Make sure addItem is async if it involves async ops, or await its result
    
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

const DB_NAME = 'museumDB';
const DB_VERSION = 2;
const IMAGE_STORE = 'imagesV2'; // Changed store name to V2 to avoid conflict if schema changed

function openImageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE); // keyPath will be the imageId
            }
        };
        request.onsuccess = function(event) { resolve(event.target.result); };
        request.onerror = function(event) { reject(event.target.error); };
    });
}

async function saveImageToDB(id, file) {
    const db = await openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([IMAGE_STORE], 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.put(file, id); // Use item's unique id as key
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

async function getImageFromDB(id) {
    const db = await openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([IMAGE_STORE], 'readonly');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result); // Returns the File object
        req.onerror = (e) => reject(e.target.error);
    });
}

// Utility: Convert Data URL to File (for loading very old legacy saves if needed)
function dataURLToFile(dataUrl, fileName, fileType) {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error('Invalid Data URL');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Invalid Data URL MIME type');
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], fileName, { type: fileType || mime });
}


async function saveGameStateToZip() {
    showLoadingIndicator(true);
    const zip = new JSZip();
    const manifestItems = [];
    const settingsToSave = SettingsManager.getSettingsState();
    const currentItems = ItemManager.getAllMuseumItems();

    for (const item of currentItems) {
        let manifestItem = {
            id: item.id,
            type: item.type,
            fileName: item.file.name,
            fileType: item.file.type,
            date: item.date.toISOString(),
            caption: item.caption,
            location: item.location,
        };

        if (item.type === 'image' && item.file instanceof File) {
            const imagePath = `images/${item.id}_${item.file.name}`;
            zip.file(imagePath, item.file);
            manifestItem.path = imagePath;
        } else if (item.type === 'text') {
            const textPath = `texts/${item.id}_${item.file.name}`;
            zip.file(textPath, item.textContent || "");
            manifestItem.path = textPath;
            manifestItem.textContent = undefined; // Don't store textContent in manifest if it's in a file
        } else {
            continue; // Skip if item can't be saved
        }
        manifestItems.push(manifestItem);
    }

    const manifest = {
        settings: settingsToSave,
        museumItems: manifestItems,
        version: "1.0.0-zip"
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    
    try {
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `museum_export_${new Date().toISOString().slice(0,10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch (error) {
        console.error("Error generating ZIP:", error);
        alert("Failed to generate ZIP file.");
    }
    showLoadingIndicator(false);
}

async function handleLoadGameFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    showLoadingIndicator(true);

    try {
        ItemManager.clearAllItemsAndSceneObjects(); // Clear existing items

        if (file.name.endsWith('.zip')) {
            const zip = await JSZip.loadAsync(file);
            const manifestText = await zip.file('manifest.json')?.async('string');
            if (!manifestText) throw new Error("manifest.json not found in ZIP.");
            
            const manifest = JSON.parse(manifestText);
            const { settings, museumItems: manifestItems } = manifest;

            if (settings) await applyAllSettings(settings);

            for (const itemEntry of manifestItems) {
                let itemData = { ...itemEntry, date: new Date(itemEntry.date) };
                delete itemData.path; // Not needed for ItemManager item

                if (itemEntry.type === 'image' && itemEntry.path) {
                    const imageFile = zip.file(itemEntry.path);
                    if (!imageFile) {
                        console.warn(`Image file ${itemEntry.path} not found in ZIP for item ${itemEntry.id}`);
                        continue;
                    }
                    const blob = await imageFile.async('blob');
                    itemData.file = new File([blob], itemEntry.fileName, { type: itemEntry.fileType });
                } else if (itemEntry.type === 'text' && itemEntry.path) {
                    const textFile = zip.file(itemEntry.path);
                     if (!textFile) {
                        console.warn(`Text file ${itemEntry.path} not found in ZIP for item ${itemEntry.id}`);
                        continue;
                    }
                    itemData.textContent = await textFile.async('string');
                    itemData.file = { name: itemEntry.fileName, type: itemEntry.fileType, lastModified: new Date(itemEntry.date).getTime() };
                } else {
                    console.warn("Unknown item type or missing path in manifest:", itemEntry);
                    continue;
                }
                await ItemManager.addItem(itemData);
            }
        } else { // Fallback for old JSON or LZ-JSON files
            const fileText = await file.text();
            let jsonString;
            try {
                jsonString = LZString.decompressFromBase64(fileText);
                if (!jsonString) throw new Error('Not LZString compressed or failed decompress');
            } catch (e) {
                jsonString = fileText; // Assume plain JSON
            }
            const loadedData = JSON.parse(jsonString);
            const { settings, museumItems: loadedItems } = loadedData;
            
            if (settings) await applyAllSettings(settings);

            if (Array.isArray(loadedItems)) {
                for (const item of loadedItems) {
                    const itemData = {
                        ...item,
                        date: new Date(item.date),
                        id: item.id || crypto.randomUUID(), // Ensure ID for older saves
                    };
                    if (item.type === 'image' && item.dataUrl) { // Legacy format with dataURL
                        try {
                            itemData.file = dataURLToFile(item.dataUrl, item.fileName, item.fileType);
                        } catch (e) {
                            console.warn("Failed to convert dataURL to file for old save:", item.fileName, e);
                            itemData.file = { name: item.fileName, type: item.fileType }; // Placeholder file
                        }
                        delete itemData.dataUrl; // Remove dataUrl after converting
                    } else if (item.type === 'text') {
                         itemData.file = { name: item.fileName, type: item.fileType, lastModified: new Date(item.date).getTime() };
                    }
                    await ItemManager.addItem(itemData);
                }
            }
        }
        
        if (_afterItemChangeCallback) await _afterItemChangeCallback();
        console.log("Museum state loaded successfully.");

    } catch (error) {
        console.error("Error loading game state:", error);
        alert("Failed to load museum state: " + error.message);
    } finally {
        showLoadingIndicator(false);
        event.target.value = ''; // Reset file input
    }
}

async function saveGameStateToLocalStorage() {
    showLoadingIndicator(true);
    const settingsToSave = SettingsManager.getSettingsState();
    const itemsToSave = [];
    const currentItems = ItemManager.getAllMuseumItems();

    for (const item of currentItems) {
        let storableItem = {
            id: item.id,
            type: item.type,
            fileName: item.file.name,
            fileType: item.file.type,
            date: item.date.toISOString(),
            caption: item.caption,
            location: item.location,
        };

        if (item.type === 'image' && item.file instanceof File) {
            try {
                await saveImageToDB(item.id, item.file); // Use item.id as key for IndexedDB
                storableItem.hasFileInDB = true;
            } catch (e) {
                console.error("Error saving image to IndexedDB:", item.file.name, e);
                alert(`Failed to save image ${item.file.name} to local DB. It might not be available on next load.`);
                storableItem.hasFileInDB = false;
            }
        } else if (item.type === 'text') {
            storableItem.textContent = item.textContent;
        } else {
            continue;
        }
        itemsToSave.push(storableItem);
    }

    const exportData = {
        settings: settingsToSave,
        museumItems: itemsToSave,
        version: "1.0.0-localStorage"
    };

    try {
        localStorage.setItem('museumSaveData', JSON.stringify(exportData));
        console.log("Game state saved to local storage.");
        alert("Museum saved to local storage!");
    } catch (e) {
        console.error("Error saving to local storage:", e);
        alert("Failed to save to local storage. It might be full.");
    }
    showLoadingIndicator(false);
}

async function loadGameStateFromLocalStorage() {
    showLoadingIndicator(true);
    try {
        const jsonString = localStorage.getItem('museumSaveData');
        if (!jsonString) {
            console.warn("No game state found in local storage.");
            alert("No saved museum found in local storage.");
            showLoadingIndicator(false);
            return;
        }
        const loadedData = JSON.parse(jsonString);
        const { settings, museumItems: loadedItems } = loadedData;

        ItemManager.clearAllItemsAndSceneObjects();

        if (settings) await applyAllSettings(settings);

        if (Array.isArray(loadedItems)) {
            for (const itemEntry of loadedItems) {
                let itemData = { ...itemEntry, date: new Date(itemEntry.date) };
                
                if (itemEntry.type === 'image' && itemEntry.hasFileInDB) {
                    try {
                        const fileFromDB = await getImageFromDB(itemEntry.id);
                        if (fileFromDB instanceof File) {
                            itemData.file = fileFromDB;
                        } else {
                             console.warn(`Image file for item ${itemEntry.id} not found or invalid in IndexedDB.`);
                             itemData.file = { name: itemEntry.fileName, type: itemEntry.fileType }; // Placeholder
                        }
                    } catch (e) {
                         console.error(`Error loading image ${itemEntry.id} from IndexedDB:`, e);
                         itemData.file = { name: itemEntry.fileName, type: itemEntry.fileType }; // Placeholder
                    }
                } else if (itemEntry.type === 'text') {
                    itemData.file = { name: itemEntry.fileName, type: itemEntry.fileType, lastModified: new Date(itemEntry.date).getTime() };
                    // textContent is already in itemData from itemEntry
                } else if (itemEntry.type === 'image' && !itemEntry.hasFileInDB) {
                    console.warn(`Image item ${itemEntry.id} was saved without a file in DB. Skipping file part.`);
                    itemData.file = { name: itemEntry.fileName, type: itemEntry.fileType }; // Placeholder
                } else {
                    console.warn("Unknown item type or missing data in local storage item:", itemEntry);
                    continue;
                }
                delete itemData.hasFileInDB;
                await ItemManager.addItem(itemData);
            }
        }
        
        if (_afterItemChangeCallback) await _afterItemChangeCallback();
        console.log("Museum state loaded from local storage successfully.");
        alert("Museum loaded from local storage!");

    } catch (error) {
        console.error("Error loading game state from local storage:", error);
        alert("Failed to load museum from local storage: " + error.message);
        ItemManager.clearAllItemsAndSceneObjects(); // Clear partially loaded items on error
        if (_afterItemChangeCallback) await _afterItemChangeCallback(); // Refresh to empty state
    } finally {
        showLoadingIndicator(false);
    }
}
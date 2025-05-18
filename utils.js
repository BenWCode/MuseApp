// Helper for createTextCanvas to wrap text
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
    const words = text.split(' ');
    let currentLine = '';
    let startY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = currentLine + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(currentLine.trim(), x, startY);
            currentLine = words[n] + ' ';
            startY += lineHeight;
        } else {
            currentLine = testLine;
        }
        if (maxHeight && startY >= maxHeight) { // Check against maxHeight if provided
             ctx.fillText(currentLine.trim() + (n < words.length -1 ? '...' : ''), x, startY); // Add ellipsis if truncated
             return startY + lineHeight; // Indicate overflow
        }
    }
    ctx.fillText(currentLine.trim(), x, startY);
    return startY + lineHeight; // Return new Y position
}

export function createTextCanvas(text, canvasWidth, canvasHeight, title) {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Background and border
    ctx.fillStyle = 'rgba(240, 240, 230, 0.9)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 10; // Border thickness
    ctx.strokeRect(0,0, canvasWidth, canvasHeight);

    // Title
    ctx.fillStyle = '#333333';
    const titleMargin = 60;
    const titleFontSize = Math.min(48, canvasWidth / 15); // Responsive font size
    ctx.font = `bold ${titleFontSize}px Arial`;
    ctx.textAlign = 'center';
    // Wrap title if too long
    wrapText(ctx, title, canvasWidth/2, titleMargin, canvasWidth - 80, titleFontSize * 1.2);
    ctx.textAlign = 'left'; // Reset for main text

    // Main text
    const mainTextFontSize = Math.min(28, canvasWidth / 30);
    ctx.font = `${mainTextFontSize}px Arial`;
    const lineHeight = mainTextFontSize * 1.3;
    const padding = 40;
    let yPos = titleMargin + titleFontSize * 1.5; // Initial Y pos below title
    
    if (typeof text !== 'string') {
        text = String(text); // Ensure text is a string
    }
    const lines = text.split('\n');

    for (const line of lines) {
        yPos = wrapText(ctx, line, padding, yPos, canvasWidth - 2 * padding, lineHeight, canvasHeight - padding * 0.5);
        if (yPos >= canvasHeight - padding * 0.5) break; // Stop if overflowing
    }
    return canvas;
}


export function createInfoTextCanvas(text, canvasWidth, canvasHeight, bgColor = 'rgba(40, 40, 50, 0.8)') {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#FFFFFF'; // White text
    const fontSize = Math.min(24, canvasHeight / 5, canvasWidth / 15); // Responsive font size
    ctx.font = `${fontSize}px Arial`;
    const lineHeight = fontSize * 1.25;
    const padding = 20;
    let yPos = padding + fontSize * 0.75; // Start Y for text

    const lines = text.split('\n');
    for (const line of lines) {
        let currentLine = '';
        const words = line.split(' ');
        for(const word of words) {
            const testLine = currentLine + word + ' ';
            if (ctx.measureText(testLine).width > canvasWidth - 2 * padding && currentLine !== '') {
                ctx.fillText(currentLine.trim(), padding, yPos);
                currentLine = word + ' ';
                yPos += lineHeight;
                 if (yPos > canvasHeight - padding * 0.25) break;
            } else {
                currentLine = testLine;
            }
        }
        if (yPos <= canvasHeight - padding * 0.25) {
            ctx.fillText(currentLine.trim(), padding, yPos);
        } else {
            const lastLineText = currentLine.trim();
            if (lastLineText) ctx.fillText(lastLineText.substring(0, Math.floor((canvasWidth - 2 * padding) / (fontSize*0.6))) + "...", padding, yPos);
            break;
        }
        yPos += lineHeight;
        if (yPos > canvasHeight - padding * 0.25) break;
    }
    return canvas;
}

export function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function parseExifDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return new Date();
    const parts = dateString.split(' ');
    if (parts.length < 2) return new Date(); 
    const dateParts = parts[0].split(':');
    const timeParts = parts[1].split(':');
    if (dateParts.length < 3 || timeParts.length < 3) return new Date(); 
    return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
}

export function formatGPS(gpsData, ref) {
    if (!gpsData || !Array.isArray(gpsData) || gpsData.length !== 3) return "N/A";
    for(let i=0; i<3; i++){
        if (typeof gpsData[i] === 'number') continue; 
        if (typeof gpsData[i] !== 'object' || gpsData[i] === null || typeof gpsData[i].numerator !== 'number' || typeof gpsData[i].denominator !== 'number' || gpsData[i].denominator === 0) return "N/A";
    }

    let degrees = (typeof gpsData[0] === 'number') ? gpsData[0] : gpsData[0].numerator / gpsData[0].denominator;
    let minutes = (typeof gpsData[1] === 'number') ? gpsData[1] : gpsData[1].numerator / gpsData[1].denominator;
    let seconds = (typeof gpsData[2] === 'number') ? gpsData[2] : gpsData[2].numerator / gpsData[2].denominator;
    
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    if (ref === 'S' || ref === 'W') {
        decimal *= -1;
    }
    return decimal.toFixed(5);
}

export function showLoadingIndicator(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'block' : 'none';
    }
}
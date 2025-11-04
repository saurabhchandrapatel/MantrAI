const { ipcMain } = require('electron');
const ocrService = require('../../utils/ocrService');
const ttsService = require('../../utils/ttsService');

// Create OCR tool
const createOCRTool = () => ({
    name: 'ocr_tool',
    description: 'Performs OCR on images to extract text',
    async handler({ imagePath }) {
        try {
            const text = await ocrService.recognizeText(imagePath);
            return { success: true, text };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// Create TTS tool
const createTTSTool = () => ({
    name: 'tts_tool',
    description: 'Converts text to speech using system TTS',
    async handler({ text, voice }) {
        try {
            await ttsService.speak(text, voice);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// IPC setup (safe, idempotent)
const setupVisionTools = () => {
    if (process.type === 'renderer' || !ipcMain) return;

    const registered = ipcMain.eventNames();

    // ✅ Prevent duplicates safely
    if (registered.includes('ocr_tool') || registered.includes('tts_tool')) {
        console.log('[visionTools] IPC handlers already registered — skipping.');
        return;
    }

    // OCR handler
    ipcMain.handle('ocr_tool', async (event, { imagePath }) => {
        const tool = createOCRTool();
        return await tool.handler({ imagePath });
    });

    // TTS handler
    ipcMain.handle('tts_tool', async (event, { text, voice }) => {
        const tool = createTTSTool();
        return await tool.handler({ text, voice });
    });

    console.log('[visionTools] IPC handlers registered successfully.');
};

module.exports = {
    createOCRTool,
    createTTSTool,
    setupVisionTools
};

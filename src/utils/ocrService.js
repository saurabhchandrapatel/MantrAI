const { createWorker } = require('tesseract.js');

class OCRService {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        
        this.worker = await createWorker();
        // Load English language data
        await this.worker.loadLanguage('eng');
        await this.worker.initialize('eng');
        this.isInitialized = true;
    }

    async recognizeText(imagePath) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const { data: { text } } = await this.worker.recognize(imagePath);
            return text;
        } catch (error) {
            console.error('OCR Error:', error);
            throw new Error('Failed to perform OCR: ' + error.message);
        }
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.isInitialized = false;
        }
    }
}

module.exports = new OCRService();
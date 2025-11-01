/**
 * screenContext.js
 * ----------------------------------------
 * Gathers current screen context for the AI assistant.
 * Includes active window details, clipboard text,
 * and optional screenshot OCR.
 * ----------------------------------------
 */

const activeWin = require('active-win');
const { clipboard } = require('electron');
const screenshot = require('screenshot-desktop');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), 'floating-ai');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**
 * Get current screen context
 * @param {boolean} withOCR - whether to include OCR text from a screenshot
 * @returns {Promise<object>}
 */
async function getScreenContext(withOCR = false) {
  const context = {
    timestamp: new Date().toISOString(),
    window: null,
    clipboardText: null,
    ocrText: null,
  };

  try {
    // 1️⃣ Active window
    const win = await activeWin();
    if (win) {
      context.window = {
        title: win.title,
        app: win.owner.name,
        path: win.owner.path,
      };
    }

    // 2️⃣ Clipboard content
    const clip = clipboard.readText().trim();
    if (clip) {
      context.clipboardText = clip.slice(0, 1000); // limit to 1k chars
    }

    // 3️⃣ Optional screenshot + OCR
    if (withOCR) {
      const imagePath = path.join(TEMP_DIR, 'screen.png');
      const img = await screenshot({ format: 'png' });
      fs.writeFileSync(imagePath, img);
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
      context.ocrText = text.slice(0, 2000); // limit size
    }

  } catch (err) {
    console.error('⚠️ Screen context error:', err);
  }

  return context;
}

/**
 * Build a text summary prompt for the LLM.
 * Converts structured screen info into a readable description.
 */
function formatContextForLLM(context) {
  let prompt = `You are an assistant with awareness of the user's screen.\n\n`;

  if (context.window)
    prompt += `Active window: ${context.window.app} — "${context.window.title}"\n`;

  if (context.clipboardText)
    prompt += `Clipboard text:\n${context.clipboardText}\n\n`;

  if (context.ocrText)
    prompt += `Visible screen text (OCR):\n${context.ocrText}\n\n`;

  return prompt.trim();
}

module.exports = {
  getScreenContext,
  formatContextForLLM,
};

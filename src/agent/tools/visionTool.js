const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require("electron");
const { getScreenContext } = require("../../utils/screenContext");
const isRenderer = process.type === "renderer";

/* -------------------- IPC Tool Factory -------------------- */
function createIPCTool(name, description, schema, handler) {
    if (!isRenderer && ipcMain) {
        ipcMain.handle(`tool:${name}`, async (event, args) => {
            try {
                const res = await handler(args);
                return { success: true, result: res };
            } catch (err) {
                console.error(`tool:${name} error`, err);
                return { success: false, error: err.message };
            }
        });
    }

    return new DynamicStructuredTool({
        name,
        description,
        schema,
        func: async (args) => {
            if (isRenderer && ipcRenderer) {
                const reply = await ipcRenderer.invoke(`tool:${name}`, args);
                if (!reply) throw new Error("No IPC reply");
                if (reply.success) return reply.result;
                throw new Error(reply.error);
            }
            return await handler(args);
        },
    });
}

/* -------------------- Vision Actions -------------------- */
async function analyzeScreen(ocr = false) {
    const context = await getScreenContext(ocr);
    return context;
}

/* -------------------- Handler -------------------- */
const visionSchema = z.object({
    action: z.enum(["analyze_screen"]),
    ocr: z.boolean().optional().describe("Whether to perform OCR on the screen")
});

async function handleVision({ action, ocr }) {
    switch (action) {
        case "analyze_screen":
            return await analyzeScreen(ocr);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

const visionTool = createIPCTool(
    "vision_tool",
    "Analyze the screen content. Can return active window info, clipboard text, and optional OCR text of the visible screen.",
    visionSchema,
    handleVision
);

module.exports = { visionTool };

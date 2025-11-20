const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require("electron");
const say = require("say");
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

/* -------------------- Audio Actions -------------------- */
async function speak(text) {
    return new Promise((resolve, reject) => {
        say.speak(text, null, 1.0, (err) => {
            if (err) reject(err);
            else resolve(`Spoke: "${text}"`);
        });
    });
}

/* -------------------- Handler -------------------- */
const audioSchema = z.object({
    action: z.enum(["speak"]),
    text: z.string().describe("Text to speak")
});

async function handleAudio({ action, text }) {
    switch (action) {
        case "speak":
            if (!text) throw new Error("Text is required");
            return await speak(text);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

const audioTool = createIPCTool(
    "audio_tool",
    "Audio output tool. Can speak text using system TTS.",
    audioSchema,
    handleAudio
);

module.exports = { audioTool };

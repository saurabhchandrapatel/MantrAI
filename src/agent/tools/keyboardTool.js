const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require("electron");
const { keyboard, Key } = require("@nut-tree-fork/nut-js");
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

/* -------------------- Keyboard Actions -------------------- */
async function typeText(text) {
    await keyboard.type(text);
    return `Typed: "${text}"`;
}

async function pressKey(keyName, modifiers = []) {
    const key = Key[keyName];
    if (!key) throw new Error(`Invalid key: ${keyName}`);

    const mods = modifiers.map(m => Key[m]).filter(Boolean);

    // Press modifiers
    for (const mod of mods) await keyboard.pressKey(mod);

    // Press main key
    await keyboard.pressKey(key);
    await keyboard.releaseKey(key);

    // Release modifiers in reverse
    for (let i = mods.length - 1; i >= 0; i--) await keyboard.releaseKey(mods[i]);

    return `Pressed ${modifiers.join('+')}${modifiers.length ? '+' : ''}${keyName}`;
}

async function selectAll() {
    await keyboard.pressKey(Key.LeftControl);
    await keyboard.pressKey(Key.A);
    await keyboard.releaseKey(Key.A);
    await keyboard.releaseKey(Key.LeftControl);
    return "Selected all text";
}

async function copy() {
    await keyboard.pressKey(Key.LeftControl);
    await keyboard.pressKey(Key.C);
    await keyboard.releaseKey(Key.C);
    await keyboard.releaseKey(Key.LeftControl);
    return "Copied selection";
}

async function paste() {
    await keyboard.pressKey(Key.LeftControl);
    await keyboard.pressKey(Key.V);
    await keyboard.releaseKey(Key.V);
    await keyboard.releaseKey(Key.LeftControl);
    return "Pasted content";
}

/* -------------------- Handler -------------------- */
const keyboardSchema = z.object({
    action: z.enum(["type", "press", "selectAll", "copy", "paste"]),
    text: z.string().optional().describe("Text to type"),
    key: z.string().optional().describe("Key name (e.g. 'A', 'Enter', 'Tab')"),
    modifiers: z.array(z.string()).optional().describe("Modifier keys (e.g. ['LeftControl', 'LeftShift'])")
});

async function handleKeyboard({ action, text, key, modifiers }) {
    switch (action) {
        case "type":
            if (!text) throw new Error("Text is required for type action");
            return await typeText(text);
        case "press":
            if (!key) throw new Error("Key is required for press action");
            return await pressKey(key, modifiers || []);
        case "selectAll":
            return await selectAll();
        case "copy":
            return await copy();
        case "paste":
            return await paste();
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

const keyboardTool = createIPCTool(
    "keyboard_tool",
    "Perform keyboard actions: type text, press keys (with modifiers), select all, copy, paste.",
    keyboardSchema,
    handleKeyboard
);

module.exports = { keyboardTool };

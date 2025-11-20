const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer, shell, clipboard } = require("electron");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
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

/* -------------------- System Actions -------------------- */
async function openUrl(url) {
    await shell.openExternal(url);
    return `Opened URL: ${url}`;
}

async function setVolume(action) {
    // action: 'up', 'down', 'mute'
    let key = "";
    if (action === "up") key = String.fromCharCode(175);
    else if (action === "down") key = String.fromCharCode(174);
    else if (action === "mute") key = String.fromCharCode(173);
    else throw new Error("Invalid volume action");

    const cmd = `powershell -c "(New-Object -ComObject WScript.Shell).SendKeys('${key}')"`;
    return new Promise((resolve, reject) => {
        exec(cmd, (err) => {
            if (err) reject(err);
            else resolve(`Volume ${action}`);
        });
    });
}

async function switchWindow(title) {
    const cmd = `powershell -c "(New-Object -ComObject WScript.Shell).AppActivate('${title}')"`;
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) reject(err);
            else resolve(`Switched to window matching: ${title}`);
        });
    });
}

async function fileOperation(op, filePath, content = "") {
    switch (op) {
        case "read":
            if (!fs.existsSync(filePath)) throw new Error("File not found");
            return fs.readFileSync(filePath, "utf-8");
        case "write":
            fs.writeFileSync(filePath, content, "utf-8");
            return `Wrote to ${filePath}`;
        case "append":
            fs.appendFileSync(filePath, content, "utf-8");
            return `Appended to ${filePath}`;
        case "delete":
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return `Deleted ${filePath}`;
            }
            return "File not found";
        case "list":
            if (!fs.existsSync(filePath)) throw new Error("Directory not found");
            return fs.readdirSync(filePath).join(", ");
        case "mkdir":
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(filePath, { recursive: true });
                return `Created directory ${filePath}`;
            }
            return "Directory already exists";
        default:
            throw new Error("Unknown file operation");
    }
}

/* -------------------- Handler -------------------- */
const systemSchema = z.object({
    action: z.enum(["open_url", "volume", "switch_window", "file_op"]),
    url: z.string().optional(),
    volumeAction: z.enum(["up", "down", "mute"]).optional(),
    windowTitle: z.string().optional(),
    fileOp: z.enum(["read", "write", "append", "delete", "list", "mkdir"]).optional(),
    path: z.string().optional(),
    content: z.string().optional()
});

async function handleSystem({ action, url, volumeAction, windowTitle, fileOp, path, content }) {
    switch (action) {
        case "open_url":
            if (!url) throw new Error("URL required");
            return await openUrl(url);
        case "volume":
            if (!volumeAction) throw new Error("Volume action required");
            return await setVolume(volumeAction);
        case "switch_window":
            if (!windowTitle) throw new Error("Window title required");
            return await switchWindow(windowTitle);
        case "file_op":
            if (!fileOp || !path) throw new Error("File operation and path required");
            return await fileOperation(fileOp, path, content);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

const systemTool = createIPCTool(
    "system_tool",
    "Perform system actions: open URL, control volume, switch windows, file operations (read/write/delete/list).",
    systemSchema,
    handleSystem
);

module.exports = { systemTool };

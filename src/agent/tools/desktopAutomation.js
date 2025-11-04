// src/agent/tools/desktopAutomation.js
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer, shell, clipboard } = require("electron");
const isRenderer = process.type === "renderer";
const { mouse, keyboard, Key, Point, Button, straightTo } = require("@nut-tree-fork/nut-js");
const { exec } = require("child_process");
const appProfiles = require("../profiles/appProfiles.json");

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

/* -------------------- Utility Functions -------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openApp(appName) {
  try {
    const name = String(appName || "").toLowerCase();
    const profile = appProfiles[name];
    const cmd = profile && profile.open ? profile.open : appName;
    return await new Promise((resolve, reject) => {
      exec(`start "" "${cmd}"`, (err) => (err ? reject(err) : resolve(`Opened ${cmd}`)));
    });
  } catch (err) {
    throw err;
  }
}

async function closeApp(appName) {
  return new Promise((resolve, reject) => {
    exec(`taskkill /IM "${appName}.exe" /F`, (err) =>
      err ? reject(err) : resolve(`Closed ${appName}`)
    );
  });
}

async function typeText(text) {
  await keyboard.type(text);
}

async function saveFile(filename) {
  // Try to detect focused app via appProfiles (best-effort). If a profile defines a save_as sequence, use it.
  try {
    // no reliable way to know focused app here; caller may pass filename only. We'll attempt a generic flow
    // Press Ctrl+S by default (most apps use it)
    await keyboard.pressKey(Key.LeftControl, Key.S);
    await keyboard.releaseKey(Key.LeftControl, Key.S);
    await sleep(500);

    // If a save-as sequence is needed, caller can first call open_app with that app and then call save_file; for now type filename and Enter
    if (filename) {
      await keyboard.type(filename);
      await keyboard.pressKey(Key.Enter);
      await keyboard.releaseKey(Key.Enter);
    }
  } catch (err) {
    throw err;
  }
}

/* -------------------- Helpers: key combos and profiles -------------------- */
function mapKeyName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  if (n === 'ctrl' || n === 'control') return Key.LeftControl;
  if (n === 'shift') return Key.LeftShift;
  if (n === 'alt') return Key.LeftAlt;
  if (n === 'enter' || n === 'return') return Key.Enter;
  // letters and digits
  const upper = String(name).toUpperCase();
  if (Key[upper]) return Key[upper];
  return null;
}

async function pressCombo(keys = []) {
  // keys: array like ["Ctrl","Shift","S"]
  const mapped = keys.map(mapKeyName).filter(Boolean);
  try {
    // press all
    for (const k of mapped) await keyboard.pressKey(k);
    // release in reverse
    for (let i = mapped.length - 1; i >= 0; i--) await keyboard.releaseKey(mapped[i]);
    return `Pressed combo ${keys.join('+')}`;
  } catch (err) {
    throw err;
  }
}

async function drawShape(shape, size = 100) {
  const start = await mouse.getPosition();
  if (shape === "circle") {
    const steps = 60;
    await mouse.pressButton(Button.LEFT);
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = start.x + size * Math.cos(angle);
      const y = start.y + size * Math.sin(angle);
      await mouse.move(straightTo(new Point(x, y)));
    }
    await mouse.releaseButton(Button.LEFT);
    return `Drew a circle of radius ${size}`;
  }
  if (shape === "square") {
    await mouse.pressButton(Button.LEFT);
    await mouse.move(straightTo(new Point(start.x + size, start.y)));
    await mouse.move(straightTo(new Point(start.x + size, start.y + size)));
    await mouse.move(straightTo(new Point(start.x, start.y + size)));
    await mouse.move(straightTo(new Point(start.x, start.y)));
    await mouse.releaseButton(Button.LEFT);
    return `Drew a square of size ${size}`;
  }
  if (shape === "line") {
    await mouse.pressButton(Button.LEFT);
    await mouse.move(straightTo(new Point(start.x + size, start.y)));
    await mouse.releaseButton(Button.LEFT);
    return `Drew a line of length ${size}`;
  }
  return `Unknown shape: ${shape}`;
}

/* -------------------- NEW: Copy & Paste + Clipboard helpers -------------------- */
async function copySelection() {
  await keyboard.pressKey(Key.LeftControl, Key.C);
  await keyboard.releaseKey(Key.LeftControl, Key.C);
  await sleep(200);
  try {
    const content = clipboard.readText();
    return { message: 'Copied selection', content };
  } catch (err) {
    return { message: 'Copied selection (clipboard read failed)', error: String(err.message) };
  }
}

async function pasteClipboard() {
  await keyboard.pressKey(Key.LeftControl, Key.V);
  await keyboard.releaseKey(Key.LeftControl, Key.V);
  return { message: "Pasted clipboard content" };
}

async function readClipboard() {
  try {
    return clipboard.readText();
  } catch (err) {
    throw new Error('Failed to read clipboard: ' + String(err.message));
  }
}

async function writeClipboard(text) {
  try {
    clipboard.writeText(String(text || ''));
    return `Wrote to clipboard (${String(text || '').slice(0, 100)})`;
  } catch (err) {
    throw new Error('Failed to write clipboard: ' + String(err.message));
  }
}

/* -------------------- Schema -------------------- */
const desktopSchema = z.object({
  action: z.enum([
    "open_app",
    "close_app",
    "type_text",
    "copy",
    "paste",
    "draw_shape",
    "click",
    "move_mouse",
    "save_file",
    "press_key",
    "run_command",
    "read_clipboard",
    "write_clipboard"
  ]),
  app: z.string().optional(),
  text: z.string().optional(),
  shape: z.enum(["circle", "square", "line"]).optional(),
  size: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  key: z.string().optional(),
  command: z.string().optional(),
  filename: z.string().optional()
});

/* -------------------- Handler -------------------- */
async function handleDesktopAutomation({
  action,
  app,
  text,
  shape,
  size,
  x,
  y,
  key,
  command,
  filename
}) {
  switch (action) {
    case "open_app":
      return await openApp(app);

    case "close_app":
      return await closeApp(app);

    case "type_text":
      await typeText(text);
      return `Typed text: "${text}"`;

    case "copy":
      return await copySelection();

    case "paste":
      return await pasteClipboard();

    case "draw_shape":
      return await drawShape(shape, size);

    case "click":
      await mouse.click(Button.LEFT);
      return "Mouse clicked";

    case "move_mouse":
      await mouse.move(straightTo(new Point(x, y)));
      return `Mouse moved to (${x}, ${y})`;

    case "press_key":
      await keyboard.pressKey(Key[key]);
      await keyboard.releaseKey(Key[key]);
      return `Pressed ${key}`;

    case "save_file":
      await saveFile(filename || "Untitled.txt");
      return `Saved file as ${filename}`;

    case "read_clipboard":
      return await readClipboard();

    case "write_clipboard":
      return await writeClipboard(text || "");

    case "run_command":
      return await new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
          if (err) reject(stderr || err.message);
          else resolve(stdout.trim());
        });
      });

    default:
      return `Unknown action: ${action}`;
  }
}
/* -------------------- Generic Desktop Tool -------------------- */
const desktopAutomationTool = createIPCTool(
  "desktop_automation",
  "Perform generic desktop automation: open/close apps, type, copy, paste, draw, click, move mouse, or run commands using nut-js.",
  desktopSchema,
  handleDesktopAutomation
);

module.exports = { desktopAutomationTool };

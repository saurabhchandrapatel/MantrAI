const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require("electron");
const { mouse, Button, Point, straightTo } = require("@nut-tree-fork/nut-js");
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

/* -------------------- Mouse Actions -------------------- */
async function moveMouse(x, y) {
    await mouse.move(straightTo(new Point(x, y)));
    return `Moved mouse to (${x}, ${y})`;
}

async function click(button = "left", double = false) {
    const btn = button === "right" ? Button.RIGHT : (button === "middle" ? Button.MIDDLE : Button.LEFT);
    if (double) {
        await mouse.doubleClick(btn);
        return `Double clicked ${button} button`;
    } else {
        await mouse.click(btn);
        return `Clicked ${button} button`;
    }
}

async function dragAndDrop(startX, startY, endX, endY) {
    await mouse.move(straightTo(new Point(startX, startY)));
    await mouse.pressButton(Button.LEFT);
    await mouse.move(straightTo(new Point(endX, endY)));
    await mouse.releaseButton(Button.LEFT);
    return `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`;
}

async function scroll(amount, direction = "down") {
    if (direction === "down") {
        await mouse.scrollDown(amount);
    } else if (direction === "up") {
        await mouse.scrollUp(amount);
    } else if (direction === "left") {
        await mouse.scrollLeft(amount);
    } else if (direction === "right") {
        await mouse.scrollRight(amount);
    }
    return `Scrolled ${direction} by ${amount}`;
}

/* -------------------- Handler -------------------- */
const mouseSchema = z.object({
    action: z.enum(["move", "click", "drag", "scroll"]),
    x: z.number().optional().describe("X coordinate"),
    y: z.number().optional().describe("Y coordinate"),
    startX: z.number().optional(),
    startY: z.number().optional(),
    endX: z.number().optional(),
    endY: z.number().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    double: z.boolean().optional(),
    amount: z.number().optional(),
    direction: z.enum(["up", "down", "left", "right"]).optional()
});

async function handleMouse({ action, x, y, startX, startY, endX, endY, button, double, amount, direction }) {
    switch (action) {
        case "move":
            if (x === undefined || y === undefined) throw new Error("x and y required for move");
            return await moveMouse(x, y);
        case "click":
            return await click(button, double);
        case "drag":
            if (startX === undefined || startY === undefined || endX === undefined || endY === undefined)
                throw new Error("Start and end coordinates required for drag");
            return await dragAndDrop(startX, startY, endX, endY);
        case "scroll":
            return await scroll(amount || 100, direction);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

const mouseTool = createIPCTool(
    "mouse_tool",
    "Perform mouse actions: move, click (left/right/double), drag and drop, scroll.",
    mouseSchema,
    handleMouse
);

module.exports = { mouseTool };

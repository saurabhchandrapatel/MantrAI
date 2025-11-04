const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer, shell } = require("electron");
const isRenderer = process.type === "renderer";
const fs = require("fs");
const path = require("path");

class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.registeredHandlers = new Set();
    }

    createIPCTool(name, { description, schema, handler }) {
        if (!isRenderer && ipcMain) {
            const channel = `tool:${name}`;
            if (!this.registeredHandlers.has(channel)) {
                ipcMain.handle(channel, async (event, args) => {
                    try {
                        const result = await handler(args);
                        return { success: true, result };
                    } catch (err) {
                        console.error(`[${channel}] Error:`, err);
                        return { success: false, error: err.message || String(err) };
                    }
                });
                this.registeredHandlers.add(channel);
                console.log(`[ToolRegistry] Registered IPC: ${channel}`);
            }
        }

        return new DynamicStructuredTool({
            name,
            description,
            schema,
            func: async (args) => {
                if (isRenderer && ipcRenderer) {
                    const reply = await ipcRenderer.invoke(`tool:${name}`, args);
                    if (reply?.success) return reply.result;
                    throw new Error(reply?.error || `Error in ${name}`);
                }
                return await handler(args);
            },
        });
    }

    register(name, config) {
        if (this.tools.has(name)) {
            console.warn(`[ToolRegistry] Skipping duplicate tool: ${name}`);
            return this.tools.get(name);
        }

        const tool = this.createIPCTool(name, config);
        this.tools.set(name, tool);
        console.log(`[ToolRegistry] Registered tool: ${name}`);
        return tool;
    }

    listTools() {
        return Array.from(this.tools.values());
    }
    
    getAll() {
        return Object.values(this.tools).flat().filter(Boolean);
    }

    /**
     * Auto-discovers tools from a given directory
     */
    async discoverToolsFrom(dirPath) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".js"));
        console.log(`🔍 [ToolRegistry] Discovering tools in ${dirPath}`);

        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            if (fullPath.endsWith("tools.js")) continue; // avoid recursion
            try {
                const mod = require(fullPath);

                if (typeof mod === "function") {
                    console.log(`🧩 Loaded function tool from ${file}`);
                    const tool = await mod();
                    if (tool?.name) this.tools.set(tool.name, tool);
                    continue;
                }

                if (Array.isArray(mod.tools)) {
                    console.log(`🧩 Loaded ${mod.tools.length} tools from ${file}`);
                    for (const tool of mod.tools) {
                        if (tool?.name) this.tools.set(tool.name, tool);
                    }
                } else {
                    // if the module exports individual tool objects
                    for (const [key, val] of Object.entries(mod)) {
                        if (val?.name && val?.func) {
                            console.log(`🧩 Loaded tool: ${val.name} from ${file}`);
                            this.tools.set(val.name, val);
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ Error loading ${file}:`, err);
            }
        }
    }
}

// ------------------------------------------------------------------

const registry = new ToolRegistry();



// Auto-discover all tools inside ./tools/
const toolsDir = path.join(__dirname, "tools");
registry.discoverToolsFrom(toolsDir);

// Export all discovered tools
module.exports = {
    registry,
    tools: registry.listTools(),
    
};

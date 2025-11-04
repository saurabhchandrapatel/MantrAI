const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require("electron");
const isRenderer = process.type === "renderer";

function createIPCTool(name, description, schema, handler) {
    // Register ipcMain handler if in main process
    if (!isRenderer && ipcMain) {
        ipcMain.handle(`tool:${name}`, async (event, args) => {
            try {
                const res = await handler(args);
                return { success: true, result: res };
            } catch (err) {
                console.error(`tool:${name} handler error`, err);
                return { success: false, error: (err && err.message) || String(err) };
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
                if (!reply) throw new Error("No response from tool ipc");
                if (reply.success) return reply.result;
                throw new Error(reply.error || "Tool error");
            } else {
                return await handler(args);
            }
        },
    });
}

/* -------------------- navigate_to_url -------------------- */
const navigateToUrlTool = createIPCTool(
    "navigate_to_url",
    "Navigate the Chrome browser to a specific URL. Use this when the user wants to visit a website.",
    z.object({
        url: z.string().describe("The URL to navigate to"),
    }),
    async ({ url }) => {
        try {
            const normalized = String(url || "").trim();
            if (!normalized) throw new Error("Empty URL");

            const { shell } = require("electron");
            const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized);
            const finalUrl = hasProtocol ? normalized : `https://${normalized}`;
            await shell.openExternal(finalUrl);
            return `Opened ${finalUrl}`;
        } catch (err) {
            console.error("navigate_to_url handler error", err);
            throw err;
        }
    }
);

/* -------------------- search_web -------------------- */
const searchWebTool = createIPCTool(
    "search_web",
    "Search the web using Google. Use this when the user wants to search for information online.",
    z.object({
        query: z.string().describe("The search query"),
    }),
    async ({ query }) => {
        try {
            const normalized = String(query || "").trim();
            if (!normalized) throw new Error("Empty search query");

            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(normalized)}`;
            const { shell } = require("electron");
            await shell.openExternal(searchUrl);
            return `Opened Google search for: ${normalized}`;
        } catch (err) {
            console.error("search_web handler error", err);
            throw err;
        }
    }
);

/* -------------------- get_page_info -------------------- */
const getPageInfoTool = createIPCTool(
    "get_page_info",
    "Get information about the current page (title, URL). Use this when the user asks about the current page.",
    z.object({}),
    async () => {
        try {
            const pageInfo = {
                title: "Desktop App",
                url: "app://local",
            };
            return pageInfo;
        } catch (err) {
            console.error("get_page_info handler error", err);
            throw err;
        }
    }
);

/* -------------------- scroll_page -------------------- */
const scrollPageTool = createIPCTool(
    "scroll_page",
    "Scroll the current page up or down. Use this when the user wants to scroll.",
    z.object({
        direction: z.enum(["up", "down"]).describe("Direction to scroll"),
        amount: z.number().default(500).describe("Amount to scroll in pixels"),
    }),
    async ({ direction, amount = 500 }) => {
        try {
            // In a real renderer context, you'd send JS to scroll the webview
            return `Will scroll ${direction} by ${amount} pixels`;
        } catch (err) {
            console.error("scroll_page handler error", err);
            throw err;
        }
    }
);

/* -------------------- bookmark_page -------------------- */
const bookmarkPageTool = createIPCTool(
    "bookmark_page",
    "Save the current page information. Use this when the user wants to bookmark or save the current page.",
    z.object({
        url: z.string().describe("The URL to bookmark"),
        title: z.string().describe("The page title"),
        notes: z.string().optional().describe("Optional notes about the bookmark"),
    }),
    async ({ url, title, notes }) => {
        try {
            const normalizedUrl = String(url || "").trim();
            const normalizedTitle = String(title || "").trim();
            if (!normalizedUrl || !normalizedTitle)
                throw new Error("Missing bookmark data (url/title)");

            const bookmark = {
                url: normalizedUrl,
                title: normalizedTitle,
                notes: notes || "",
                timestamp: new Date().toISOString(),
            };

            // TODO: Persist to DB or file if needed
            console.log("Bookmark saved:", bookmark);
            return `Bookmarked: ${bookmark.title}${notes ? ` with notes: ${notes}` : ""}`;
        } catch (err) {
            console.error("bookmark_page handler error", err);
            throw err;
        }
    }
);

/* -------------------- EXPORT -------------------- */
const chromeTools = [
    navigateToUrlTool,
    searchWebTool,
    getPageInfoTool,
    scrollPageTool,
    bookmarkPageTool,
];

module.exports = { chromeTools };

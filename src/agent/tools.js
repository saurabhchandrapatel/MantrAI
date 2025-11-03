const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { ipcMain, ipcRenderer } = require('electron');

const isRenderer = process.type === 'renderer';

function createIPCTool(name, description, schema, handler) {
    return new DynamicStructuredTool({
        name,
        description,
        schema,
        func: async (args) => {
            if (isRenderer) {
                return await ipcRenderer.invoke(`tool:${name}`, args);
            } else {
                return await handler(args);
            }
        }
    });
}

const navigateToUrlTool = createIPCTool(
    "navigate_to_url",
    "Navigate the Chrome browser to a specific URL. Use this when the user wants to visit a website.",
    z.object({
        url: z.string().describe("The URL to navigate to"),
    }),
    async ({ url }) => {
        // This will be handled by main process
        return `Will open ${url} in a new tab`;
    }
);

const searchWebTool = createIPCTool(
    "search_web",
    "Search the web using Google. Use this when the user wants to search for information online.",
    z.object({
        query: z.string().describe("The search query"),
    }),
    async ({ query }) => {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        return `Will search Google for: ${query}`;
    }
);

const getPageInfoTool = createIPCTool(
    "get_page_info",
    "Get information about the current page (title, URL). Use this when the user asks about the current page.",
    z.object({}),
    async () => {
        return JSON.stringify({
            title: "Desktop App",
            url: "app://local"
        }, null, 2);
    }
);

const scrollPageTool = createIPCTool(
    "scroll_page",
    "Scroll the current page up or down. Use this when the user wants to scroll.",
    z.object({
        direction: z.enum(["up", "down"]).describe("Direction to scroll"),
        amount: z.number().default(500).describe("Amount to scroll in pixels"),
    }),
    async ({ direction, amount = 500 }) => {
        return `Will scroll ${direction} by ${amount} pixels`;
    }
);

const bookmarkPageTool = createIPCTool(
    "bookmark_page",
    "Save the current page information. Use this when the user wants to bookmark or save the current page.",
    z.object({
        url: z.string().describe("The URL to bookmark"),
        title: z.string().describe("The page title"),
        notes: z.string().optional().describe("Optional notes about the bookmark"),
    }),
    async ({ url, title, notes }) => {
        const bookmark = {
            url,
            title,
            timestamp: new Date().toISOString(),
            notes: notes || "",
        };
        // Here we would persist the bookmark in the main process
        return `Bookmarked: ${bookmark.title}${notes ? ` with notes: ${notes}` : ""}`;
    }
);

const chromeTools = [
    navigateToUrlTool,
    searchWebTool,
    getPageInfoTool,
    scrollPageTool,
    bookmarkPageTool,
];

// Export tools
module.exports = { chromeTools };

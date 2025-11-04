const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { shell, ipcMain, ipcRenderer } = require("electron");
const isRenderer = process.type === "renderer";

/**
 * Generic Browser Automation Tools
 * Supports:
 *  - Opening URLs
 *  - Searching Google
 *  - Navigating to a specific site
 *  - Scrolling
 *  - Getting current page info (mock for desktop app)
 */

function createBrowserTools() {
  /* -------------------- open_url -------------------- */
  const openUrlTool = new DynamicStructuredTool({
    name: "browser_open_url",
    description: "Opens a given URL in the system's default browser.",
    schema: z.object({
      url: z.string().describe("The URL to open in the browser."),
    }),
    func: async ({ url }) => {
      try {
        const normalized = String(url).trim();
        if (!normalized) throw new Error("Empty URL provided.");
        const finalUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)
          ? normalized
          : `https://${normalized}`;
        await shell.openExternal(finalUrl);
        return `Opened ${finalUrl} in your default browser.`;
      } catch (err) {
        console.error("[browser_open_url] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- search_web -------------------- */
  const searchWebTool = new DynamicStructuredTool({
    name: "browser_search_web",
    description: "Search the web using Google.",
    schema: z.object({
      query: z.string().describe("The search query."),
    }),
    func: async ({ query }) => {
      try {
        const normalized = String(query).trim();
        if (!normalized) throw new Error("Empty search query.");
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(normalized)}`;
        await shell.openExternal(searchUrl);
        return `Searched Google for: "${normalized}".`;
      } catch (err) {
        console.error("[browser_search_web] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- scroll_page -------------------- */
  const scrollPageTool = new DynamicStructuredTool({
    name: "browser_scroll",
    description:
      "Scrolls the active browser page up or down (simulated if not integrated with a real browser).",
    schema: z.object({
      direction: z.enum(["up", "down"]).describe("Scroll direction."),
      amount: z.number().default(500).describe("Scroll amount in pixels."),
    }),
    func: async ({ direction, amount }) => {
      // Note: In Electron webview integration, you'd inject scroll JavaScript
      return `Scrolling ${direction} by ${amount}px (simulation mode).`;
    },
  });

  /* -------------------- get_page_info -------------------- */
  const getPageInfoTool = new DynamicStructuredTool({
    name: "browser_get_page_info",
    description: "Gets information about the current page (mock data).",
    schema: z.object({}),
    func: async () => {
      // If later integrated with a WebView, this can return real data.
      return {
        title: "Mock Page - Desktop Context",
        url: "app://local",
      };
    },
  });

  /* -------------------- open_new_tab -------------------- */
  const openNewTabTool = new DynamicStructuredTool({
    name: "browser_open_new_tab",
    description: "Opens a new tab (simulated for desktop context).",
    schema: z.object({
      url: z.string().optional().describe("Optional URL to open in new tab."),
    }),
    func: async ({ url }) => {
      const openUrl = url || "about:blank";
      await shell.openExternal(openUrl.startsWith("http") ? openUrl : `https://${openUrl}`);
      return `Opened a new browser tab with ${openUrl}`;
    },
  });

  return [
    openUrlTool,
    searchWebTool,
    scrollPageTool,
    getPageInfoTool,
    openNewTabTool,
  ];
}

/* -------------------- Export -------------------- */
module.exports = {
  tools: createBrowserTools(),
};

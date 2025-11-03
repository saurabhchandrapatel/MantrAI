const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

const navigateToUrlTool = new DynamicStructuredTool({
  name: "navigate_to_url",
  description: "Navigate the Chrome browser to a specific URL. Use this when the user wants to visit a website.",
  schema: z.object({
    url: z.string().describe("The URL to navigate to"),
  }),
  func: async ({ url }) => {
    window.open(url, "_blank");
    return `Successfully opened ${url} in a new tab`;
  },
});

const searchWebTool = new DynamicStructuredTool({
  name: "search_web",
  description: "Search the web using Google. Use this when the user wants to search for information online.",
  schema: z.object({
    query: z.string().describe("The search query"),
  }),
  func: async ({ query }) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(searchUrl, "_blank");
    return `Searching Google for: ${query}`;
  },
});

const getPageInfoTool = new DynamicStructuredTool({
  name: "get_page_info",
  description: "Get information about the current page (title, URL). Use this when the user asks about the current page.",
  schema: z.object({}),
  func: async () => {
    const info = {
      title: document.title,
      url: window.location.href,
    };
    return JSON.stringify(info, null, 2);
  },
});

const scrollPageTool = new DynamicStructuredTool({
  name: "scroll_page",
  description: "Scroll the current page up or down. Use this when the user wants to scroll.",
  schema: z.object({
    direction: z.enum(["up", "down"]).describe("Direction to scroll"),
    amount: z.number().default(500).describe("Amount to scroll in pixels"),
  }),
  func: async ({ direction, amount = 500 }) => {
    const scrollAmount = direction === "down" ? amount : -amount;
    window.scrollBy(0, scrollAmount);
    return `Scrolled ${direction} by ${amount} pixels`;
  },
});

const openNewTabTool = new DynamicStructuredTool({
  name: "open_new_tab",
  description: "Open a new browser tab. Use this when the user wants to open a new tab.",
  schema: z.object({}),
  func: async () => {
    window.open("about:blank", "_blank");
    return "Opened a new tab";
  },
});

const bookmarkPageTool = new DynamicStructuredTool({
  name: "bookmark_page",
  description: "Save the current page information. Use this when the user wants to bookmark or save the current page.",
  schema: z.object({
    notes: z.string().optional().describe("Optional notes about the bookmark"),
  }),
  func: async ({ notes }) => {
    const bookmark = {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      notes: notes || "",
    };

    const bookmarks = JSON.parse(localStorage.getItem("chrome-agent-bookmarks") || "[]");
    bookmarks.push(bookmark);
    localStorage.setItem("chrome-agent-bookmarks", JSON.stringify(bookmarks));

    return `Bookmarked: ${bookmark.title}${notes ? ` with notes: ${notes}` : ""}`;
  },
});

const chromeTools = [
  navigateToUrlTool,
  searchWebTool,
  getPageInfoTool,
  scrollPageTool,
  openNewTabTool,
  bookmarkPageTool,
];

module.exports = { chromeTools };

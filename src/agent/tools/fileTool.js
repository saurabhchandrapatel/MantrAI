const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

/**
 * File System Automation Tools
 * Supports:
 *  - Reading / Writing files
 *  - Listing directory contents
 *  - Deleting / Renaming files
 *  - Creating folders
 *  - Moving / Copying files
 */

function createFileTools() {
  /* -------------------- read_file -------------------- */
  const readFileTool = new DynamicStructuredTool({
    name: "file_read",
    description: "Reads and returns the content of a text file.",
    schema: z.object({
      filePath: z.string().describe("Absolute or relative path of the file."),
    }),
    func: async ({ filePath }) => {
      try {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
        const data = fs.readFileSync(resolved, "utf8");
        return data;
      } catch (err) {
        console.error("[file_read] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- write_file -------------------- */
  const writeFileTool = new DynamicStructuredTool({
    name: "file_write",
    description: "Writes text content to a file, creating it if it doesn’t exist.",
    schema: z.object({
      filePath: z.string().describe("Destination file path."),
      content: z.string().describe("Text content to write."),
      append: z.boolean().optional().default(false).describe("Append to existing file instead of overwriting."),
    }),
    func: async ({ filePath, content, append }) => {
      try {
        const resolved = path.resolve(filePath);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, content, { flag: append ? "a" : "w" });
        return `File written successfully at: ${resolved}`;
      } catch (err) {
        console.error("[file_write] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- delete_file -------------------- */
  const deleteFileTool = new DynamicStructuredTool({
    name: "file_delete",
    description: "Deletes a file from the system.",
    schema: z.object({
      filePath: z.string().describe("Path to the file to delete."),
    }),
    func: async ({ filePath }) => {
      try {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) throw new Error("File not found.");
        fs.unlinkSync(resolved);
        return `Deleted file: ${resolved}`;
      } catch (err) {
        console.error("[file_delete] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- list_files -------------------- */
  const listFilesTool = new DynamicStructuredTool({
    name: "file_list",
    description: "Lists files and directories inside a folder.",
    schema: z.object({
      dirPath: z.string().default(".").describe("Directory to list contents of."),
    }),
    func: async ({ dirPath }) => {
      try {
        const resolved = path.resolve(dirPath);
        if (!fs.existsSync(resolved)) throw new Error("Directory not found.");
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        return entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
      } catch (err) {
        console.error("[file_list] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- rename_file -------------------- */
  const renameFileTool = new DynamicStructuredTool({
    name: "file_rename",
    description: "Renames a file or folder.",
    schema: z.object({
      oldPath: z.string().describe("Existing path."),
      newPath: z.string().describe("New desired path."),
    }),
    func: async ({ oldPath, newPath }) => {
      try {
        const from = path.resolve(oldPath);
        const to = path.resolve(newPath);
        fs.renameSync(from, to);
        return `Renamed from ${from} → ${to}`;
      } catch (err) {
        console.error("[file_rename] Error:", err);
        throw err;
      }
    },
  });

  /* -------------------- move_or_copy_file -------------------- */
  const moveOrCopyTool = new DynamicStructuredTool({
    name: "file_move_copy",
    description: "Moves or copies a file between locations.",
    schema: z.object({
      sourcePath: z.string().describe("Path of the file to move or copy."),
      targetPath: z.string().describe("Destination path."),
      copy: z.boolean().optional().default(false).describe("Set true to copy instead of move."),
    }),
    func: async ({ sourcePath, targetPath, copy }) => {
      try {
        const src = path.resolve(sourcePath);
        const dest = path.resolve(targetPath);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(src)) throw new Error("Source file not found.");
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        if (copy) {
          fs.copyFileSync(src, dest);
          return `Copied ${src} → ${dest}`;
        } else {
          fs.renameSync(src, dest);
          return `Moved ${src} → ${dest}`;
        }
      } catch (err) {
        console.error("[file_move_copy] Error:", err);
        throw err;
      }
    },
  });

  return [
    readFileTool,
    writeFileTool,
    deleteFileTool,
    listFilesTool,
    renameFileTool,
    moveOrCopyTool,
  ];
}

module.exports = {
  tools: createFileTools(),
};

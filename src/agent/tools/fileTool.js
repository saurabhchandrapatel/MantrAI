const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const toolRegistry = require('../toolRegistry'); // assumed path

/**
 * File System Tools
 * Supports:
 *  - Reading / Writing files
 *  - Listing directory contents
 *  - Deleting / Renaming files
 *  - Moving / Copying files
 */

// -------------------- read_file --------------------
const createReadFileTool = () => ({
    name: 'file_read',
    description: 'Reads and returns the content of a text file.',
    schema: z.object({
        filePath: z.string().describe('Absolute or relative path of the file.'),
    }),
    async handler({ filePath }) {
        try {
            const resolved = path.resolve(filePath);
            if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
            const data = fs.readFileSync(resolved, 'utf8');
            return { success: true, content: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- write_file --------------------
const createWriteFileTool = () => ({
    name: 'file_write',
    description: 'Writes text content to a file, creating it if it doesn’t exist.',
    schema: z.object({
        filePath: z.string().describe('Destination file path.'),
        content: z.string().describe('Text content to write.'),
        append: z.boolean().optional().default(false).describe('Append to file instead of overwriting.'),
    }),
    async handler({ filePath, content, append }) {
        try {
            const resolved = path.resolve(filePath);
            const dir = path.dirname(resolved);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(resolved, content, { flag: append ? 'a' : 'w' });
            return { success: true, message: `File written successfully: ${resolved}` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- delete_file --------------------
const createDeleteFileTool = () => ({
    name: 'file_delete',
    description: 'Deletes a file from the system.',
    schema: z.object({
        filePath: z.string().describe('Path to the file to delete.'),
    }),
    async handler({ filePath }) {
        try {
            const resolved = path.resolve(filePath);
            if (!fs.existsSync(resolved)) throw new Error('File not found.');
            fs.unlinkSync(resolved);
            return { success: true, message: `Deleted file: ${resolved}` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- list_files --------------------
const createListFilesTool = () => ({
    name: 'file_list',
    description: 'Lists files and directories inside a folder.',
    schema: z.object({
        dirPath: z.string().default('.').describe('Directory to list contents of.'),
    }),
    async handler({ dirPath }) {
        try {
            const resolved = path.resolve(dirPath);
            if (!fs.existsSync(resolved)) throw new Error('Directory not found.');
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            return {
                success: true,
                items: entries.map(e => ({
                    name: e.name,
                    type: e.isDirectory() ? 'directory' : 'file',
                })),
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- rename_file --------------------
const createRenameFileTool = () => ({
    name: 'file_rename',
    description: 'Renames a file or folder.',
    schema: z.object({
        oldPath: z.string().describe('Existing path.'),
        newPath: z.string().describe('New desired path.'),
    }),
    async handler({ oldPath, newPath }) {
        try {
            const from = path.resolve(oldPath);
            const to = path.resolve(newPath);
            fs.renameSync(from, to);
            return { success: true, message: `Renamed from ${from} → ${to}` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- move_or_copy_file --------------------
const createMoveOrCopyFileTool = () => ({
    name: 'file_move_copy',
    description: 'Moves or copies a file between locations.',
    schema: z.object({
        sourcePath: z.string().describe('Path of the file to move or copy.'),
        targetPath: z.string().describe('Destination path.'),
        copy: z.boolean().optional().default(false).describe('Set true to copy instead of move.'),
    }),
    async handler({ sourcePath, targetPath, copy }) {
        try {
            const src = path.resolve(sourcePath);
            const dest = path.resolve(targetPath);
            const destDir = path.dirname(dest);
            if (!fs.existsSync(src)) throw new Error('Source file not found.');
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            if (copy) {
                fs.copyFileSync(src, dest);
                return { success: true, message: `Copied ${src} → ${dest}` };
            } else {
                fs.renameSync(src, dest);
                return { success: true, message: `Moved ${src} → ${dest}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});

// -------------------- IPC + Auto Registry --------------------
const setupFileTools = () => {
    if (process.type === 'renderer' || !ipcMain) return;

    const registered = ipcMain.eventNames();
    const tools = [
        createReadFileTool(),
        createWriteFileTool(),
        createDeleteFileTool(),
        createListFilesTool(),
        createRenameFileTool(),
        createMoveOrCopyFileTool()
    ];

    for (const tool of tools) {
        if (registered.includes(tool.name)) continue;

        // Register IPC handler
        ipcMain.handle(tool.name, async (event, args) => tool.handler(args));

        // Auto-register to toolRegistry
        if (toolRegistry && typeof toolRegistry.register === 'function') {
            toolRegistry.register(tool);
        }
    }

    console.log('[fileTools] IPC handlers & toolRegistry registered successfully.');
};

module.exports = {
    createReadFileTool,
    createWriteFileTool,
    createDeleteFileTool,
    createListFilesTool,
    createRenameFileTool,
    createMoveOrCopyFileTool,
    setupFileTools
};

const { app } = require('electron');
const path = require('path');

// Mocking process.type for tool registry if needed, but running with electron should set it to 'browser' (main)
// We need to wait for app ready if we use ipcMain, though for direct tool execution we might not need it if we bypass IPC.
// However, the tools use ipcMain.handle.

app.whenReady().then(async () => {
    console.log('--- Starting Verification ---');

    try {
        const { registry } = require('./src/agent/toolRegistry');

        // Discover tools
        const toolsDir = path.join(__dirname, 'src/agent/tools');
        await registry.discoverToolsFrom(toolsDir);

        const tools = registry.listTools();
        console.log(`Discovered ${tools.length} tools:`);
        tools.forEach(t => console.log(` - ${t.name}: ${t.description}`));

        // Verify specific tools exist
        const requiredTools = ['keyboard_tool', 'mouse_tool', 'system_tool', 'vision_tool', 'audio_tool'];
        const missing = requiredTools.filter(name => !tools.find(t => t.name === name));

        if (missing.length > 0) {
            console.error('❌ Missing tools:', missing);
            process.exit(1);
        } else {
            console.log('✅ All required tools present.');
        }

        // Test execution (System Tool - List Files)
        console.log('\nTesting system_tool (list files)...');
        const systemTool = tools.find(t => t.name === 'system_tool');
        if (systemTool) {
            const result = await systemTool.func({
                action: 'file_op',
                fileOp: 'list',
                path: path.join(__dirname, 'src')
            });
            console.log('Result:', result);
        }

        // Test execution (Audio Tool - Speak)
        console.log('\nTesting audio_tool (speak)...');
        const audioTool = tools.find(t => t.name === 'audio_tool');
        if (audioTool) {
            // We won't actually wait for the speak to finish if it blocks, but the tool returns a promise.
            // Just checking if it runs without error.
            try {
                // Use a short text
                await audioTool.func({ action: 'speak', text: 'System check complete.' });
                console.log('✅ Audio tool executed successfully.');
            } catch (err) {
                console.error('❌ Audio tool failed:', err.message);
            }
        }

        console.log('\n✅ Verification Complete.');
        app.quit();

    } catch (err) {
        console.error('❌ Verification Error:', err);
        app.quit();
    }
});

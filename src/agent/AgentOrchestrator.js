const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { registry } = require('./toolRegistry');

class AgentOrchestrator {
    constructor(llmService) {
        this.llmService = llmService;
        this.agent = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            const tools = registry.getAll();
            console.log(`[AgentOrchestrator] Initializing with ${tools.length} tools`);

            // Create ReAct agent with tools
            this.agent = createReactAgent({
                llm: this.llmService.llm,
                tools: tools,
                messageModifier: new SystemMessage(`You are MantrAI, a productivity-focused desktop assistant. 
                You can autonomously use tools to help users with:
                - File operations (read, write, organize)
                - System control (volume, windows, URLs)
                - Desktop automation (mouse, keyboard)
                - Screen analysis and OCR
                - Browser automation
                - Audio feedback

                Always explain what you're doing and ask for confirmation before destructive actions.
                Be proactive in suggesting productivity improvements.`)
            });

            this.isInitialized = true;
            console.log("[AgentOrchestrator] ReAct agent initialized");
        } catch (error) {
            console.error("[AgentOrchestrator] Initialization failed:", error);
        }
    }

    async executeTask(userInput, context = null) {
        if (!this.isInitialized) {
            await this.init();
        }

        try {
            const messages = [
                new HumanMessage({
                    content: context
                        ? `Context: ${JSON.stringify(context)}\n\nUser request: ${userInput}`
                        : userInput
                })
            ];

            console.log("[AgentOrchestrator] Executing task:", userInput);
            const result = await this.agent.invoke({ messages });

            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content;
        } catch (error) {
            console.error("[AgentOrchestrator] Task execution failed:", error);
            return `I encountered an error: ${error.message}. Please try again.`;
        }
    }

    async executeWorkflow(workflowName, params = {}) {
        const workflows = {
            'focus_mode': async () => {
                const duration = params.duration || 120; // 2 hours default
                return await this.executeTask(`Start focus mode for ${duration} minutes. Block distracting websites and apps, set a timer, and enable do not disturb mode.`);
            },

            'coding_setup': async () => {
                return await this.executeTask("Open my coding setup: VS Code, Terminal, Chrome with documentation tabs, and Spotify for background music.");
            },

            'end_day_summary': async () => {
                return await this.executeTask("Generate my end-of-day productivity summary. Analyze today's activity, highlight achievements, and suggest improvements for tomorrow.");
            },

            'break_reminder': async () => {
                return await this.executeTask("It's time for a break! Remind me to step away from the computer, suggest a 5-minute activity, and set a timer.");
            }
        };

        if (workflows[workflowName]) {
            return await workflows[workflowName]();
        } else {
            return `Unknown workflow: ${workflowName}`;
        }
    }
}

module.exports = AgentOrchestrator;
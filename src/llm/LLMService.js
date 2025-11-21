const { ChatOpenAI } = require('@langchain/openai');
const { ConversationSummaryBufferMemory, ChatMessageHistory } = require("@langchain/classic/memory");
const { END } = require("@langchain/langgraph");
const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
const axios = require('axios');
const AgentOrchestrator = require('../agent/AgentOrchestrator');
const StatePersistence = require('../agent/StatePersistence');
const WorkflowEngine = require('../agent/WorkflowEngine');
const PermissionManager = require('../agent/PermissionManager');
const fs = require('fs');
const path = require('path');

class LLMService {
    constructor() {
        this.providers = {
            ollama: {
                baseUrl: 'http://localhost:11434',
                model: 'llama2'
            },
            openai: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-3.5-turbo',
                apiKey: process.env.OPENAI_API_KEY
            }
        };

        this.currentProvider = 'openai';
        this.maxRetries = 3;
        this.llm = null;
        this.chain = null;
        // 🔹 Initialize Memory
        this.memory = null; // Will be initialized in initializeLangChain or loadHistory
        this.modelWithTools = null;

        // 🚀 Initialize Agent Components
        this.statePersistence = new StatePersistence();
        this.workflowEngine = new WorkflowEngine(this.statePersistence);
        this.permissionManager = new PermissionManager();
        this.agentOrchestrator = null;

        // Persistence path
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.historyFile = path.join(dataDir, 'ask_history.json');

        // Initialize asynchronously
        this._init();
    }

    async _init() {
        try {
            await this.initializeLangChain();
            await this.loadHistory(); // Load history on startup
        } catch (err) {
            console.error('Failed to initialize LangChain:', err);
        }
    }

    async loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf8');
                const storedMessages = JSON.parse(data);

                // Convert stored JSON to LangChain Message objects
                const messages = storedMessages.map(msg => {
                    if (msg.type === 'human') return new HumanMessage(msg.content);
                    if (msg.type === 'ai') return new AIMessage(msg.content);
                    if (msg.type === 'system') return new SystemMessage(msg.content);
                    return new HumanMessage(msg.content); // Fallback
                });

                // Re-initialize memory with loaded messages
                this.memory = new ConversationSummaryBufferMemory({
                    llm: this.llm,
                    memoryKey: "history",
                    inputKey: "input",
                    returnMessages: true,
                    maxTokenLimit: 2000,
                    chatHistory: new ChatMessageHistory(messages)
                });
                console.log(`[LLMService] Loaded ${messages.length} messages from history.`);
            }
        } catch (error) {
            console.error('[LLMService] Error loading history:', error);
            // Fallback to empty memory if load fails
            this.memory = new ConversationSummaryBufferMemory({
                llm: this.llm,
                memoryKey: "history",
                inputKey: "input",
                returnMessages: true,
                maxTokenLimit: 2000
            });
        }
    }

    async saveHistory() {
        try {
            if (this.memory) {
                const messages = await this.memory.chatHistory.getMessages();
                const serializedMessages = messages.map(msg => ({
                    type: msg._getType(), // 'human', 'ai', 'system'
                    content: msg.content
                }));

                // Keep only last 50 messages to prevent unlimited growth
                const trimmedMessages = serializedMessages.slice(-50);

                fs.writeFileSync(this.historyFile, JSON.stringify(trimmedMessages, null, 2));
            }
        } catch (error) {
            console.error('[LLMService] Error saving history:', error);
        }
    }

    async getChatHistory() {
        if (this.memory) {
            const messages = await this.memory.chatHistory.getMessages();
            return messages.map(msg => ({
                role: msg._getType() === 'human' ? 'user' : 'ai',
                content: msg.content
            }));
        }
        return [];
    }

    async clearChatHistory() {
        this.memory = new ConversationSummaryBufferMemory({
            llm: this.llm,
            memoryKey: "history",
            inputKey: "input",
            returnMessages: true,
            maxTokenLimit: 2000
        });
        if (fs.existsSync(this.historyFile)) {
            fs.unlinkSync(this.historyFile);
        }
    }

    initializeLangChain() {
        if (this.currentProvider === 'openai') {
            this.llm = new ChatOpenAI({
                modelName: this.providers.openai.model,
                openAIApiKey: this.providers.openai.apiKey,
                temperature: 0.7,
                maxTokens: 500
            });

            // this.modelWithTools = this.llm.bindTools(chromeTools);
            // ✅ Load all tools dynamically (from registry)
            let toolsToBind = [];
            try {
                const { registry } = require('../agent/toolRegistry');
                toolsToBind = registry?.getAll?.() || [];

                console.log(`[LLMService] Binding ${toolsToBind.length} tools`);
            } catch (err) {
                console.warn("[LLMService] ⚠️ Tool registry not found, continuing without tools.");
            }

            // ✅ Bind tools safely (prevents .map crash)
            if (Array.isArray(toolsToBind) && toolsToBind.length > 0) {
                this.modelWithTools = this.llm.bindTools(toolsToBind);
            } else {
                console.warn("[LLMService] No tools bound — running in plain LLM mode");
                this.modelWithTools = this.llm;
            }


            // ✅ Initialize memory
            this.memory = new ConversationSummaryBufferMemory({
                llm: this.llm,
                memoryKey: "history",
                inputKey: "input",
                returnMessages: true,
                maxTokenLimit: 1000
            });

            // ✅ Build prompt and chain
            const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
            const { RunnableSequence } = require('@langchain/core/runnables');

            this.prompt = ChatPromptTemplate.fromMessages([
                ['system', 'You are a helpful AI assistant integrated into a desktop productivity app. Provide concise, practical advice.'],
                new MessagesPlaceholder('history'),
                ['human', '{input}']
            ]);

            this.chain = RunnableSequence.from([
                async ({ input }) => {
                    const vars = await this.memory.loadMemoryVariables({});
                    return { input, ...vars };
                },
                this.prompt,
                this.llm,
                async (output, input) => {
                    const userInput = input?.input ?? "unknown input";
                    await this.memory.saveContext({ input: userInput }, { output: output.content });
                    return output;
                }
            ]);

            // ✅ LangGraph workflow setup
            const { ToolNode } = require("@langchain/langgraph/prebuilt");
            const { StateGraph, END, START, MessagesAnnotation } = require("@langchain/langgraph");


            this.toolNode = new ToolNode(toolsToBind);
            this.workflow = new StateGraph(MessagesAnnotation)
                .addNode("agent", this.callModel.bind(this))
                .addNode("tools", this.toolNode)
                .addEdge(START, "agent")
                .addConditionalEdges("agent", (state) => this.shouldContinue(state))
                .addEdge("tools", "agent");

            this.agent = this.workflow.compile();

            // 🚀 Initialize Agent Orchestrator
            this.agentOrchestrator = new AgentOrchestrator(this);

            console.log("[LLMService] LangChain initialized with tools and agent orchestration");


        }
    }


    shouldContinue(state) {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.additional_kwargs?.tool_calls?.length) {
            return "tools";
        }
        return END;
    }

    async callModel(state) {
        const messages = state.messages;
        try {
            if (!this.modelWithTools) {
                throw new Error('Model with tools not initialized');
            }
            // Try to use the model with tools first
            try {
                const response = await this.modelWithTools.invoke(messages);
                return { messages: [response] };
            } catch (toolError) {
                console.error("Tool invocation error:", toolError);
                // Fallback to regular llm if tool invocation fails
                if (this.llm) {
                    const response = await this.llm.invoke(messages);
                    return { messages: [response] };
                }
                throw toolError; // Re-throw if we can't fallback
            }
        } catch (err) {
            console.error("Model error:", err);
            return { messages: [{ role: "system", content: "Tool execution failed." }] };
        }
    }

    async processAction(query, context = null) {
        try {
            // Load memory and any existing conversation context
            const vars = await this.memory.loadMemoryVariables({});
            const history = vars.history || [];

            // Create a new HumanMessage for this user query
            const newMessage = new HumanMessage({
                content: context
                    ? `Context:\n${JSON.stringify(context, null, 2)}\n\nUser query: ${query}`
                    : query,
            });

            // Combine old messages + new one
            const messages = [...history, newMessage];

            console.log(" Invoking Agent Workflow...");
            const result = await this.agent.invoke({ messages });

            // Extract last message (agent reply)
            const lastMessage = result.messages[result.messages.length - 1];
            const content =
                typeof lastMessage.content === "string"
                    ? lastMessage.content
                    : JSON.stringify(lastMessage.content, null, 2);

            // Save this exchange to memory for continuity
            await this.memory.saveContext({ input: query }, { output: content });

            console.log("Agent Response:", content);

            return content;
        } catch (err) {
            console.error("❌ Agent processAction error:", err);
            return "Sorry, I couldn’t complete that action.";
        }
    }

    async processQuery(query, context = null) {
        try {
            if (this.currentProvider === 'openai' && this.chain) {
                const vars = await this.memory.loadMemoryVariables({});

                // Handle different types of context
                let contextStr = '';
                if (typeof context === 'string') {
                    // If context is directly provided as a string (file content)
                    contextStr = `Document content:\n${context}\n\n`;
                } else if (context && Object.keys(context).length > 0) {
                    // If context is an object (screen context)
                    contextStr = `Context:\n${JSON.stringify(context, null, 2)}\n\n`;
                }

                const input = contextStr ? `${contextStr}Query: ${query}` : query;
                const response = await this.chain.invoke({ input, ...vars });
                return response.content;
            } else {
                const prompt = this.buildPrompt(query, context);
                return await this.callLLM(prompt);
            }
        } catch (error) {
            console.error('LLM processing error:', error);
            return this.getFallbackResponse(query);
        }
    }

    async processQueryStream(query, context = null, onToken) {
        try {
            if (this.currentProvider === 'openai' && this.prompt && this.llm) {
                const vars = await this.memory.loadMemoryVariables({});
                let contextStr = '';
                if (typeof context === 'string') {
                    contextStr = `Document content:\n${context}\n\n`;
                } else if (context && Object.keys(context).length > 0) {
                    contextStr = `Context:\n${JSON.stringify(context, null, 2)}\n\n`;
                }

                const input = contextStr ? `${contextStr}Query: ${query}` : query;

                // 🚀 FIX: Use prompt.pipe(llm) directly to avoid buffering in the full chain
                const streamingChain = this.prompt.pipe(this.llm);
                const stream = await streamingChain.stream({ input, ...vars });

                let fullResponse = "";
                for await (const chunk of stream) {
                    // chunk is usually an AIMessageChunk or similar
                    const token = chunk.content || "";
                    fullResponse += token;
                    if (onToken) onToken(token);
                }

                // Save to memory after streaming is complete
                await this.memory.saveContext({ input }, { output: fullResponse });

                return fullResponse;
            } else {
                // Fallback for non-streaming providers or strict LLM calls
                const response = await this.processQuery(query, context);
                if (onToken) onToken(response);
                return response;
            }
        } catch (error) {
            console.error('LLM streaming error:', error);
            const fallback = this.getFallbackResponse(query);
            if (onToken) onToken(fallback);
            return fallback;
        }
    }


    async generateProductivityInsights(reportData, userQuery) {
        try {
            const contextPrompt = `Analyze this productivity data:\n${JSON.stringify(reportData, null, 2)}\n\nUser question: ${userQuery}\n\nProvide specific, actionable advice to improve productivity. Keep it concise (2-3 sentences).`;

            let response;
            if (this.currentProvider === 'openai' && this.llm) {
                const result = await this.llm.invoke({
                    messages: [
                        { role: 'system', content: 'You are an AI productivity coach. Analyze activity data and provide insights.' },
                        { role: 'user', content: contextPrompt },
                    ],
                });

                response = result.content;
            } else {
                response = await this.callLLM(contextPrompt);
            }

            return {
                type: 'productivity-report',
                title: this.extractReportTitle(userQuery),
                summary: reportData.summary,
                topApps: reportData.topApps,
                insights: response
            };
        } catch (error) {
            console.error('Productivity insights error:', error);
            return {
                type: 'productivity-report',
                title: 'Productivity Report',
                summary: reportData.summary || 'No activity data available.',
                topApps: reportData.topApps || [],
                insights: 'Unable to generate AI insights at this time.'
            };
        }
    }

    buildPrompt(query, context) {
        let prompt = `You are a helpful AI assistant integrated into a desktop productivity app. `;

        // Handle different types of context
        if (typeof context === 'string') {
            // If context is directly provided as a string (file content)
            prompt += `Document content:\n${context}\n\n`;
        } else if (context && Object.keys(context).length > 0) {
            // If context is an object (screen context)
            prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`;
        }

        prompt += `User query: ${query}\n\n`;
        prompt += `Please provide a concise, helpful response. If this is about productivity or time management, offer practical advice.`;

        return prompt;
    }

    async callLLM(prompt) {
        const provider = this.providers[this.currentProvider];
        return await this.retry(() =>
            this.currentProvider === 'ollama'
                ? this.callOllama(prompt, provider)
                : this.callOpenAI(prompt, provider)
        );
    }

    async retry(fn, retries = this.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try { return await fn(); }
            catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    async callOllama(prompt, config) {
        try {
            const response = await axios.post(`${config.baseUrl}/api/generate`, {
                model: config.model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    max_tokens: 500
                }
            }, { timeout: 30000 });

            return response.data.response || 'No response from Ollama';
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama is not running. Please start Ollama first.');
            }
            throw error;
        }
    }

    async callOpenAI(prompt, config) {
        if (!config.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await axios.post(`${config.baseUrl}/chat/completions`, {
                model: config.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || error.message);
        }
    }

    getFallbackResponse(query) {
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('productivity') || lowerQuery.includes('report')) {
            return 'I can help you track your productivity! Try asking for "today\'s report" or "show my activity".';
        }

        if (lowerQuery.includes('focus') || lowerQuery.includes('distraction')) {
            return 'To improve focus, try the Pomodoro technique: 25 minutes of focused work followed by a 5-minute break.';
        }

        if (lowerQuery.includes('time') || lowerQuery.includes('management')) {
            return 'Good time management involves prioritizing tasks, setting clear goals, and minimizing distractions.';
        }

        return 'I\'m having trouble connecting to the AI service. Please check your internet connection or try again later.';
    }

    extractReportTitle(query) {
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('today')) return 'Today\'s Productivity Report';
        if (lowerQuery.includes('yesterday')) return 'Yesterday\'s Productivity Report';
        if (lowerQuery.includes('week')) return 'Weekly Productivity Report';
        return 'Productivity Report';
    }

    async testConnection() {
        try {
            const testPrompt = 'Hello, please respond with "Connection successful"';
            const response = await this.callLLM(testPrompt);
            return { success: true, response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 🚀 NEW AGENTIC METHODS

    async executeAgenticTask(userInput, context = null) {
        if (!this.agentOrchestrator) {
            return await this.processQuery(userInput, context); // Fallback to regular processing
        }

        try {
            // Save conversation to state
            this.statePersistence.saveConversation([{ role: 'user', content: userInput }]);

            // Execute through agent orchestrator
            const result = await this.agentOrchestrator.executeTask(userInput, context);

            // Save response
            this.statePersistence.saveConversation([{ role: 'assistant', content: result }]);

            return result;
        } catch (error) {
            console.error('[LLMService] Agentic task failed:', error);
            return await this.processQuery(userInput, context); // Fallback
        }
    }

    async executeWorkflow(workflowName, params = {}) {
        return await this.workflowEngine.executeWorkflow(workflowName, params);
    }

    async createWorkflow(name, description, steps) {
        return await this.workflowEngine.createCustomWorkflow(name, description, steps);
    }

    getAvailableWorkflows() {
        return this.workflowEngine.getAvailableWorkflows();
    }

    getAgentState(key) {
        return this.statePersistence.getState(key);
    }

    updateAgentState(key, value) {
        this.statePersistence.updateState(key, value);
    }

    async requestPermission(action, details) {
        return await this.permissionManager.requestPermission(action, details);
    }

    // Productivity helpers
    addDailyGoal(goal) {
        this.statePersistence.addDailyGoal(goal);
    }

    completeGoal(goalId) {
        this.statePersistence.completeGoal(goalId);
    }

    getDailyGoals() {
        return this.statePersistence.getState('productivity')?.dailyGoals || [];
    }

    // Smart workflow suggestions based on context
    suggestWorkflow(context) {
        const timeOfDay = new Date().getHours();
        const dayOfWeek = new Date().getDay();

        if (timeOfDay >= 9 && timeOfDay <= 17 && dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (context?.activeApp?.includes('code') || context?.activeApp?.includes('dev')) {
                return 'coding_setup';
            }
            if (timeOfDay === 17) {
                return 'end_day_routine';
            }
        }

        return null;
    }

    switchProvider(provider) {
        if (this.providers[provider]) {
            this.currentProvider = provider;
            this.initializeLangChain();
            this.agent = this.workflow.compile();  // ✅ Recompile with new model

            // Reinitialize agent orchestrator with new LLM
            if (this.agentOrchestrator) {
                this.agentOrchestrator = new AgentOrchestrator(this);
            }

            console.log(`Switched to LLM provider: ${provider}`);
            return true;
        }
        return false;
    }

    setApiKey(provider, apiKey) {
        if (this.providers[provider]) {
            this.providers[provider].apiKey = apiKey;
            return true;
        }
        return false;
    }

    // 🚀 Vector Store / RAG Integration
    async initVectorStore() {
        if (!this.vectorStore) {
            try {
                const VectorStoreService = require('./VectorStoreService');
                this.vectorStore = new VectorStoreService();
                console.log('[LLMService] VectorStoreService initialized');
            } catch (err) {
                console.error('[LLMService] Failed to init VectorStoreService:', err);
            }
        }
    }

    async addDocumentToStore(filePath) {
        await this.initVectorStore();
        if (this.vectorStore) {
            return await this.vectorStore.addDocument(filePath);
        }
        return { success: false, error: 'Vector store not initialized' };
    }

    async processQueryWithRAG(query) {
        await this.initVectorStore();
        if (!this.vectorStore) {
            return await this.processQuery(query); // Fallback
        }

        try {
            // 1. Retrieve relevant docs
            const matches = await this.vectorStore.query(query, 3);

            if (matches.length === 0) {
                return await this.processQuery(query); // No context found, use normal LLM
            }

            // 2. Construct context from matches
            const contextText = matches.map(m => `[Source: ${m.metadata.source}]\n${m.text}`).join('\n\n---\n\n');

            // 3. Ask LLM with context
            const prompt = `You are a helpful assistant. Answer the user's question based ONLY on the following context. If the answer is not in the context, say you don't know.\n\nContext:\n${contextText}\n\nUser Question: ${query}`;

            return await this.callLLM(prompt);

        } catch (err) {
            console.error('[LLMService] RAG error:', err);
            return await this.processQuery(query); // Fallback
        }
    }

    async resetVectorStore() {
        await this.initVectorStore();
        if (this.vectorStore) {
            return await this.vectorStore.reset();
        }
        return false;
    }
}

module.exports = LLMService;
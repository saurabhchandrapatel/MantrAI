const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { InMemoryChatMessageHistory } = require('@langchain/core/chat_history');
const { RunnableSequence } = require('@langchain/core/runnables');
const { ConversationSummaryBufferMemory } = require("@langchain/classic/memory");
const { chromeTools } = require('../agent/tools');
const { ToolNode } =  require("@langchain/langgraph/prebuilt");
const { StateGraph, END, START, MessagesAnnotation } = require("@langchain/langgraph");
const { HumanMessage } =  require("@langchain/core/messages");

const axios = require('axios');

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
        this.memory = null;
        this.modelWithTools = null
        
        // Initialize asynchronously
        this._init();
    }

    async _init() {
        try {
            await this.initializeLangChain();
        } catch (err) {
            console.error('Failed to initialize LangChain:', err);
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

            this.modelWithTools = this.llm.bindTools(chromeTools);

            this.memory = new ConversationSummaryBufferMemory({
                llm: this.llm,               // optional but recommended for summarization
                memoryKey: "history",        // where messages are stored
                inputKey: "input",           // which field in your chain input is the user text
                returnMessages: true,
                maxTokenLimit: 1000          // optional, defaults to ~500–1000
            });

            const prompt = ChatPromptTemplate.fromMessages([
                ['system', 'You are a helpful AI assistant integrated into a desktop productivity app. Provide concise, practical advice.'],
                new MessagesPlaceholder('history'),
                ['human', '{input}']
            ]);

            this.chain = RunnableSequence.from([
                async ({ input }) => {
                    const vars = await this.memory.loadMemoryVariables({});
                    return { input, ...vars };
                },
                prompt,
                this.llm,
                // ✅ Preserve both input + output
                async (output, input) => {
                    const userInput = input?.input ?? "unknown input";
                    await this.memory.saveContext({ input: userInput }, { output: output.content });
                    return output;
                }
            ]);

            this.toolNode = new ToolNode(chromeTools);
            this.workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", this.callModel.bind(this))
            .addNode("tools", this.toolNode)
            .addEdge(START, "agent")
            .addConditionalEdges("agent", (state) => this.shouldContinue(state))
            .addEdge("tools", "agent");
            this.agent = this.workflow.compile()
            // await this.agent.invoke({ messages: [{ role: "user", content: "Hi!" }] });

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

    switchProvider(provider) {
        if (this.providers[provider]) {
            this.currentProvider = provider;
            this.initializeLangChain();
            this.agent = this.workflow.compile();  // ✅ Recompile with new model
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
}

module.exports = LLMService;
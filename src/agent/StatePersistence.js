const fs = require('fs');
const path = require('path');

class StatePersistence {
    constructor(dataDir = path.join(__dirname, '../data')) {
        this.dataDir = dataDir;
        this.stateFile = path.join(dataDir, 'agent_state.json');
        this.conversationFile = path.join(dataDir, 'conversations.json');
        this.workflowFile = path.join(dataDir, 'workflows.json');
        
        this.ensureDataDir();
        this.state = this.loadState();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading state:', error);
        }
        
        return {
            sessionId: Date.now(),
            preferences: {},
            workflowHistory: [],
            lastActivity: null,
            focusMode: false,
            productivity: {
                dailyGoals: [],
                completedTasks: [],
                distractionCount: 0
            }
        };
    }

    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving state:', error);
            return false;
        }
    }

    updateState(key, value) {
        this.state[key] = value;
        this.state.lastActivity = new Date().toISOString();
        this.saveState();
    }

    getState(key) {
        return key ? this.state[key] : this.state;
    }

    // Conversation persistence
    saveConversation(messages) {
        try {
            const conversations = this.loadConversations();
            conversations.push({
                timestamp: new Date().toISOString(),
                sessionId: this.state.sessionId,
                messages: messages
            });
            
            // Keep only last 50 conversations
            if (conversations.length > 50) {
                conversations.splice(0, conversations.length - 50);
            }
            
            fs.writeFileSync(this.conversationFile, JSON.stringify(conversations, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving conversation:', error);
            return false;
        }
    }

    loadConversations() {
        try {
            if (fs.existsSync(this.conversationFile)) {
                const data = fs.readFileSync(this.conversationFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
        return [];
    }

    // Workflow persistence
    saveWorkflow(name, steps, metadata = {}) {
        try {
            const workflows = this.loadWorkflows();
            workflows[name] = {
                steps,
                metadata,
                created: new Date().toISOString(),
                lastUsed: null,
                useCount: 0
            };
            
            fs.writeFileSync(this.workflowFile, JSON.stringify(workflows, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving workflow:', error);
            return false;
        }
    }

    loadWorkflows() {
        try {
            if (fs.existsSync(this.workflowFile)) {
                const data = fs.readFileSync(this.workflowFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading workflows:', error);
        }
        return {};
    }

    recordWorkflowUsage(name) {
        const workflows = this.loadWorkflows();
        if (workflows[name]) {
            workflows[name].lastUsed = new Date().toISOString();
            workflows[name].useCount = (workflows[name].useCount || 0) + 1;
            fs.writeFileSync(this.workflowFile, JSON.stringify(workflows, null, 2));
        }
    }

    // Productivity tracking
    addDailyGoal(goal) {
        if (!this.state.productivity.dailyGoals) {
            this.state.productivity.dailyGoals = [];
        }
        this.state.productivity.dailyGoals.push({
            id: Date.now(),
            text: goal,
            completed: false,
            created: new Date().toISOString()
        });
        this.saveState();
    }

    completeGoal(goalId) {
        const goal = this.state.productivity.dailyGoals.find(g => g.id === goalId);
        if (goal) {
            goal.completed = true;
            goal.completedAt = new Date().toISOString();
            this.saveState();
        }
    }

    incrementDistraction() {
        this.state.productivity.distractionCount = (this.state.productivity.distractionCount || 0) + 1;
        this.saveState();
    }

    resetDailyStats() {
        this.state.productivity = {
            dailyGoals: [],
            completedTasks: [],
            distractionCount: 0
        };
        this.saveState();
    }

    // Cleanup old data
    cleanup(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        // Clean conversations
        const conversations = this.loadConversations();
        const filteredConversations = conversations.filter(conv => 
            new Date(conv.timestamp) > cutoffDate
        );
        
        if (filteredConversations.length !== conversations.length) {
            fs.writeFileSync(this.conversationFile, JSON.stringify(filteredConversations, null, 2));
            console.log(`Cleaned ${conversations.length - filteredConversations.length} old conversations`);
        }
    }
}

module.exports = StatePersistence;
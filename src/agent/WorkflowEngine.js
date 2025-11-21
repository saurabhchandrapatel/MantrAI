const { registry } = require('./toolRegistry');
const PermissionManager = require('./PermissionManager');

class WorkflowEngine {
    constructor(statePersistence) {
        this.statePersistence = statePersistence;
        this.permissionManager = new PermissionManager();
        this.runningWorkflows = new Map();
        this.predefinedWorkflows = this.initializePredefinedWorkflows();
    }

    initializePredefinedWorkflows() {
        return {
            'focus_mode': {
                name: 'Focus Mode',
                description: 'Block distractions and start focused work session',
                steps: [
                    { tool: 'browser_tool', action: 'block_sites', params: { sites: ['facebook.com', 'twitter.com', 'youtube.com'] } },
                    { tool: 'system_tool', action: 'volume', params: { volumeAction: 'down' } },
                    { tool: 'desktop_automation', action: 'start_timer', params: { minutes: 25 } }
                ],
                requiresPermission: true
            },
            
            'coding_setup': {
                name: 'Coding Setup',
                description: 'Open development environment',
                steps: [
                    { tool: 'system_tool', action: 'switch_window', params: { windowTitle: 'Visual Studio Code' } },
                    { tool: 'system_tool', action: 'open_url', params: { url: 'https://docs.microsoft.com' } },
                    { tool: 'system_tool', action: 'open_url', params: { url: 'https://stackoverflow.com' } },
                    { tool: 'audio_tool', action: 'play_focus_music' }
                ],
                requiresPermission: false
            },
            
            'end_day_routine': {
                name: 'End Day Routine',
                description: 'Save work and generate daily report',
                steps: [
                    { tool: 'file_tool', action: 'backup_workspace' },
                    { tool: 'system_tool', action: 'file_op', params: { fileOp: 'write', path: 'daily_notes.txt', content: 'Day completed' } },
                    { tool: 'vision_tool', action: 'capture_screen', params: { save: true } }
                ],
                requiresPermission: true
            },
            
            'break_reminder': {
                name: 'Break Reminder',
                description: 'Remind user to take a break',
                steps: [
                    { tool: 'audio_tool', action: 'speak', params: { text: 'Time for a break! Step away from your computer.' } },
                    { tool: 'desktop_automation', action: 'show_notification', params: { title: 'Break Time', message: 'Take a 5-minute break' } },
                    { tool: 'desktop_automation', action: 'start_timer', params: { minutes: 5 } }
                ],
                requiresPermission: false
            }
        };
    }

    async executeWorkflow(workflowName, params = {}) {
        const workflowId = `${workflowName}_${Date.now()}`;
        
        try {
            // Check if workflow exists
            let workflow = this.predefinedWorkflows[workflowName];
            if (!workflow) {
                const customWorkflows = this.statePersistence.loadWorkflows();
                workflow = customWorkflows[workflowName];
            }
            
            if (!workflow) {
                throw new Error(`Workflow '${workflowName}' not found`);
            }

            // Request permission if needed
            if (workflow.requiresPermission) {
                const allowed = await this.permissionManager.requestPermission(
                    'execute_workflow',
                    `Execute workflow: ${workflow.name} - ${workflow.description}`
                );
                if (!allowed) {
                    return { success: false, message: 'Permission denied' };
                }
            }

            console.log(`[WorkflowEngine] Starting workflow: ${workflowName}`);
            this.runningWorkflows.set(workflowId, { name: workflowName, status: 'running', startTime: Date.now() });

            const results = [];
            
            for (let i = 0; i < workflow.steps.length; i++) {
                const step = workflow.steps[i];
                console.log(`[WorkflowEngine] Executing step ${i + 1}/${workflow.steps.length}: ${step.tool}`);
                
                try {
                    const result = await this.executeStep(step, params);
                    results.push({ step: i + 1, success: true, result });
                } catch (error) {
                    console.error(`[WorkflowEngine] Step ${i + 1} failed:`, error);
                    results.push({ step: i + 1, success: false, error: error.message });
                    
                    // Continue or stop based on step configuration
                    if (step.stopOnError !== false) {
                        break;
                    }
                }
            }

            // Record workflow usage
            this.statePersistence.recordWorkflowUsage(workflowName);
            this.runningWorkflows.delete(workflowId);

            console.log(`[WorkflowEngine] Workflow completed: ${workflowName}`);
            return { 
                success: true, 
                workflowName, 
                results,
                executionTime: Date.now() - this.runningWorkflows.get(workflowId)?.startTime || 0
            };

        } catch (error) {
            console.error(`[WorkflowEngine] Workflow failed: ${workflowName}`, error);
            this.runningWorkflows.delete(workflowId);
            return { success: false, error: error.message };
        }
    }

    async executeStep(step, globalParams = {}) {
        const { tool: toolName, action, params = {} } = step;
        
        // Merge global params with step params
        const mergedParams = { ...globalParams, ...params, action };
        
        // Get tool from registry
        const tools = registry.getAll();
        const tool = tools.find(t => t.name === toolName);
        
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }

        // Execute tool
        return await tool.func(mergedParams);
    }

    async createCustomWorkflow(name, description, steps) {
        const workflow = {
            name,
            description,
            steps,
            requiresPermission: this.shouldRequirePermission(steps),
            created: new Date().toISOString()
        };

        const success = this.statePersistence.saveWorkflow(name, workflow);
        if (success) {
            console.log(`[WorkflowEngine] Created custom workflow: ${name}`);
            return { success: true, workflow };
        } else {
            return { success: false, error: 'Failed to save workflow' };
        }
    }

    shouldRequirePermission(steps) {
        const sensitiveActions = ['file_op', 'open_url', 'execute_command'];
        return steps.some(step => 
            sensitiveActions.includes(step.action) || 
            (step.params && Object.values(step.params).some(v => 
                typeof v === 'string' && (v.includes('delete') || v.includes('remove'))
            ))
        );
    }

    getAvailableWorkflows() {
        const predefined = Object.keys(this.predefinedWorkflows).map(key => ({
            name: key,
            ...this.predefinedWorkflows[key],
            type: 'predefined'
        }));

        const custom = Object.entries(this.statePersistence.loadWorkflows()).map(([key, workflow]) => ({
            name: key,
            ...workflow,
            type: 'custom'
        }));

        return [...predefined, ...custom];
    }

    getRunningWorkflows() {
        return Array.from(this.runningWorkflows.entries()).map(([id, workflow]) => ({
            id,
            ...workflow,
            duration: Date.now() - workflow.startTime
        }));
    }

    async stopWorkflow(workflowId) {
        if (this.runningWorkflows.has(workflowId)) {
            this.runningWorkflows.delete(workflowId);
            return { success: true, message: 'Workflow stopped' };
        }
        return { success: false, message: 'Workflow not found or already completed' };
    }
}

module.exports = WorkflowEngine;
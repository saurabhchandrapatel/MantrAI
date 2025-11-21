const { dialog } = require('electron');

class PermissionManager {
    constructor() {
        this.sensitiveActions = new Set([
            'file_delete', 'file_write', 'system_shutdown', 
            'open_url', 'execute_command', 'install_software'
        ]);
        this.autoApprove = false; // Set to true for development
    }

    async requestPermission(action, details) {
        if (!this.sensitiveActions.has(action) || this.autoApprove) {
            return true;
        }

        try {
            const result = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Allow', 'Deny', 'Always Allow'],
                defaultId: 0,
                title: 'Permission Request',
                message: `MantrAI wants to perform: ${action}`,
                detail: `Details: ${details}\n\nDo you want to allow this action?`
            });

            if (result.response === 2) { // Always Allow
                this.autoApprove = true;
                return true;
            }
            
            return result.response === 0; // Allow
        } catch (error) {
            console.error('Permission dialog error:', error);
            return false; // Deny on error
        }
    }

    async confirmDestructiveAction(action, target) {
        const result = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Confirm', 'Cancel'],
            defaultId: 1,
            title: 'Confirm Destructive Action',
            message: `⚠️ This action cannot be undone!`,
            detail: `Action: ${action}\nTarget: ${target}\n\nAre you sure you want to proceed?`
        });

        return result.response === 0;
    }

    setSensitiveAction(action, isSensitive = true) {
        if (isSensitive) {
            this.sensitiveActions.add(action);
        } else {
            this.sensitiveActions.delete(action);
        }
    }
}

module.exports = PermissionManager;
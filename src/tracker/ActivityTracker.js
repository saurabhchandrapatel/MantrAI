const { powerMonitor } = require('electron');
const ActivityDatabase = require('../data/Database');

const IDLE_THRESHOLD = 60; // seconds

class ActivityTracker {
    constructor() {
        this.db = new ActivityDatabase();
        this.interval = null;
        this.currentActivity = null;
        this.trackingInterval = 10000; // 10 seconds, as per PRD

        // To hold the dynamically imported modules
        this.activeWin = null;
    }

    async initializeModules() {
        this.activeWin = (await import('active-win')).default;
    }
 
    async start() {
        try {
            await this.initializeModules();
            await this.db.initialize();
            console.log('Activity tracker started.');
        } catch (error) {
            console.error('Failed to start activity tracker:', error);
            return; // Do not start tracking if initialization fails
        }

        this.currentActivity = await this.createActivityRecord();

        this.interval = setInterval(async () => {
            const idleTime = powerMonitor.getSystemIdleTime();
            if (idleTime > IDLE_THRESHOLD) {
                if (this.currentActivity) {
                    await this.saveActivity();
                    this.currentActivity = null;
                }
                return;
            }

            if (!this.currentActivity) {
                this.currentActivity = await this.createActivityRecord();
            }

            const newWindow = await this.activeWin();
            if (this.currentActivity && newWindow && newWindow.owner.name !== this.currentActivity.appName) {
                await this.saveActivity();
                this.currentActivity = await this.createActivityRecord(newWindow);
            }

        }, this.trackingInterval);
    }

    async stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.currentActivity) {
            await this.saveActivity();
        }
        this.db.close();
        console.log('Activity tracker stopped.');
    }

    async createActivityRecord(window) {
        const win = window || await this.activeWin();
        if (!win) {
            return null;
        }
        return {
            startTime: new Date(),
            appName: win.owner.name,
            title: win.title,
        };
    }

    async saveActivity() {
        if (!this.currentActivity) {
            return;
        }

        const endTime = new Date();
        const duration = Math.round((endTime - this.currentActivity.startTime) / 1000); // in seconds

        if (duration > 0) {
            const activityData = {
                date: this.currentActivity.startTime.toISOString().split('T')[0],
                timestamp: this.currentActivity.startTime.toISOString(),
                appName: this.currentActivity.appName,
                duration: duration,
                category: 'Uncategorized', // Placeholder
                productive: true // Placeholder
            };
            await this.db.saveActivity(activityData);
            console.log(`Saved activity: ${activityData.appName} for ${duration} seconds`);
        }
    }
}

module.exports = ActivityTracker;
let activeWin;
try {
  activeWin = require('active-win');
} catch (error) {
  console.log('active-win not available, activity tracking disabled');
}
const Database = require('../data/Database');

class ActivityTracker {
    constructor() {
        this.db = new Database();
        this.isRunning = false;
        this.isPaused = false;
        this.currentApp = null;
        this.startTime = null;
        this.trackingInterval = null;
        this.checkInterval = 10000; // Check every 10 seconds
        
        this.productiveApps = new Set([
            'code.exe', 'devenv.exe', 'idea64.exe', 'sublime_text.exe',
            'notepad++.exe', 'atom.exe', 'brackets.exe', 'webstorm64.exe',
            'pycharm64.exe', 'rider64.exe', 'datagrip64.exe'
        ]);
        
        this.distractingApps = new Set([
            'chrome.exe', 'firefox.exe', 'msedge.exe', 'opera.exe',
            'discord.exe', 'slack.exe', 'teams.exe', 'whatsapp.exe',
            'spotify.exe', 'vlc.exe', 'steam.exe', 'epicgameslauncher.exe'
        ]);
    }

    async start() {
        if (this.isRunning) return;
        
        console.log('Starting activity tracking...');
        this.isRunning = true;
        this.isPaused = false;
        
        await this.db.initialize();
        this.trackingInterval = setInterval(() => {
            this.trackCurrentActivity();
        }, this.checkInterval);
        
        // Initial track
        this.trackCurrentActivity();
    }

    pause() {
        console.log('Pausing activity tracking...');
        this.isPaused = true;
        this.saveCurrentSession();
    }

    resume() {
        console.log('Resuming activity tracking...');
        this.isPaused = false;
    }

    stop() {
        if (!this.isRunning) return;
        
        console.log('Stopping activity tracking...');
        this.isRunning = false;
        this.saveCurrentSession();
        
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
    }

    async trackCurrentActivity() {
        if (!this.isRunning || this.isPaused || !activeWin) return;

        try {
            const activeWindow = await activeWin();
            
            if (!activeWindow) return;

            const appName = this.extractAppName(activeWindow.owner.name);
            const windowTitle = activeWindow.title;
            const now = new Date();

            // If app changed, save previous session and start new one
            if (this.currentApp && this.currentApp !== appName) {
                await this.saveCurrentSession();
            }

            // Start tracking new app
            if (this.currentApp !== appName) {
                this.currentApp = appName;
                this.startTime = now;
            }

        } catch (error) {
            console.error('Error tracking activity:', error);
        }
    }

    async saveCurrentSession() {
        if (!this.currentApp || !this.startTime) return;

        const endTime = new Date();
        const duration = Math.round((endTime - this.startTime) / 1000); // Duration in seconds
        
        if (duration < 5) return; // Ignore very short sessions

        const category = this.categorizeApp(this.currentApp);
        
        await this.db.saveActivity({
            date: this.startTime.toISOString().split('T')[0],
            timestamp: this.startTime.toISOString(),
            appName: this.currentApp,
            duration: duration,
            category: category,
            productive: category === 'productive'
        });

        console.log(`Saved session: ${this.currentApp} - ${duration}s`);
        
        // Reset for next session
        this.currentApp = null;
        this.startTime = null;
    }

    extractAppName(processName) {
        // Extract clean app name from process name
        return processName.toLowerCase().replace(/\.exe$/, '');
    }

    categorizeApp(appName) {
        const cleanName = appName.toLowerCase();
        
        if (this.productiveApps.has(cleanName + '.exe')) {
            return 'productive';
        } else if (this.distractingApps.has(cleanName + '.exe')) {
            return 'distracting';
        } else {
            return 'neutral';
        }
    }

    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        return await this.db.getActivityByDate(today);
    }

    async getWeekStats() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        
        return await this.db.getActivityByDateRange(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
    }

    async getYesterdayStats() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        return await this.db.getActivityByDate(dateStr);
    }
}

module.exports = ActivityTracker;
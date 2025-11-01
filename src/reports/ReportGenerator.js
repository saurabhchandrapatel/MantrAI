const Database = require('../data/Database');

class ReportGenerator {
    constructor() {
        this.db = new Database();
    }

    async generateReport(period = 'today') {
        await this.db.initialize();
        
        switch (period.toLowerCase()) {
            case 'today':
                return await this.generateTodayReport();
            case 'yesterday':
                return await this.generateYesterdayReport();
            case 'week':
                return await this.generateWeekReport();
            default:
                return await this.generateTodayReport();
        }
    }

    async generateTodayReport() {
        const today = new Date().toISOString().split('T')[0];
        
        const activities = await this.db.getActivityByDate(today);
        const summary = await this.db.getDailySummary(today);
        const topApps = await this.db.getTopApps(today, 5);
        const productivityScore = await this.db.getProductivityScore(today);
        const sessionBounds = await this.db.getSessionBounds(today);

        const loginTime = sessionBounds && sessionBounds.first_ts ? new Date(sessionBounds.first_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
        const logoutTime = sessionBounds && sessionBounds.last_ts ? new Date(sessionBounds.last_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
        const sessionDuration = (sessionBounds && sessionBounds.first_ts && sessionBounds.last_ts) ? Math.round((new Date(sessionBounds.last_ts) - new Date(sessionBounds.first_ts)) / 1000) : 0;

        return {
            type: 'productivity-report',
            title: 'Today\'s Productivity Report',
            date: today,
            summary: this.generateSummaryText(summary, productivityScore),
            topApps: this.formatTopApps(topApps),
            productivityScore: productivityScore.score,
            loginTime,
            logoutTime,
            sessionDuration,
            insights: this.generateInsights(summary, productivityScore, topApps),
            rawData: {
                activities,
                summary,
                productivityScore
            }
        };
    }

    async generateYesterdayReport() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        const activities = await this.db.getActivityByDate(dateStr);
        const summary = await this.db.getDailySummary(dateStr);
        const topApps = await this.db.getTopApps(dateStr, 5);
        const productivityScore = await this.db.getProductivityScore(dateStr);
    const sessionBounds = await this.db.getSessionBounds(dateStr);

    const loginTime = sessionBounds && sessionBounds.first_ts ? new Date(sessionBounds.first_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    const logoutTime = sessionBounds && sessionBounds.last_ts ? new Date(sessionBounds.last_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    const sessionDuration = (sessionBounds && sessionBounds.first_ts && sessionBounds.last_ts) ? Math.round((new Date(sessionBounds.last_ts) - new Date(sessionBounds.first_ts)) / 1000) : 0;

        return {
            type: 'productivity-report',
            title: 'Yesterday\'s Productivity Report',
            date: dateStr,
            summary: this.generateSummaryText(summary, productivityScore),
            topApps: this.formatTopApps(topApps),
            productivityScore: productivityScore.score,
            loginTime,
            logoutTime,
            sessionDuration,
            insights: this.generateInsights(summary, productivityScore, topApps),
            rawData: {
                activities,
                summary,
                productivityScore
            }
        };
    }

    async generateWeekReport() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        
        const activities = await this.db.getActivityByDateRange(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );

        const weekSummary = this.aggregateWeekData(activities);
        
        return {
            type: 'productivity-report',
            title: 'Weekly Productivity Report',
            dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
            summary: this.generateWeeklySummaryText(weekSummary),
            topApps: this.formatTopApps(weekSummary.topApps),
            productivityScore: weekSummary.productivityScore,
            insights: this.generateWeeklyInsights(weekSummary),
            rawData: {
                activities,
                weekSummary
            }
        };
    }

    generateSummaryText(summary, productivityScore) {
        if (!summary || summary.length === 0) {
            return 'No activity recorded for this period.';
        }

        const totalTime = this.formatDuration(productivityScore.total_time);
        const productiveTime = this.formatDuration(productivityScore.productive_time);
        const score = productivityScore.score;

        let text = `You were active for ${totalTime} total. `;
        text += `Productive time: ${productiveTime} (${score}% productivity score). `;

        const categories = summary.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + item.total_duration;
            return acc;
        }, {});

        if (categories.productive) {
            text += `Time spent on productive apps: ${this.formatDuration(categories.productive)}. `;
        }
        
        if (categories.distracting) {
            text += `Time spent on distracting apps: ${this.formatDuration(categories.distracting)}. `;
        }

        return text;
    }

    generateWeeklySummaryText(weekSummary) {
        const totalTime = this.formatDuration(weekSummary.totalTime);
        const avgDaily = this.formatDuration(weekSummary.avgDailyTime);
        const score = weekSummary.productivityScore;

        let text = `This week you were active for ${totalTime} total (${avgDaily} average per day). `;
        text += `Weekly productivity score: ${score}%. `;
        text += `Most productive day: ${weekSummary.mostProductiveDay}. `;

        return text;
    } 

    formatTopApps(topApps) {
        return topApps.map(app => ({
            name: this.formatAppName(app.app_name),
            duration: this.formatDuration(app.total_duration),
            category: app.category,
            productive: app.productive === 1
        }));
    }

    formatAppName(appName) {
        // Convert app names to more readable format
        const nameMap = {
            'code': 'VS Code',
            'chrome': 'Google Chrome',
            'firefox': 'Firefox',
            'msedge': 'Microsoft Edge',
            'notepad++': 'Notepad++',
            'discord': 'Discord',
            'slack': 'Slack',
            'teams': 'Microsoft Teams',
            'spotify': 'Spotify',
            'vlc': 'VLC Media Player'
        };

        return nameMap[appName.toLowerCase()] || this.capitalizeWords(appName);
    }

    capitalizeWords(str) {
        return str.replace(/\b\w/g, l => l.toUpperCase());
    }

    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.round(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.round((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
    }

    generateInsights(summary, productivityScore, topApps) {
        const insights = [];
        
        if (productivityScore.score < 50) {
            insights.push('Your productivity score is below 50%. Consider using focus techniques like the Pomodoro method.');
        } else if (productivityScore.score > 80) {
            insights.push('Excellent productivity score! You\'re staying focused on productive tasks.');
        }

        if (topApps.length > 0) {
            const topApp = topApps[0];
            if (topApp.category === 'distracting') {
                insights.push(`Your most used app was ${topApp.app_name}. Consider setting time limits for distracting apps.`);
            } else if (topApp.category === 'productive') {
                insights.push(`Great job focusing on ${topApp.app_name}! This shows good work discipline.`);
            }
        }

        const distractingTime = summary.find(s => s.category === 'distracting');
        if (distractingTime && distractingTime.total_duration > 3600) { // More than 1 hour
            insights.push('You spent significant time on distracting apps. Try scheduling specific break times.');
        }

        return insights.length > 0 ? insights.join(' ') : 'Keep up the good work with your productivity habits!';
    }

    generateWeeklyInsights(weekSummary) {
        const insights = [];
        
        if (weekSummary.productivityScore > 70) {
            insights.push('Strong weekly productivity! You\'re maintaining good focus habits.');
        } else if (weekSummary.productivityScore < 50) {
            insights.push('This week showed room for improvement. Try setting daily productivity goals.');
        }

        if (weekSummary.mostProductiveDay) {
            insights.push(`${weekSummary.mostProductiveDay} was your most productive day. What made it special?`);
        }

        return insights.length > 0 ? insights.join(' ') : 'Consistent effort leads to great results!';
    }

    aggregateWeekData(activities) {
        const dailyData = {};
        let totalTime = 0;
        let totalProductiveTime = 0;
        const appTotals = {};

        activities.forEach(activity => {
            const date = activity.date;
            
            if (!dailyData[date]) {
                dailyData[date] = { total: 0, productive: 0 };
            }
            
            dailyData[date].total += activity.total_duration;
            totalTime += activity.total_duration;
            
            if (activity.productive) {
                dailyData[date].productive += activity.total_duration;
                totalProductiveTime += activity.total_duration;
            }

            if (!appTotals[activity.app_name]) {
                appTotals[activity.app_name] = {
                    app_name: activity.app_name,
                    total_duration: 0,
                    category: activity.category,
                    productive: activity.productive
                };
            }
            appTotals[activity.app_name].total_duration += activity.total_duration;
        });

        const topApps = Object.values(appTotals)
            .sort((a, b) => b.total_duration - a.total_duration)
            .slice(0, 5);

        const mostProductiveDay = Object.entries(dailyData)
            .sort((a, b) => (b[1].productive / b[1].total) - (a[1].productive / a[1].total))[0]?.[0];

        return {
            totalTime,
            avgDailyTime: totalTime / 7,
            productivityScore: totalTime > 0 ? Math.round((totalProductiveTime / totalTime) * 100) : 0,
            topApps,
            mostProductiveDay: mostProductiveDay ? new Date(mostProductiveDay).toLocaleDateString('en-US', { weekday: 'long' }) : 'N/A',
            dailyBreakdown: dailyData
        };
    }
}

module.exports = ReportGenerator;
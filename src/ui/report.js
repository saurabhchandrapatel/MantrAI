const { ipcRenderer } = require('electron');

const mockData = {
    today: {
        productivityScore: 73,
        totalTime: '6h 42m',
        productiveTime: '4h 15m',
        distractingTime: '1h 23m',
        loginTime: '8:30 AM',
        logoutTime: '6:15 PM',
        sessionDuration: '9h 45m',
        idleTime: '2h 18m',
        apps: [
            { name: 'Visual Studio Code', time: '2h 45m', category: 'productive' },
            { name: 'Google Chrome', time: '1h 30m', category: 'neutral' },
            { name: 'Slack', time: '45m', category: 'neutral' },
            { name: 'YouTube', time: '38m', category: 'distracting' },
            { name: 'Terminal', time: '35m', category: 'productive' }
        ],
        insights: 'Great focus today! You spent 63% of your time in productive applications. Your longest focus session was 1h 45m in VS Code. Consider taking more breaks to maintain peak performance.'
    },
    yesterday: {
        productivityScore: 68,
        totalTime: '7h 15m',
        productiveTime: '4h 55m',
        distractingTime: '1h 45m',
        loginTime: '9:15 AM',
        logoutTime: '7:30 PM',
        sessionDuration: '10h 15m',
        idleTime: '1h 35m',
        apps: [
            { name: 'IntelliJ IDEA', time: '3h 20m', category: 'productive' },
            { name: 'Firefox', time: '1h 45m', category: 'neutral' },
            { name: 'Discord', time: '1h 10m', category: 'distracting' },
            { name: 'Notion', time: '55m', category: 'productive' },
            { name: 'Spotify', time: '35m', category: 'neutral' }
        ],
        insights: 'Solid productivity yesterday. You maintained good focus with development tools. Discord usage was a bit high - consider muting notifications during deep work sessions.'
    },
    week: {
        productivityScore: 71,
        totalTime: '34h 20m',
        productiveTime: '24h 25m',
        distractingTime: '6h 15m',
        loginTime: 'Avg 8:45 AM',
        logoutTime: 'Avg 6:30 PM',
        sessionDuration: 'Avg 9h 45m',
        idleTime: 'Total 12h 30m',
        apps: [
            { name: 'Visual Studio Code', time: '12h 30m', category: 'productive' },
            { name: 'Google Chrome', time: '8h 45m', category: 'neutral' },
            { name: 'Slack', time: '4h 20m', category: 'neutral' },
            { name: 'YouTube', time: '3h 15m', category: 'distracting' },
            { name: 'Terminal', time: '2h 50m', category: 'productive' }
        ],
        insights: 'Excellent week! Your productivity has been consistently high. VS Code dominance shows strong development focus. Try to batch communication tasks to reduce Slack interruptions.'
    }
};

document.getElementById('dateRange').addEventListener('change', function() {
    updateReport(this.value);
});

function updateReport(period) {
    const data = mockData[period] || mockData.today;
    
    // Update stats
    document.querySelector('.productive .stat-value').textContent = data.productivityScore + '%';
    document.querySelectorAll('.stat-value')[1].textContent = data.totalTime;
    document.querySelectorAll('.stat-value')[2].textContent = data.productiveTime;
    document.querySelectorAll('.stat-value')[3].textContent = data.distractingTime;
    
    // Update session times
    document.getElementById('loginTime').textContent = data.loginTime;
    document.getElementById('logoutTime').textContent = data.logoutTime;
    document.getElementById('sessionDuration').textContent = data.sessionDuration;
    document.getElementById('idleTime').textContent = data.idleTime;
    
    // Update app list
    const appList = document.getElementById('appList');
    appList.innerHTML = '';
    
    data.apps.forEach(app => {
        const li = document.createElement('li');
        li.className = 'app-item';
        li.innerHTML = `
            <div>
                <div class="app-name">${app.name}</div>
                <span class="app-category ${app.category}">${app.category.charAt(0).toUpperCase() + app.category.slice(1)}</span>
            </div>
            <div class="app-time">${app.time}</div>
        `;
        appList.appendChild(li);
    });
    
    // Update insights
    document.querySelector('.insights').innerHTML = `<strong>AI Analysis:</strong> ${data.insights}`;
}

// Initialize with today's data
updateReport('today');
// const { ipcRenderer } = require('electron'); // Removed for security

document.getElementById('dateRange').addEventListener('change', function () {
    updateReport(this.value);
});

function secondsToHuman(seconds) {
    if (seconds === null || seconds === undefined) return 'Pending';
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

async function fetchReport(period) {
    try {
        const resp = await window.electronAPI.generateReport(period);
        if (!resp || !resp.success) return { error: resp ? resp.error : 'No response' };
        return resp.report;
    } catch (err) {
        return { error: err.message };
    }
}

async function updateReport(period) {
    const report = await fetchReport(period);

    if (!report || report.error) {
        // show pending / error state
        document.querySelector('.productive .stat-value').textContent = 'Pending';
        document.querySelectorAll('.stat-value')[1].textContent = 'Pending';
        document.querySelectorAll('.stat-value')[2].textContent = 'Pending';
        document.querySelectorAll('.stat-value')[3].textContent = 'Pending';

        document.getElementById('loginTime').textContent = 'Pending';
        document.getElementById('logoutTime').textContent = 'Pending';
        document.getElementById('sessionDuration').textContent = 'Pending';
        document.getElementById('idleTime').textContent = 'Pending';

        document.getElementById('appList').innerHTML = '<li class="app-item">No data available</li>';
        document.querySelector('.insights').innerHTML = `<strong>AI Analysis:</strong> Pending`;
        return;
    }

    // Compute totals from rawData if available
    let totalSeconds = null;
    let productiveSeconds = null;
    let distractingSeconds = null;

    if (report.rawData && report.rawData.productivityScore && report.rawData.productivityScore.total_time !== undefined) {
        totalSeconds = report.rawData.productivityScore.total_time;
        productiveSeconds = report.rawData.productivityScore.productive_time;
        distractingSeconds = report.rawData.productivityScore.unproductive_time;
    } else if (report.rawData && report.rawData.summary && report.rawData.summary.length > 0) {
        totalSeconds = report.rawData.summary.reduce((s, item) => s + (item.total_duration || 0), 0);
        productiveSeconds = report.rawData.summary.filter(i => i.category === 'productive').reduce((s, it) => s + (it.total_duration || 0), 0);
        distractingSeconds = report.rawData.summary.filter(i => i.category === 'distracting').reduce((s, it) => s + (it.total_duration || 0), 0);
    }

    // Update stats
    const score = typeof report.productivityScore === 'number' ? report.productivityScore : (report.productivityScore && report.productivityScore.score) || 'Pending';
    document.querySelector('.productive .stat-value').textContent = (typeof score === 'number' ? `${score}%` : 'Pending');
    document.querySelectorAll('.stat-value')[1].textContent = totalSeconds ? secondsToHuman(totalSeconds) : 'Pending';
    document.querySelectorAll('.stat-value')[2].textContent = productiveSeconds ? secondsToHuman(productiveSeconds) : 'Pending';
    document.querySelectorAll('.stat-value')[3].textContent = distractingSeconds ? secondsToHuman(distractingSeconds) : 'Pending';

    // Session times (from DB session bounds when available)
    document.getElementById('loginTime').textContent = report.loginTime || 'Pending';
    document.getElementById('logoutTime').textContent = report.logoutTime || 'Pending';
    document.getElementById('sessionDuration').textContent = (report.sessionDuration ? secondsToHuman(report.sessionDuration) : 'Pending');
    document.getElementById('idleTime').textContent = 'Pending';

    // Update app list
    const appList = document.getElementById('appList');
    appList.innerHTML = '';
    const apps = report.topApps && report.topApps.length ? report.topApps : (report.rawData && report.rawData.activities ? report.rawData.activities : []);

    if (!apps || apps.length === 0) {
        appList.innerHTML = '<li class="app-item">No app activity recorded for this period.</li>';
    } else {
        apps.forEach(app => {
            const li = document.createElement('li');
            li.className = 'app-item';
            const displayName = app.name || app.app_name || 'Unknown';
            const duration = app.duration || app.total_duration || app.time || 'Pending';
            const category = app.category || 'neutral';
            li.innerHTML = `
                <div>
                    <div class="app-name">${displayName}</div>
                    <span class="app-category ${category}">${(category.charAt(0) || '').toUpperCase() + (category.slice(1) || '')}</span>
                </div>
                <div class="app-time">${typeof duration === 'number' ? secondsToHuman(duration) : duration}</div>
            `;
            appList.appendChild(li);
        });
    }

    // Update insights
    document.querySelector('.insights').innerHTML = `<strong>AI Analysis:</strong> ${report.insights || 'Pending'}`;
}

// Initialize with today's data
updateReport('today');
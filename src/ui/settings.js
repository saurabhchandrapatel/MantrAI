// const { ipcRenderer } = require('electron'); // Removed for security

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');
}

// Provider switching
document.getElementById('provider').addEventListener('change', function () {
    const provider = this.value;
    document.querySelectorAll('.provider-config').forEach(el => el.classList.remove('active'));
    document.getElementById(provider + '-config').classList.add('active');
});

// Toggle switches
document.querySelectorAll('.switch').forEach(toggle => {
    toggle.addEventListener('click', function () {
        this.classList.toggle('active');
    });
});


async function saveSettings() {
    const provider = document.getElementById('provider').value;
    const settings = {
        provider,
        tracking: {
            enabled: document.getElementById('trackingEnabled').classList.contains('active'),
            interval: parseInt(document.getElementById('trackingInterval').value),
            idleThreshold: parseInt(document.getElementById('idleThreshold').value),
            productiveApps: document.getElementById('productiveApps').value.split(',').map(s => s.trim()),
            distractingApps: document.getElementById('distractingApps').value.split(',').map(s => s.trim())
        },
        notifications: {
            dailyReports: document.getElementById('dailyReports').classList.contains('active'),
            breakReminders: document.getElementById('breakReminders').classList.contains('active'),
            focusAlerts: document.getElementById('focusAlerts').classList.contains('active'),
            reportTime: document.getElementById('reportTime').value,
            breakInterval: parseInt(document.getElementById('breakInterval').value)
        },
        privacy: {
            shareAnalytics: document.getElementById('shareAnalytics').classList.contains('active'),
            dataRetention: parseInt(document.getElementById('dataRetention').value)
        }
    };

    if (provider === 'openai') {
        settings.apiKey = document.getElementById('openai-key').value;
        settings.model = document.getElementById('openai-model').value;
    } else if (provider === 'ollama') {
        settings.url = document.getElementById('ollama-url').value;
        settings.model = document.getElementById('ollama-model').value;
    } else if (provider === 'proxy') {
        settings.url = document.getElementById('proxy-url').value;
        settings.apiKey = document.getElementById('proxy-key').value;
    }

    await window.electronAPI.saveSettings(settings);
    alert('✅ Settings saved successfully!');
}

async function testConnection() {
    const result = await window.electronAPI.testLLMConnection();
    alert(result.success ? '✅ Connection successful!' : '❌ Connection failed: ' + result.error);
}

function resetDefaults() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        location.reload();
    }
}

function exportData() {
    window.electronAPI.exportUserData().then(result => {
        alert(result.success ? '✅ Data exported successfully!' : '❌ Export failed: ' + result.error);
    });
}

function clearData() {
    if (confirm('Clear all tracking data? This cannot be undone.')) {
        window.electronAPI.clearUserData().then(result => {
            alert(result.success ? '✅ Data cleared successfully!' : '❌ Clear failed: ' + result.error);
        });
    }
}

// Load current settings
window.electronAPI.getAllSettings().then(settings => {
    if (settings) {
        // AI settings
        document.getElementById('provider').value = settings.provider || 'openai';
        document.getElementById('provider').dispatchEvent(new Event('change'));

        if (settings.provider === 'openai') {
            document.getElementById('openai-key').value = settings.apiKey || '';
            document.getElementById('openai-model').value = settings.model || 'gpt-3.5-turbo';
        } else if (settings.provider === 'ollama') {
            document.getElementById('ollama-url').value = settings.url || 'http://localhost:11434';
            document.getElementById('ollama-model').value = settings.model || 'llama2';
        } else if (settings.provider === 'proxy') {
            document.getElementById('proxy-url').value = settings.url || '';
            document.getElementById('proxy-key').value = settings.apiKey || '';
        }

        // Tracking settings
        if (settings.tracking) {
            if (!settings.tracking.enabled) document.getElementById('trackingEnabled').classList.remove('active');
            document.getElementById('trackingInterval').value = settings.tracking.interval || 10;
            document.getElementById('idleThreshold').value = settings.tracking.idleThreshold || 300;
            document.getElementById('productiveApps').value = (settings.tracking.productiveApps || []).join(', ');
            document.getElementById('distractingApps').value = (settings.tracking.distractingApps || []).join(', ');
        }

        // Notification settings
        if (settings.notifications) {
            if (!settings.notifications.dailyReports) document.getElementById('dailyReports').classList.remove('active');
            if (settings.notifications.breakReminders) document.getElementById('breakReminders').classList.add('active');
            if (!settings.notifications.focusAlerts) document.getElementById('focusAlerts').classList.remove('active');
            document.getElementById('reportTime').value = settings.notifications.reportTime || '18:00';
            document.getElementById('breakInterval').value = settings.notifications.breakInterval || 60;
        }

        // Privacy settings
        if (settings.privacy) {
            if (settings.privacy.shareAnalytics) document.getElementById('shareAnalytics').classList.add('active');
            document.getElementById('dataRetention').value = settings.privacy.dataRetention || 90;
        }
    }
});
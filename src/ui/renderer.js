
class FloatingAssistantUI {
    constructor() {
        console.log('FloatingAssistantUI constructor called');
        
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.fileUploadBtn = document.getElementById('file-upload-btn');
        this.fileInput = document.getElementById('file-input');
        
        this.currentFile = null;
        this.resultsContainer = document.getElementById('results-container');
        this.resultsContent = document.getElementById('results-content');
        this.closeBtn = document.getElementById('close-btn');
        this.copyBtn = document.getElementById('copy-btn');
        this.loading = document.getElementById('loading');
        this.captureContextBtn = document.getElementById('capture-context-btn');
        this.clearContextBtn = document.getElementById('clear-context-btn');
        this.contextContainer = document.getElementById('context-container');
        this.contextContent = document.getElementById('context-content');
        
        console.log('Elements found:', {
            searchInput: !!this.searchInput,
            searchBtn: !!this.searchBtn,
            resultsContainer: !!this.resultsContainer,
            captureContextBtn: !!this.captureContextBtn
        });
        
        this.currentResponse = '';
        this.currentContext = null;
        
        this.searchInput = document.getElementById('search-input');
        this.suggestionsContainer = document.getElementById('suggestions');
 
        this.agentBtn = document.getElementById('agent-btn');
        this.appsBtn = document.getElementById('apps-btn');
        this.fileUploadBtn = document.getElementById('file-upload-btn');
        this.fileInput = document.getElementById('file-input');

        this.mode = 'agent'; // 'agent' | 'apps' | 'file'
        this.installedApps = [];
        this.filteredApps = [];
        this.isLaunching = false;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIPCListeners();

        await this.loadInstalledApps();
        console.log('installedApps count:', this.installedApps.length);

        // Listen for progressive background updates (icons) from main process
        try {
            if (window.installedAppsAPI && window.installedAppsAPI.onUpdated) {
                window.installedAppsAPI.onUpdated((event, updated) => {
                    try {
                        this.installedApps = Array.isArray(updated) ? updated : this.installedApps;
                        console.log('installedApps updated (bg):', this.installedApps.length);
                        const q = this.searchInput.value || '';
                        if (q && this.mode === 'apps') {
                            const matches = this.filterApps(q);
                            this.showSuggestions(matches);
                        }
                    } catch (e) {
                        console.warn('installedAppsAPI.onUpdated handler error', e);
                    }
                });
            }
        } catch (e) {
            console.warn('failed to hook installedAppsAPI', e);
        }

        this.focusInput();

    }

    async loadInstalledApps() {
        try {
            if (window.system && window.system.getInstalledApps) {
                this.installedApps = await window.system.getInstalledApps();
                console.log('installedApps count:', this.installedApps.length);
            }
        } catch (err) {
            console.error('loadInstalledApps error', err);
            this.installedApps = [];
        }
    }

    setMode(newMode) {
        this.mode = newMode;
        // UI active state
        this.agentBtn.classList.toggle('active', newMode === 'agent');
        this.appsBtn.classList.toggle('active', newMode === 'apps');
        // adjust placeholder
        if (newMode === 'agent') this.searchInput.placeholder = "Ask the assistant...";
        else if (newMode === 'apps') this.searchInput.placeholder = "Search installed apps...";
        else if (newMode === 'file') this.searchInput.placeholder = "Upload a file to ask questions about it...";
        this.showSuggestions([]); // clear
    }

    filterApps(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.installedApps.filter(a => {
            const name = (a.Name || a.appName || '').toLowerCase();
            const pid = (a.AppID || a.DisplayIcon || '').toLowerCase();
            return name.includes(q) || pid.includes(q);
        }).slice(0, 8);
    }

    pickColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue} 60% 35%)`;
    }
    // helper: generate circular avatar data URL with initial
    generateAvatarDataUrl(name, size = 32) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const bg = this.pickColor(name || 'A');
        // circle background
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
        // initial
        const initial = (name || '?').trim().charAt(0).toUpperCase();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(size * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, size/2, size/2 + 1);
        return canvas.toDataURL();
    }


    showSuggestions(list) {
        if (!this.suggestionsContainer) return;
        if (!list || list.length === 0) {
            this.suggestionsContainer.style.display = 'none';
            this.suggestionsContainer.innerHTML = '';
            return;
        }
        this.suggestionsContainer.innerHTML = list.map(a => {
            const name = a.Name || a.appName || a.DisplayName || '';
            const appId = a.AppID || a.DisplayIcon || a.appIdentifier || '';
            const icon = a.Icon || a.DisplayIcon || ''; // may be path or dataURL; renderer expects dataURL or fallback
            const iconHtml = icon ? `<img class="suggestion-icon" src="${icon}" />` : `<div class="suggestion-icon">${(name||'?').charAt(0)}</div>`;
            return `
                <div class="suggestion-item" data-appid="${appId}" data-name="${name}">
                    ${iconHtml}
                    <span class="suggestion-name">${name}</span>
                </div>
            `;
        }).join('');
        this.suggestionsContainer.style.display = 'block';
    }

    setupEventListeners() {
        // Enter key or click
        const submit = async () => {
            const query = this.searchInput.value.trim();
            if (!query) return;
            if (this.mode === 'agent') {
                // send to LLM
                try {
                    if (this.showLoading) this.showLoading();

                    let response = null;

                    // Preferred: system API exposed by preload
                    if (window.system && typeof window.system.processQuery === 'function') {
                        response = await window.system.processQuery(query);
                    }
                    // Next: electronAPI bridge
                    else if (window.electronAPI && typeof window.electronAPI.processQuery === 'function') {
                        response = await window.electronAPI.processQuery(query);
                    }
                    // Older fallback: ipc invoke wrapper if present
                    else if (window.api && typeof window.api.invoke === 'function') {
                        response = await window.api.invoke('process-query', { query, context: null });
                    }
                    // Final fallback: demo responder
                    else {
                        response = this.getDemoResponse(query);
                    }

                    this.displayResults(response);
                } catch (err) {
                    console.error('process-query error', err);
                    this.displayError('Failed to contact assistant. See console for details.');
                } finally {
                    if (this.hideLoading) this.hideLoading();
                }
            } else if (this.mode === 'apps') {
                // if exact match, launch first result
                const matches = this.filterApps(query);
                if (matches.length > 0) {
                    await this.launchApp(matches[0]);
                }
            }
        };

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submit();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.searchInput.value = '';
                this.showSuggestions([]);
            }
        });
       


        this.agentBtn.addEventListener('click', () => {
            this.setMode('agent');
            this.hideResults();
            this.searchInput.focus();
        });
        this.appsBtn.addEventListener('click', () => {
            this.setMode('apps');
            this.hideResults();
            this.searchInput.focus();
        });

        this.fileUploadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const text = await f.text();
            // send file context to main
            await window.system?.setFileContext?.({ filename: f.name, content: text });
            this.setMode('agent'); // switch to agent so user can ask about file
            this.searchInput.focus();
        });

        // this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.settingsBtn.addEventListener('click', () => {
            this.hideResults();
            this.searchInput.focus();
        });

        this.captureContextBtn.addEventListener('click', () => this.captureContext());
        this.clearContextBtn.addEventListener('click', () => this.clearContext());
        this.closeBtn.addEventListener('click', () => this.hideResults());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        const resizeObserver = new ResizeObserver(() => this.updateWindowSize());
        resizeObserver.observe(document.body);
        // input handling
        this.searchInput.addEventListener('input', (e) => {
            const v = e.target.value;
            if (this.mode === 'apps') {
                const matches = this.filterApps(v);
                this.showSuggestions(matches);
            } else {
                // hide suggestions in agent mode (or implement LLM prompt suggestions)
                this.showSuggestions([]);
            }
        });


        

        this.searchBtn.addEventListener('click', submit);
        // Handle clicking outside suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.suggestions-container') && !e.target.closest('#search-input')) {
                if (this.suggestionsContainer) this.suggestionsContainer.style.display = 'none';
            }
        });

        // Handle clicking on a suggestion
        if (this.suggestionsContainer) {
           
            this.suggestionsContainer.addEventListener('click', async (e) => {
            const item = e.target.closest('.suggestion-item');
            if (!item || this.isLaunching) return;
            try {
                this.isLaunching = true;
                const appId = item.dataset.appid;
                const name = item.dataset.name || '';
                await this.launchApp({ AppID: appId, Name: name });
                this.searchInput.value = '';
                this.showSuggestions([]);
            } finally {
                setTimeout(() => { this.isLaunching = false; }, 800);
            }
        });

    }

    }

    setupIPCListeners() {
        if (window.electronAPI) {
            window.electronAPI.onWindowShown(() => {
                this.focusInput();
                this.hideResults();
                this.clearContext();
            });

            window.electronAPI.onWindowHidden(() => {
                this.clearInput();
                this.hideResults();
                this.clearContext();
            });

            window.electronAPI.onShowReport((event, reportData) => {
                this.displayProductivityReport(reportData);
            });

            window.electronAPI.onFocusModeStarted(() => {
                this.showFocusModeNotification();
            });
        }
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.showLoading();
        
        // Add file context indicator if a file is loaded
        let fullQuery = query;
        if (this.currentFile) {
            fullQuery = `[File: ${this.currentFile.name}] ${query}`;
        }
        
        try {
            if (window.electronAPI) {
                const response = await window.electronAPI.processQuery(fullQuery, this.currentFile ? this.currentFile.content : this.currentContext);
                this.displayResults(response);
            } else {
                const response = this.getDemoResponse(fullQuery);
                this.displayResults(response);
            }
        } catch (error) {
            console.error('Search error:', error);
            this.displayError('Failed to process query. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    async handleSettingsPage() {
        
        // todo open settings page

        // if (window.electronAPI) {
        //     window.electronAPI.openSettings();
        // } else {
        //     this.displayError('Settings page not available in demo mode.');
        // }
    }

    async captureContext() {
        this.showLoading();
        try {
            if (window.screenContext) {
                const context = await window.screenContext.get(true); // true for OCR
                this.currentContext = context;
                this.displayContext(context);
                await window.electronAPI.addContext(context); // Send to main process
            } else {
                this.displayError('Context capture not available.');
            }
        } catch (error) {
            console.error('Context capture error:', error);
            this.displayError('Failed to capture screen context.');
        } finally {
            this.hideLoading();
        }
    }

    displayContext(context) {
        let html = '<ul>';
        if (context.window) {
            html += `<li><strong>Window:</strong> ${context.window.app} - ${context.window.title}</li>`;
        }
        if (context.clipboardText) {
            html += `<li><strong>Clipboard:</strong> ${context.clipboardText.substring(0, 100)}...</li>`;
        }
        if (context.ocrText) {
            html += `<li><strong>Screen Text (OCR):</strong> ${context.ocrText.substring(0, 200)}...</li>`;
        }
        html += '</ul>';
        
        this.contextContent.innerHTML = html;
        this.contextContainer.classList.remove('hidden');
        this.updateWindowSize();
    }

    clearContext() {
        this.currentContext = null;
        this.contextContainer.classList.add('hidden');
        if (window.electronAPI) {
            window.electronAPI.clearContext();
        }
        this.updateWindowSize();
    }

    getDemoResponse(query) {
        if (query.toLowerCase().includes('report')) {
            return {
                type: 'productivity-report',
                title: 'Demo Productivity Report',
                summary: 'This is a demo response for testing.',
                topApps: [
                    { name: 'VS Code', duration: '2h 30m' },
                    { name: 'Chrome', duration: '1h 15m' }
                ],
                insights: 'Demo mode active. Install Electron for full functionality.'
            };
        }
        return `Demo response for: "${query}". This shows the UI is working correctly.`;
    }

    displayResults(response) {
        this.currentResponse = response;
        
        if (typeof response === 'object' && response.type === 'productivity-report') {
            this.displayProductivityReport(response);
        } else {
            const formattedResponse = this.formatResponse(response);
            this.resultsContent.innerHTML = `
                <div class="ai-response">
                    <div class="response-header">
                        🤖 AI Assistant
                    </div>
                    <div class="response-content">
                        ${formattedResponse}
                    </div>
                </div>
            `;
        }
        
        this.showResults();
        this.updateWindowSize();
    }

    displayProductivityReport(reportData) {
        const html = `
            <div class="productivity-report">
                <div class="report-header">
                    📊 ${reportData.title || 'Productivity Report'}
                </div>
                
                <div class="report-section">
                    <h4>📈 Summary</h4>
                    <p>${reportData.summary || 'No activity data available.'}</p>
                </div>

                ${reportData.topApps ? `
                <div class="report-section">
                    <h4>🏆 Top Applications</h4>
                    ${reportData.topApps.map(app => `
                        <div class="app-item">
                            <span class="app-name">${app.name}</span>
                            <span class="app-time">${app.duration}</span>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                ${reportData.insights ? `
                <div class="suggestion-box">
                    <div class="title">💡 AI Insights</div>
                    <div class="content">${reportData.insights}</div>
                </div>
                ` : ''}
            </div>
        `;
        
        this.resultsContent.innerHTML = html;
        this.showResults();
        this.updateWindowSize();
    }

    formatResponse(response) {
        if (typeof response === 'string') {
            return this.parseMarkdown(response);
        }
        return JSON.stringify(response, null, 2);
    }

    parseMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n/g, '<br>');
    }

    displayError(message) {
        this.resultsContent.innerHTML = `
            <div style="color: #e74c3c; padding: 12px; text-align: center;">
                ⚠️ ${message}
            </div>
        `;
        this.showResults();
    }

    showResults() {
        if (this.resultsContainer && this.resultsContainer.classList) {
            this.resultsContainer.classList.remove('hidden');
        }
    }

    hideResults() {
        if (this.resultsContainer && this.resultsContainer.classList) {
            this.resultsContainer.classList.add('hidden');
        }
        if (this.updateWindowSize) this.updateWindowSize();
    }

    showLoading() {
        try {
            if (this.loading && this.loading.classList) this.loading.classList.remove('hidden');
        } catch (e) {
            console.warn('showLoading: loading element not available', e);
        }
        // hide results if present
        try {
            if (this.hideResults) this.hideResults();
            else if (this.resultsContainer && this.resultsContainer.classList) this.resultsContainer.classList.add('hidden');
        } catch (e) {
            console.warn('showLoading: unable to hide results', e);
        }
        // hide context container if present
        try {
            if (this.contextContainer && this.contextContainer.classList) this.contextContainer.classList.add('hidden');
        } catch (e) {
            console.warn('showLoading: contextContainer not available', e);
        }
        if (this.updateWindowSize) this.updateWindowSize();
    }

    hideLoading() {
        try {
            if (this.loading && this.loading.classList) this.loading.classList.add('hidden');
        } catch (e) {
            console.warn('hideLoading: loading element not available', e);
        }
    }

    focusInput() {
        setTimeout(() => this.searchInput.focus(), 100);
    }

    clearInput() {
        this.searchInput.value = '';
    }

    hideWindow() {
        if (window.electronAPI) {
            window.electronAPI.hideWindow();
        }
    }

    async launchApp(app) {
        try {
            // use exposed API from preload
            if (window.system && window.system.launchApp) {
                return await window.system.launchApp(app);
            }
            // fallback: use ipc
            return await window.api.invoke('launch-app', app);
        } catch (err) {
            console.error('launch-app error', err);
            return false;
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Update button to show selected file
            this.fileUploadBtn.innerHTML = `
                <svg class="option-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <span class="file-name">${file.name}</span>
            `;
            
            this.currentFile = file;
            this.searchInput.placeholder = `Ask a question about ${file.name}...`;
            
            // Store file content in memory
            const reader = new FileReader();
            reader.onload = async (e) => {
                const content = e.target.result;
                if (window.electronAPI) {
                    await window.electronAPI.setFileContext(file.name, content);
                }
            };
            reader.readAsText(file);
            
        } catch (error) {
            console.error('Error handling file:', error);
            this.displayError('Failed to process file. Please try again.');
        }
    }

    handleSettingsPage() {
        if (window.electronAPI) {
            window.electronAPI.openSettings();
            this.hideWindow(); // Hide the main window when opening settings
        }
    }

    updateWindowSize() {
        const height = document.body.scrollHeight + 40; // Add padding
        if (window.electronAPI) {
            // allow up to 800px or adjust as needed
            window.electronAPI.resizeWindow(Math.max(250, Math.min(800, height)));
        }
    }


    copyToClipboard() {
        if (this.currentResponse) {
            navigator.clipboard.writeText(this.currentResponse).then(() => {
                this.copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    this.copyBtn.textContent = 'Copy';
                }, 2000);
            });
        }
    }

    showFocusModeNotification() {
        this.resultsContent.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                🎯 <strong>Focus Mode Started</strong><br>
                <small>Distracting apps will be tracked. Stay focused!</small>
            </div>
        `;
        this.showResults();
        
        setTimeout(() => this.hideResults(), 3000);
    }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const ui = new FloatingAssistantUI();
    ui.init().catch(err => console.error('ui.init error', err));
})
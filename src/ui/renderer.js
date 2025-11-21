
class MantraAIAssistantUI {
    constructor() {
        console.log('MantraAI constructor called');

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
        this.currentResponse = '';
        this.currentContext = null;


        this.suggestionsContainer = document.getElementById('suggestions');
        this.contextIndicator = document.getElementById('context-indicator');

        this.agentBtn = document.getElementById('agent-btn');
        this.askBtn = document.getElementById('ask-btn');
        this.appsBtn = document.getElementById('apps-btn');
        this.fileUploadBtn = document.getElementById('file-upload-btn');
        this.fileInput = document.getElementById('file-input');

        // this.mode = 'agent'; // 'agent' | 'apps' | 'ask' | 'file'
        this.mode = 'ask';
        this.installedApps = [];
        this.filteredApps = [];
        this.isLaunching = false;

        // 🚀 Agentic features
        this.workflows = [];
        this.dailyGoals = [];
        this.agentState = {};
        this.chatHistory = [];

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIPCListeners();

        await this.loadInstalledApps();
        console.log('installedApps count:', this.installedApps.length);

        // 🚀 Load agentic data
        await this.loadAgenticData();

        // Listen for progressive background updates (icons) from main process
        try {
            if (window.installedAppsAPI && window.installedAppsAPI.onUpdated) {
                window.installedAppsAPI.onUpdated((event, updated) => {
                    try {
                        this.installedApps = Array.isArray(updated) ? updated : this.installedApps;
                        console.log('installedApps updated (bg):', this.installedApps.length);
                        const q = this.searchInput.value || '';

                        if (q && (this.mode === 'apps' || this.mode === 'ask')) {
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

        // Reflect current context/file state in the indicator
        this.updateContextIndicator();

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
        this.askBtn.classList.toggle('active', newMode === 'ask');
        this.appsBtn.classList.toggle('active', newMode === 'apps');
        // adjust placeholder
        if (newMode === 'agent') this.searchInput.placeholder = "Ask the assistant do to your task...";
        else if (newMode === 'ask') this.searchInput.placeholder = "Ask about anything...";
        else if (newMode === 'apps') this.searchInput.placeholder = "Search installed apps...";
        else if (newMode === 'file') this.searchInput.placeholder = "Upload a file to ask questions about it...";
        this.showSuggestions([]); // clear

        if (newMode === 'ask') {
            this.renderChatHistory();
        }
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
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        // initial
        const initial = (name || '?').trim().charAt(0).toUpperCase();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(size * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, size / 2, size / 2 + 1);
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
            const iconHtml = icon ? `<img class="suggestion-icon" src="${icon}" />` : `<div class="suggestion-icon">${(name || '?').charAt(0)}</div>`;
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
            if (!this.searchInput) return;
            const query = this.searchInput.value.trim();
            if (!query) return;
            if (this.mode === 'ask') {
                this.appendMessage('user', query);
                this.searchInput.value = ''; // Clear input

                const loadingId = this.appendMessage('ai', '...', true);

                try {
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

                    this.removeMessage(loadingId);
                    this.appendMessage('ai', response);

                } catch (err) {
                    console.error('process-query error', err);
                    this.removeMessage(loadingId);
                    this.appendMessage('ai', 'Sorry, something went wrong.');
                }
            }
            else if (this.mode === 'agent') {
                this.searchInput.value = ''; // Clear input
                // 🚀 Enhanced agentic processing
                try {
                    if (this.showLoading) this.showLoading();

                    // Use enhanced agentic query processing
                    const response = await this.processAgenticQuery(query);

                    if (response) {
                        this.displayResults(response);
                    }

                } catch (err) {
                    console.error('agentic processing error', err);
                    this.displayError('Failed to process agentic task. See console for details.');
                } finally {
                    if (this.hideLoading) this.hideLoading();
                }

            }
            else if (this.mode === 'apps') {
                this.searchInput.value = ''; // Clear input
                // if exact match, launch first result
                const matches = this.filterApps(query);
                if (matches.length > 0) {
                    await this.launchApp(matches[0]);
                }
            }
        };

        if (this.searchInput) {
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    submit();
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    this.searchInput.value = '';
                    this.showSuggestions([]);
                }
            });
        } else {
            console.warn('setupEventListeners: searchInput element not found');
        }


        if (this.askBtn) {
            this.askBtn.addEventListener('click', () => {
                this.setMode('ask');
                // this.hideResults(); // Managed by renderChatHistory
                if (this.searchInput) this.searchInput.focus();
            });
        } else console.warn('setupEventListeners: askBtn not found');

        if (this.agentBtn) {
            this.agentBtn.addEventListener('click', () => {
                this.setMode('agent');
                this.hideResults();
                if (this.searchInput) this.searchInput.focus();
            });
        } else console.warn('setupEventListeners: agentBtn not found');

        if (this.appsBtn) {
            this.appsBtn.addEventListener('click', () => {
                this.setMode('apps');
                this.hideResults();
                if (this.searchInput) this.searchInput.focus();
            });
        } else console.warn('setupEventListeners: appsBtn not found');

        if (this.fileUploadBtn) {
            this.fileUploadBtn.addEventListener('click', () => {
                if (this.fileInput) this.fileInput.click();
            });
        } else console.warn('setupEventListeners: fileUploadBtn not found');

        // Use a single handler for file/folder uploads (supports multiple files via webkitdirectory)
        if (this.fileInput) {
            this.fileInput.addEventListener('change', this.handleFileUpload.bind(this));
        } else console.warn('setupEventListeners: fileInput not found');

        // this.searchBtn.addEventListener('click', () => this.handleSearch());
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => {
                this.hideResults();
                if (this.searchInput) this.searchInput.focus();
            });
        } else console.warn('setupEventListeners: settingsBtn not found');

        if (this.captureContextBtn) {
            this.captureContextBtn.addEventListener('click', () => this.captureContext());
        } else console.warn('setupEventListeners: captureContextBtn not found');

        if (this.clearContextBtn) {
            this.clearContextBtn.addEventListener('click', () => this.clearContext());
        } else console.warn('setupEventListeners: clearContextBtn not found');

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hideResults());
        } else console.warn('setupEventListeners: closeBtn not found');

        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        } else console.warn('setupEventListeners: copyBtn not found');
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
                let response;
                // If we have a file context loaded, try RAG first
                if (this.currentFile && window.electronAPI.queryVectorStore) {
                    console.log('Using RAG query for file context');
                    response = await window.electronAPI.queryVectorStore(query);
                } else {
                    response = await window.electronAPI.processQuery(fullQuery, this.currentFile ? this.currentFile.content : this.currentContext);
                }
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
        if (window.electronAPI && typeof window.electronAPI.openSettings === 'function') {
            // ask main process to open the settings window and hide the assistant
            window.electronAPI.openSettings();
            this.hideWindow();
        } else {
            this.displayError('Settings page not available in this environment.');
        }
    }

    async captureContext() {
        this.showLoading();
        try {
            if (window.screenContext) {
                const context = await window.screenContext.get(true); // true for OCR
                if (!context) {
                    this.displayError('No screen content found. Try capturing again or ensure the screen is visible.');
                    return;
                }
                this.currentContext = context;
                this.displayContext(context);
                // Send to main process and check response
                if (window.electronAPI && typeof window.electronAPI.addContext === 'function') {
                    const res = await window.electronAPI.addContext(context);
                    if (!res || !res.success) {
                        this.displayError('Failed to attach context to assistant. See console for details.');
                        console.warn('addContext response:', res);
                    } else {
                        this.updateContextIndicator();
                    }
                }
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
        if (this.contextContent) this.contextContent.innerHTML = html;
        if (this.contextContainer && this.contextContainer.classList) this.contextContainer.classList.remove('hidden');
        this.updateWindowSize();
    }

    clearContext() {
        this.currentContext = null;
        if (this.contextContainer && this.contextContainer.classList) this.contextContainer.classList.add('hidden');
        if (window.electronAPI) {
            window.electronAPI.clearContext().then(() => this.updateContextIndicator()).catch(() => this.updateContextIndicator());
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
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        try {
            this.showLoading();

            // 🚀 RAG: Upload to Vector Store if available
            if (window.electronAPI && window.electronAPI.uploadDocument) {
                let uploadedCount = 0;
                for (const file of files) {
                    // file.path is available in Electron renderer
                    if (file.path) {
                        console.log(`Uploading to Vector Store: ${file.path}`);
                        const res = await window.electronAPI.uploadDocument(file.path);
                        if (res && res.success) uploadedCount++;
                    }
                }
                console.log(`Uploaded ${uploadedCount} documents to ChromaDB`);
            }

            // Existing logic for UI feedback & fallback context
            // If multiple files (folder), prepare a bulk payload
            const readFile = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                // decide text vs binary
                const isText = file.type.startsWith('text') || /\.(txt|md|json|js|py|csv|log)$/i.test(file.name);
                reader.onload = (e) => {
                    let content = e.target.result;
                    if (!isText && content instanceof ArrayBuffer) {
                        // convert to base64
                        const bytes = new Uint8Array(content);
                        let binary = '';
                        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                        content = btoa(binary);
                    }
                    resolve({ name: file.name, content, isBinary: !isText, size: file.size });
                };
                reader.onerror = reject;
                if (isText) reader.readAsText(file);
                else reader.readAsArrayBuffer(file);
            });

            const filesPayload = await Promise.all(files.map(f => readFile(f)));

            // Update UI showing folder / multiple files
            const summaryName = files.length > 1 ? `Folder: ${files.length} files` : files[0].name;
            this.fileUploadBtn.innerHTML = `<span class="file-name">${summaryName}</span>`;
            this.currentFile = { name: summaryName, filesCount: files.length };
            this.searchInput.placeholder = `Ask a question about ${summaryName}...`;

            // Send structured payload to main process (bulk) - KEEPING THIS FOR NON-RAG CONTEXT FALLBACK
            if (window.electronAPI && typeof window.electronAPI.setFileContextBulk === 'function') {
                await window.electronAPI.setFileContextBulk({ files: filesPayload });
                this.updateContextIndicator();
            }

            // Switch to agent mode so user can ask about uploaded files
            this.setMode('agent');
            this.hideLoading();
            this.searchInput.focus();

        } catch (error) {
            console.error('Error handling files:', error);
            this.displayError('Failed to process uploaded files. Please try again.');
            this.hideLoading();
        }
    }


    updateWindowSize() {
        const height = document.body.scrollHeight + 40; // Add padding
        if (window.electronAPI) {
            // allow up to 800px or adjust as needed
            window.electronAPI.resizeWindow(Math.max(250, Math.min(800, height)));
        }
    }

    updateContextIndicator() {
        try {
            if (!this.contextIndicator) return;
            if (this.currentFile || this.currentContext) {
                // show brief label
                let text = 'Context attached';
                if (this.currentFile) {
                    if (this.currentFile.filesCount) text = `${this.currentFile.filesCount} files attached`;
                    else if (this.currentFile.name) text = this.currentFile.name;
                }
                this.contextIndicator.textContent = text;
                this.contextIndicator.classList.remove('hidden');
            } else {
                this.contextIndicator.classList.add('hidden');
            }
        } catch (e) {
            console.warn('updateContextIndicator error', e);
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

    // 🚀 CHAT METHODS
    renderChatHistory() {
        this.resultsContent.innerHTML = '<div class="chat-container"></div>';
        const container = this.resultsContent.querySelector('.chat-container');

        if (this.chatHistory.length === 0) {
            this.chatHistory.push({ role: 'ai', content: 'Hello! How can I help you today?' });
        }

        this.chatHistory.forEach(msg => {
            const el = this.createMessageElement(msg.role, msg.content);
            container.appendChild(el);
        });

        this.showResults();
        this.scrollToBottom();
    }

    appendMessage(role, content, isLoading = false) {
        if (!isLoading) {
            this.chatHistory.push({ role, content });
        }

        let container = this.resultsContent.querySelector('.chat-container');
        if (!container) {
            this.resultsContent.innerHTML = '<div class="chat-container"></div>';
            container = this.resultsContent.querySelector('.chat-container');
        }

        const el = this.createMessageElement(role, content);
        if (isLoading) {
            el.id = 'chat-loading-' + Date.now();
            el.classList.add('loading-message');
        }
        container.appendChild(el);
        this.showResults();
        this.scrollToBottom();
        return el.id;
    }

    removeMessage(id) {
        if (!id) return;
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    createMessageElement(role, content) {
        const div = document.createElement('div');
        div.className = `chat-message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? '👤' : '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (typeof content === 'string') {
            bubble.innerHTML = this.parseMarkdown(content);
        } else {
            if (content.type === 'productivity-report') {
                bubble.innerHTML = `<strong>${content.title}</strong><br>${content.summary}`;
            } else {
                bubble.textContent = JSON.stringify(content);
            }
        }

        div.appendChild(avatar);
        div.appendChild(bubble);
        return div;
    }

    scrollToBottom() {
        setTimeout(() => {
            if (this.resultsContent) {
                const lastMessage = this.resultsContent.querySelector('.chat-message:last-child');
                if (lastMessage) {
                    lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
                } else {
                    this.resultsContent.scrollTop = this.resultsContent.scrollHeight;
                }
            }
            this.updateWindowSize();
        }, 100);
    }

    // 🚀 NEW AGENTIC METHODS

    async loadAgenticData() {
        try {
            if (window.electronAPI) {
                this.workflows = await window.electronAPI.getWorkflows() || [];
                this.dailyGoals = await window.electronAPI.getDailyGoals() || [];
                this.agentState = await window.electronAPI.getAgentState() || {};
                console.log('Loaded agentic data:', { workflows: this.workflows.length, goals: this.dailyGoals.length });
            }
        } catch (error) {
            console.error('Failed to load agentic data:', error);
        }
    }

    async executeWorkflow(workflowName, params = {}) {
        try {
            this.showLoading();
            const result = await window.electronAPI.executeWorkflow(workflowName, params);

            if (result.success) {
                this.displayWorkflowResult(result);
            } else {
                this.displayError(`Workflow failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Workflow execution failed:', error);
            this.displayError('Failed to execute workflow');
        } finally {
            this.hideLoading();
        }
    }

    displayWorkflowResult(result) {
        const html = `
            <div class="workflow-result">
                <div class="result-header">
                    ⚙️ Workflow: ${result.workflowName}
                </div>
                <div class="result-summary">
                    ✅ Completed ${result.results.filter(r => r.success).length}/${result.results.length} steps
                    in ${Math.round(result.executionTime / 1000)}s
                </div>
                <div class="result-steps">
                    ${result.results.map((step, i) => `
                        <div class="step-result ${step.success ? 'success' : 'error'}">
                            <span class="step-number">${step.step}</span>
                            <span class="step-status">${step.success ? '✅' : '❌'}</span>
                            <span class="step-text">${step.success ? step.result : step.error}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.resultsContent.innerHTML = html;
        this.showResults();
        this.updateWindowSize();
    }

    async addDailyGoal(goalText) {
        try {
            await window.electronAPI.addDailyGoal(goalText);
            await this.loadAgenticData(); // Refresh
            return true;
        } catch (error) {
            console.error('Failed to add goal:', error);
            return false;
        }
    }

    async completeGoal(goalId) {
        try {
            await window.electronAPI.completeGoal(goalId);
            await this.loadAgenticData(); // Refresh
            return true;
        } catch (error) {
            console.error('Failed to complete goal:', error);
            return false;
        }
    }

    displayDailyGoals() {
        const html = `
            <div class="daily-goals">
                <div class="goals-header">
                    🎯 Daily Goals
                </div>
                ${this.dailyGoals.length === 0 ? `
                    <div class="no-goals">
                        No goals set for today. Try saying "Add goal: [your goal]"
                    </div>
                ` : `
                    <div class="goals-list">
                        ${this.dailyGoals.map(goal => `
                            <div class="goal-item ${goal.completed ? 'completed' : ''}">
                                <input type="checkbox" ${goal.completed ? 'checked' : ''} 
                                       onchange="ui.completeGoal(${goal.id})">
                                <span class="goal-text">${goal.text}</span>
                                ${goal.completed ? '<span class="goal-time">✅ ' + new Date(goal.completedAt).toLocaleTimeString() + '</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        this.resultsContent.innerHTML = html;
        this.showResults();
        this.updateWindowSize();
    }

    displayAvailableWorkflows() {
        const html = `
            <div class="workflows-list">
                <div class="workflows-header">
                    ⚙️ Available Workflows
                </div>
                ${this.workflows.map(workflow => `
                    <div class="workflow-item" onclick="ui.executeWorkflow('${workflow.name}')">
                        <div class="workflow-name">${workflow.name}</div>
                        <div class="workflow-description">${workflow.description}</div>
                        <div class="workflow-meta">
                            ${workflow.type} • ${workflow.steps?.length || 0} steps
                            ${workflow.useCount ? ` • Used ${workflow.useCount} times` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.resultsContent.innerHTML = html;
        this.showResults();
        this.updateWindowSize();
    }

    // Enhanced query processing with workflow detection
    async processAgenticQuery(query) {
        const lowerQuery = query.toLowerCase();

        // Check for workflow commands
        if (lowerQuery.includes('start focus') || lowerQuery.includes('focus mode')) {
            return await this.executeWorkflow('focus_mode');
        }

        if (lowerQuery.includes('coding setup') || lowerQuery.includes('dev setup')) {
            return await this.executeWorkflow('coding_setup');
        }

        if (lowerQuery.includes('end day') || lowerQuery.includes('daily summary')) {
            return await this.executeWorkflow('end_day_routine');
        }

        if (lowerQuery.includes('show goals') || lowerQuery.includes('daily goals')) {
            this.displayDailyGoals();
            return;
        }

        if (lowerQuery.includes('show workflows') || lowerQuery.includes('available workflows')) {
            this.displayAvailableWorkflows();
            return;
        }

        if (lowerQuery.startsWith('add goal:')) {
            const goalText = query.substring(9).trim();
            const success = await this.addDailyGoal(goalText);
            if (success) {
                this.displayResults(`✅ Goal added: "${goalText}"`);
            } else {
                this.displayError('Failed to add goal');
            }
            return;
        }

        // Default to agent processing
        return await window.electronAPI.processAction(query);
    }
}

// Initialize the UI when DOM is loaded
// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const ui = new MantraAIAssistantUI();
    // ui.init() is called in constructor
    window.ui = ui; // Expose for global access if needed (e.g. for onchange handlers)
})
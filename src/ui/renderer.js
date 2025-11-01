class FloatingAssistantUI {
    constructor() {
        console.log('FloatingAssistantUI constructor called');
        
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
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
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.focusInput();
    }

    setupEventListeners() {
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSearch();
            } else if (e.key === 'Escape') {
                this.hideWindow();
            }
        });

        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.captureContextBtn.addEventListener('click', () => this.captureContext());
        this.clearContextBtn.addEventListener('click', () => this.clearContext());

        this.closeBtn.addEventListener('click', () => this.hideResults());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());

        const resizeObserver = new ResizeObserver(() => this.updateWindowSize());
        resizeObserver.observe(document.body);
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
        
        try {
            if (window.electronAPI) {
                const response = await window.electronAPI.processQuery(query, this.currentContext);
                this.displayResults(response);
            } else {
                const response = this.getDemoResponse(query);
                this.displayResults(response);
            }
        } catch (error) {
            console.error('Search error:', error);
            this.displayError('Failed to process query. Please try again.');
        } finally {
            this.hideLoading();
        }
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
        this.resultsContainer.classList.remove('hidden');
    }

    hideResults() {
        this.resultsContainer.classList.add('hidden');
        this.updateWindowSize();
    }

    showLoading() {
        this.loading.classList.remove('hidden');
        this.hideResults();
        this.contextContainer.classList.add('hidden');
        this.updateWindowSize();
    }

    hideLoading() {
        this.loading.classList.add('hidden');
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

    updateWindowSize() {
        const height = document.body.scrollHeight + 40; // Add padding
        if (window.electronAPI) {
            window.electronAPI.resizeWindow(Math.max(80, Math.min(600, height)));
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
    new FloatingAssistantUI();
});
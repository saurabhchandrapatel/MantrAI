// Simple test to verify UI elements work
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsContainer = document.getElementById('results-container');
    const resultsContent = document.getElementById('results-content');
    
    console.log('Elements found:', {
        searchInput: !!searchInput,
        searchBtn: !!searchBtn,
        resultsContainer: !!resultsContainer,
        resultsContent: !!resultsContent
    });
    
    function showTestResult() {
        console.log('Showing test result');
        
        resultsContent.innerHTML = `
            <div class="ai-response">
                <div class="response-header">
                    🤖 AI Assistant
                </div>
                <div class="response-content">
                    <strong>Test Response:</strong> This is a test to verify the UI is working correctly. The response should appear with proper styling.
                </div>
            </div>
        `;
        
        resultsContainer.classList.remove('hidden');
        console.log('Test result displayed');
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', showTestResult);
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                showTestResult();
            }
        });
    }
    
    // Auto-show test result after 2 seconds
    setTimeout(showTestResult, 2000);
});
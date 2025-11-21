
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const addSourceBtn = document.getElementById('add-source-btn');
const fileList = document.getElementById('file-list');

// --- Event Listeners ---

addSourceBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
        // Show loading state for file
        addFileToList(file.name, true);

        try {
            // We need the full path, which is available in Electron via file.path
            // Note: 'file.path' is a web standard property but only populated in Electron/Node environments
            const filePath = file.path;
            if (filePath) {
                const result = await window.electronAPI.uploadDocument(filePath);
                if (result.success) {
                    updateFileStatus(file.name, false);
                } else {
                    console.error('Upload failed:', result.error);
                    removeFileFromList(file.name);
                    alert(`Failed to upload ${file.name}: ${result.error}`);
                }
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            removeFileFromList(file.name);
        }
    }
    // Reset input
    fileInput.value = '';
});

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// --- Functions ---

function addFileToList(filename, isLoading) {
    const div = document.createElement('div');
    div.className = 'file-item active';
    div.dataset.filename = filename;
    div.innerHTML = `
        <span class="file-icon">${isLoading ? '⏳' : '📄'}</span>
        <span class="file-name">${filename}</span>
    `;
    fileList.appendChild(div);
}

function updateFileStatus(filename, isLoading) {
    const item = fileList.querySelector(`.file-item[data-filename="${filename}"]`);
    if (item) {
        item.querySelector('.file-icon').textContent = isLoading ? '⏳' : '📄';
    }
}

function removeFileFromList(filename) {
    const item = fileList.querySelector(`.file-item[data-filename="${filename}"]`);
    if (item) item.remove();
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Add user message
    appendMessage(text, 'user');
    chatInput.value = '';

    // Show loading AI message
    const loadingId = appendMessage('Thinking...', 'ai', true);

    try {
        // Use the RAG query if we have files, otherwise normal chat?
        // For notebook mode, we probably always want to use the vector store context if available.
        // But 'queryVectorStore' returns a string answer.
        // 'streamQuery' might be better for chat experience, but does it use the vector store?
        // Let's assume queryVectorStore is the right one for "Chat with your file".

        const response = await window.electronAPI.queryVectorStore(text);

        // Remove loading message
        removeMessage(loadingId);

        // Add AI response
        appendMessage(response, 'ai');

    } catch (error) {
        removeMessage(loadingId);
        appendMessage('Sorry, I encountered an error processing your request.', 'ai');
        console.error(error);
    }
}

function appendMessage(text, type, isLoading = false) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    if (isLoading) div.id = 'msg-' + Date.now();

    // Simple markdown parsing could go here, for now just text
    div.textContent = text;

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return div.id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Global function for suggestion buttons
window.suggest = (text) => {
    chatInput.value = text;
    sendMessage();
};

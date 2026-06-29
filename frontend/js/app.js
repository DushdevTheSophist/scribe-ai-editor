/**
 * ScribeAI - Frontend Logic
 * Implements real-time markdown parsing, line counting, stats calculation,
 * API connectors to FastAPI database + AI, and local storage fallback.
 */

// Application State
let state = {
    documents: [],
    currentDoc: null,
    isOffline: false,
    autoSaveTimer: null,
    analyzeTimer: null,
    selectedText: "",
    lastSavedContent: ""
};

// DOM Elements
const elements = {
    docTitle: document.getElementById('doc-title'),
    saveStatus: document.getElementById('save-status'),
    saveStatusText: document.getElementById('save-status-text'),
    themeToggle: document.getElementById('theme-toggle'),
    viewToggle: document.getElementById('view-toggle'),
    exportBtn: document.getElementById('export-btn'),
    exportMenu: document.getElementById('export-menu'),
    exportMd: document.getElementById('export-md'),
    exportHtml: document.getElementById('export-html'),
    exportTxt: document.getElementById('export-txt'),
    
    newDocBtn: document.getElementById('new-doc-btn'),
    docSearch: document.getElementById('doc-search'),
    docList: document.getElementById('doc-list'),
    
    fontSizeSlider: document.getElementById('font-size-slider'),
    fontSizeVal: document.getElementById('font-size-val'),
    autoSaveToggle: document.getElementById('auto-save-toggle'),
    
    textarea: document.getElementById('markdown-textarea'),
    lineNumbers: document.getElementById('line-numbers'),
    previewContent: document.getElementById('preview-content'),
    workspace: document.getElementById('workspace'),
    
    aiActionBtns: document.querySelectorAll('.ai-action-btn'),
    aiOutputBox: document.getElementById('ai-output-box'),
    aiSource: document.getElementById('ai-source'),
    aiResultActions: document.getElementById('ai-result-actions'),
    aiCopyBtn: document.getElementById('ai-copy-btn'),
    aiInsertBtn: document.getElementById('ai-insert-btn'),
    aiInfoBtn: document.getElementById('ai-info-btn'),
    infoModal: document.getElementById('info-modal'),
    modalClose: document.getElementById('modal-close'),
    keywordsList: document.getElementById('keywords-list'),
    
    wordCount: document.getElementById('word-count'),
    charCount: document.getElementById('char-count'),
    readingTime: document.getElementById('reading-time'),
    readabilityVal: document.getElementById('readability-val'),
    readabilityBadge: document.getElementById('readability-badge'),
    connectionStatus: document.getElementById('connection-status')
};

// API Base URL (assuming relative routes mounted on uvicorn)
const API_BASE = "";

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupTheme();
    setupEventListeners();
    setupSplitDrag();
    loadSettings();
    
    // Initial fetch from backend
    await loadDocuments();
    
    // Select first document or create one if list is empty
    if (state.documents.length > 0) {
        selectDocument(state.documents[0].id);
    } else {
        createNewDocument();
    }
});

// --- Settings & UI Setup ---

function setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function loadSettings() {
    // Font Size
    const savedSize = localStorage.getItem('editor-font-size') || '16';
    elements.fontSizeSlider.value = savedSize;
    elements.fontSizeVal.textContent = `${savedSize}px`;
    elements.textarea.style.fontSize = `${savedSize}px`;
    elements.lineNumbers.style.fontSize = `${savedSize}px`;
    
    // Auto Save
    const savedAutoSave = localStorage.getItem('auto-save') !== 'false';
    elements.autoSaveToggle.checked = savedAutoSave;
}

function setupEventListeners() {
    // Theme Toggle
    elements.themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Font Size Slider
    elements.fontSizeSlider.addEventListener('input', (e) => {
        const size = e.target.value;
        elements.fontSizeVal.textContent = `${size}px`;
        elements.textarea.style.fontSize = `${size}px`;
        elements.lineNumbers.style.fontSize = `${size}px`;
        localStorage.setItem('editor-font-size', size);
    });

    // Auto-save toggle
    elements.autoSaveToggle.addEventListener('change', (e) => {
        localStorage.setItem('auto-save', e.target.checked);
    });

    // Layout Toggle (Full workspace vs normal)
    elements.viewToggle.addEventListener('click', () => {
        const appContainer = document.querySelector('.app-container');
        appContainer.classList.toggle('full-width');
    });

    // Dropdown Export Menu Toggle
    elements.exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.exportMenu.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        elements.exportMenu.classList.remove('active');
    });

    // Export formats
    elements.exportMd.addEventListener('click', () => downloadFile(state.currentDoc.title + '.md', elements.textarea.value));
    elements.exportHtml.addEventListener('click', () => {
        const wrappedHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${state.currentDoc.title}</title>\n<style>\nbody { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }\npre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }\ncode { font-family: monospace; }\nblockquote { border-left: 4px solid #ccc; padding-left: 16px; margin: 0 0 16px 0; color: #666; }\ntable { border-collapse: collapse; width: 100%; }\nth, td { border: 1px solid #ddd; padding: 8px; }\n</style>\n</head>\n<body>\n${elements.previewContent.innerHTML}\n</body>\n</html>`;
        downloadFile(state.currentDoc.title + '.html', wrappedHtml);
    });
    elements.exportTxt.addEventListener('click', () => downloadFile(state.currentDoc.title + '.txt', elements.textarea.value));

    // New Document
    elements.newDocBtn.addEventListener('click', createNewDocument);

    // Search Documents
    elements.docSearch.addEventListener('input', filterDocuments);

    // Document Title Editing
    elements.docTitle.addEventListener('input', () => {
        if (!state.currentDoc) return;
        state.currentDoc.title = elements.docTitle.value || "Untitled Document";
        
        // Update Title in sidebar list element
        const docItem = document.querySelector(`.doc-item[data-id="${state.currentDoc.id}"] .doc-item-title`);
        if (docItem) {
            docItem.textContent = state.currentDoc.title;
        }
        
        triggerAutoSave();
    });

    // Editor Text Input
    elements.textarea.addEventListener('input', () => {
        updateLineNumbers();
        renderPreview();
        calculateLocalStats();
        triggerAutoSave();
        triggerAnalyzeDebounce();
    });

    // Line number scroll syncer
    elements.textarea.addEventListener('scroll', () => {
        elements.lineNumbers.scrollTop = elements.textarea.scrollTop;
    });

    // Formatting Toolbar
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            insertFormatting(format);
        });
    });

    // Track text selection in editor
    elements.textarea.addEventListener('mouseup', saveSelection);
    elements.textarea.addEventListener('keyup', saveSelection);

    // AI actions
    elements.aiActionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            executeAiAction(action);
        });
    });

    // Insert AI Content
    elements.aiInsertBtn.addEventListener('click', insertAiResult);
    
    // Copy AI Content
    elements.aiCopyBtn.addEventListener('click', () => {
        const text = elements.aiOutputBox.innerText;
        navigator.clipboard.writeText(text);
        const originalText = elements.aiCopyBtn.innerHTML;
        elements.aiCopyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
        lucide.createIcons();
        setTimeout(() => {
            elements.aiCopyBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);
    });

    // Modal Events
    elements.aiInfoBtn.addEventListener('click', () => {
        elements.infoModal.classList.add('active');
    });
    
    elements.modalClose.addEventListener('click', () => {
        elements.infoModal.classList.remove('active');
    });
    
    elements.infoModal.addEventListener('click', (e) => {
        if (e.target === elements.infoModal) {
            elements.infoModal.classList.remove('active');
        }
    });
}

// Split Pane Resizing Logic
function setupSplitDrag() {
    const divider = elements.workspace.querySelector('.pane-divider');
    const leftPane = elements.workspace.querySelector('.editor-pane');
    
    let isDragging = false;

    divider.addEventListener('mousedown', (e) => {
        isDragging = true;
        divider.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const workspaceRect = elements.workspace.getBoundingClientRect();
        const relativeX = e.clientX - workspaceRect.left;
        
        // Calculate percentage (keep within boundaries 20% to 80%)
        let percentage = (relativeX / workspaceRect.width) * 100;
        percentage = Math.max(20, Math.min(80, percentage));
        
        leftPane.style.flex = `0 0 ${percentage}%`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            divider.classList.remove('dragging');
            document.body.style.cursor = 'default';
        }
    });
}

// --- Local Core Calculations ---

function updateLineNumbers() {
    const lines = elements.textarea.value.split('\n');
    const lineCount = lines.length;
    let lineNumHtml = '';
    for (let i = 1; i <= lineCount; i++) {
        lineNumHtml += `${i}\n`;
    }
    elements.lineNumbers.textContent = lineNumHtml;
}

function renderPreview() {
    const markdownText = elements.textarea.value;
    // Set marked option to handle line breaks elegantly
    marked.setOptions({
        breaks: true,
        gfm: true
    });
    elements.previewContent.innerHTML = marked.parse(markdownText);
}

function calculateLocalStats() {
    const text = elements.textarea.value.trim();
    if (!text) {
        elements.wordCount.textContent = '0';
        elements.charCount.textContent = '0';
        elements.readingTime.textContent = '0';
        return;
    }
    
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = text.length;
    const readTime = Math.max(1, Math.round(wordCount / 200));
    
    elements.wordCount.textContent = wordCount;
    elements.charCount.textContent = charCount;
    elements.readingTime.textContent = readTime;
}

function saveSelection() {
    const start = elements.textarea.selectionStart;
    const end = elements.textarea.selectionEnd;
    if (start !== end) {
        state.selectedText = elements.textarea.value.substring(start, end);
    } else {
        state.selectedText = "";
    }
}

// Insert Formatting Helper
function insertFormatting(format) {
    const ta = elements.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);
    let replacement = "";
    
    switch (format) {
        case 'bold':
            replacement = `**${selected || 'bold text'}**`;
            break;
        case 'italic':
            replacement = `*${selected || 'italic text'}*`;
            break;
        case 'heading':
            replacement = `\n## ${selected || 'Heading'}\n`;
            break;
        case 'link':
            replacement = `[${selected || 'Link text'}](https://example.com)`;
            break;
        case 'code':
            replacement = `\n\`\`\`javascript\n${selected || '// code goes here'}\n\`\`\`\n`;
            break;
        case 'quote':
            replacement = `\n> ${selected || 'Blockquote text'}\n`;
            break;
    }
    
    ta.value = text.substring(0, start) + replacement + text.substring(end);
    ta.focus();
    // Re-highlight the replacement
    ta.selectionStart = start;
    ta.selectionEnd = start + replacement.length;
    
    // Trigger updates
    updateLineNumbers();
    renderPreview();
    calculateLocalStats();
    triggerAutoSave();
}

// --- API Sync Operations (CRUD) ---

async function loadDocuments() {
    setSaveStatus("syncing", "Loading documents from server...");
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        if (!response.ok) throw new Error("Failed to load documents");
        state.documents = await response.ok ? await response.json() : [];
        state.isOffline = false;
        updateConnectionBadge(true);
    } catch (error) {
        console.error("Backend offline. Falling back to local browser storage.", error);
        state.isOffline = true;
        updateConnectionBadge(false);
        // Fallback: load from localStorage
        const localDocs = localStorage.getItem('scribe_docs');
        state.documents = localDocs ? JSON.parse(localDocs) : [];
    }
    renderDocList();
    setSaveStatus("success", "All documents loaded");
}

function renderDocList() {
    elements.docList.innerHTML = '';
    
    if (state.documents.length === 0) {
        elements.docList.innerHTML = '<div class="doc-list-empty">No documents found. Click "+" to create one.</div>';
        return;
    }
    
    state.documents.forEach(doc => {
        const docItem = document.createElement('div');
        docItem.classList.add('doc-item');
        docItem.dataset.id = doc.id;
        if (state.currentDoc && state.currentDoc.id === doc.id) {
            docItem.classList.add('active');
        }
        
        // Format updated date
        let dateStr = "Recently updated";
        if (doc.updated_at) {
            try {
                const date = new Date(doc.updated_at);
                dateStr = date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
            } catch (e) {}
        }
        
        docItem.innerHTML = `
            <div class="doc-item-title-row">
                <div class="doc-item-title">${escapeHtml(doc.title)}</div>
                <button class="delete-doc-btn" title="Delete Document">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="doc-item-date">${dateStr}</div>
        `;
        
        // Click to load
        docItem.addEventListener('click', (e) => {
            // Prevent triggering if clicked delete button
            if (e.target.closest('.delete-doc-btn')) return;
            selectDocument(doc.id);
        });
        
        // Delete button listener
        docItem.querySelector('.delete-doc-btn').addEventListener('click', () => {
            deleteDoc(doc.id);
        });
        
        elements.docList.appendChild(docItem);
    });
    
    lucide.createIcons();
}

function selectDocument(id) {
    const doc = state.documents.find(d => d.id === id);
    if (!doc) return;
    
    state.currentDoc = doc;
    state.lastSavedContent = doc.content;
    
    // Set UI values
    elements.docTitle.value = doc.title;
    elements.textarea.value = doc.content;
    
    // Highlight active list item
    document.querySelectorAll('.doc-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.doc-item[data-id="${id}"]`);
    if (activeItem) activeItem.classList.add('active');
    
    // Trigger render routines
    updateLineNumbers();
    renderPreview();
    calculateLocalStats();
    triggerAnalyzeDebounce(true); // immediate analytics on doc switch
    
    setSaveStatus("success", "Loaded document");
}

async function createNewDocument() {
    setSaveStatus("syncing", "Creating document...");
    const defaultTitle = "Untitled Document";
    const defaultContent = "# " + defaultTitle + "\n\nStart writing your ideas here...\n";
    
    if (state.isOffline) {
        // Local Save Fallback
        const newLocalDoc = {
            id: Date.now(), // use timestamp as local ID
            title: defaultTitle,
            content: defaultContent,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        state.documents.unshift(newLocalDoc);
        saveLocalDocsToStorage();
        renderDocList();
        selectDocument(newLocalDoc.id);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/documents`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title: defaultTitle, content: defaultContent })
        });
        
        if (!response.ok) throw new Error("Failed to create document");
        const doc = await response.json();
        state.documents.unshift(doc);
        renderDocList();
        selectDocument(doc.id);
    } catch (e) {
        console.error(e);
        state.isOffline = true;
        updateConnectionBadge(false);
        createNewDocument(); // Retry locally
    }
}

async function saveDocument() {
    if (!state.currentDoc) return;
    
    const newTitle = elements.docTitle.value || "Untitled Document";
    const newContent = elements.textarea.value;
    
    // Avoid API requests if nothing changed
    if (newTitle === state.currentDoc.title && newContent === state.lastSavedContent) {
        return;
    }
    
    setSaveStatus("syncing", "Saving changes...");
    
    state.currentDoc.title = newTitle;
    state.currentDoc.content = newContent;
    state.currentDoc.updated_at = new Date().toISOString();
    state.lastSavedContent = newContent;
    
    if (state.isOffline) {
        saveLocalDocsToStorage();
        setSaveStatus("success", "Saved locally (Offline)");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/documents/${state.currentDoc.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title: newTitle, content: newContent })
        });
        
        if (!response.ok) throw new Error("Failed to save document");
        const updated = await response.json();
        
        // Sync document in local array
        const idx = state.documents.findIndex(d => d.id === state.currentDoc.id);
        if (idx !== -1) {
            state.documents[idx] = updated;
        }
        
        setSaveStatus("success", "All changes saved");
    } catch (e) {
        console.error("Save error, fallback to offline local saving", e);
        state.isOffline = true;
        updateConnectionBadge(false);
        saveLocalDocsToStorage();
        setSaveStatus("success", "Saved locally (Offline)");
    }
}

async function deleteDoc(id) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    
    setSaveStatus("syncing", "Deleting document...");
    
    if (state.isOffline) {
        state.documents = state.documents.filter(d => d.id !== id);
        saveLocalDocsToStorage();
        renderDocList();
        
        // If deleted current, select another
        if (state.currentDoc && state.currentDoc.id === id) {
            if (state.documents.length > 0) {
                selectDocument(state.documents[0].id);
            } else {
                createNewDocument();
            }
        }
        setSaveStatus("success", "Document deleted");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/documents/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error("Failed to delete document");
        
        state.documents = state.documents.filter(d => d.id !== id);
        renderDocList();
        
        // If deleted current, select another
        if (state.currentDoc && state.currentDoc.id === id) {
            if (state.documents.length > 0) {
                selectDocument(state.documents[0].id);
            } else {
                createNewDocument();
            }
        }
        setSaveStatus("success", "Document deleted");
    } catch (e) {
        console.error(e);
        state.isOffline = true;
        updateConnectionBadge(false);
        // Retry deleting locally
        deleteDoc(id);
    }
}

function triggerAutoSave() {
    const isAutoSave = elements.autoSaveToggle.checked;
    if (!isAutoSave) return;
    
    setSaveStatus("syncing", "Typing...");
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(async () => {
        await saveDocument();
    }, 1200); // 1.2 second debounce
}

// Local Storage helpers
function saveLocalDocsToStorage() {
    localStorage.setItem('scribe_docs', JSON.stringify(state.documents));
}

// --- AI & NLP Integration ---

function triggerAnalyzeDebounce(immediate = false) {
    clearTimeout(state.analyzeTimer);
    
    if (immediate) {
        analyzeTextMetrics();
        return;
    }
    
    state.analyzeTimer = setTimeout(() => {
        analyzeTextMetrics();
    }, 2500); // 2.5 second debounce for analysis to save API calls
}

async function analyzeTextMetrics() {
    const text = elements.textarea.value.trim();
    if (!text || state.isOffline) {
        // offline fallback readable label estimates
        if (!text) {
            elements.readabilityVal.textContent = "N/A";
            elements.keywordsList.innerHTML = '<span class="kw-placeholder">Write some text to extract key themes.</span>';
        } else {
            // Local estimation when backend is offline
            elements.readabilityVal.textContent = "Standard (Offline)";
        }
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/ai/analyze`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        // Update Readability Badge
        elements.readabilityVal.textContent = data.metrics.readability_label;
        
        // Update Keywords
        elements.keywordsList.innerHTML = '';
        if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(kw => {
                const span = document.createElement('span');
                span.classList.add('keyword-tag');
                span.textContent = kw;
                elements.keywordsList.appendChild(span);
            });
        } else {
            elements.keywordsList.innerHTML = '<span class="kw-placeholder">No high frequency themes found.</span>';
        }
    } catch (e) {
        console.error("Analysis api error", e);
    }
}

async function executeAiAction(task) {
    const text = elements.textarea.value;
    const selected = state.selectedText;
    
    // Clear old AI outputs and show loading
    elements.aiOutputBox.innerHTML = '';
    elements.aiOutputBox.classList.add('loading');
    elements.aiSource.textContent = "Processing...";
    elements.aiResultActions.style.display = 'none';
    
    if (state.isOffline) {
        // simulate offline local algorithm processing lag
        setTimeout(() => {
            elements.aiOutputBox.classList.remove('loading');
            elements.aiOutputBox.innerHTML = "<strong>Error:</strong> AI Co-Writer actions require a connection to the Python backend server. Standard local statistics are still running.";
            elements.aiSource.textContent = "System Error";
        }, 600);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/ai/transform`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                text: text,
                task: task,
                selected_text: selected || null
            })
        });
        
        if (!response.ok) throw new Error("AI call failed");
        const data = await response.json();
        
        // Show result
        elements.aiOutputBox.classList.remove('loading');
        // Render simple Markdown format inside AI panel using marked
        elements.aiOutputBox.innerHTML = marked.parse(data.result);
        elements.aiSource.textContent = data.source;
        
        // Save the raw text result on a DOM attribute to pull it when inserting
        elements.aiOutputBox.dataset.rawResult = data.result;
        
        // Show action buttons
        elements.aiResultActions.style.display = 'flex';
    } catch (e) {
        console.error(e);
        elements.aiOutputBox.classList.remove('loading');
        elements.aiOutputBox.innerHTML = "<strong>Failed to get response from AI.</strong> Make sure uvicorn is running, or set your GEMINI_API_KEY environment variable.";
        elements.aiSource.textContent = "Error";
    }
}

function insertAiResult() {
    const rawResult = elements.aiOutputBox.dataset.rawResult;
    if (!rawResult) return;
    
    const ta = elements.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    
    if (start !== end) {
        // Replace Selected Text
        ta.value = text.substring(0, start) + rawResult + text.substring(end);
        ta.selectionStart = start;
        ta.selectionEnd = start + rawResult.length;
    } else {
        // Insert at Cursor (or append to end)
        ta.value = text.substring(0, start) + "\n\n" + rawResult + text.substring(start);
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2 + rawResult.length;
    }
    
    ta.focus();
    
    // Render and Sync
    updateLineNumbers();
    renderPreview();
    calculateLocalStats();
    triggerAutoSave();
    
    // Clear panel
    elements.aiOutputBox.innerHTML = '<span class="ai-placeholder">Result inserted into editor.</span>';
    elements.aiResultActions.style.display = 'none';
    elements.aiSource.textContent = "Inserted";
}

function filterDocuments() {
    const query = elements.docSearch.value.toLowerCase().trim();
    const docItems = document.querySelectorAll('.doc-item');
    docItems.forEach(item => {
        const title = item.querySelector('.doc-item-title').textContent.toLowerCase();
        if (title.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// --- Utility Functions ---

function setSaveStatus(type, message) {
    elements.saveStatusText.textContent = message;
    elements.saveStatus.className = "save-status"; // reset
    
    const icon = elements.saveStatus.querySelector('i');
    
    if (type === "syncing") {
        elements.saveStatus.classList.add("syncing");
        icon.className = "status-icon";
        icon.setAttribute("data-lucide", "refresh-cw");
        icon.style.animation = "spin 1.5s infinite linear";
    } else if (type === "success") {
        elements.saveStatus.classList.add("success");
        icon.className = "status-icon success-icon";
        icon.setAttribute("data-lucide", "check");
        icon.style.animation = "none";
    }
    
    lucide.createIcons();
}

function updateConnectionBadge(connected) {
    const dot = elements.connectionStatus.querySelector('.status-dot');
    const label = elements.connectionStatus;
    
    if (connected) {
        dot.className = "status-dot online";
        label.innerHTML = '<span class="status-dot online"></span> API Server Connected';
    } else {
        dot.className = "status-dot offline";
        label.innerHTML = '<span class="status-dot" style="background-color: var(--accent-danger); box-shadow: 0 0 6px rgba(239, 68, 68, 0.6)"></span> Offline Mode (Local Storage)';
    }
}

function downloadFile(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// CSS injection for header status rotations
const style = document.createElement('style');
style.innerHTML = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .save-status.syncing i {
        color: var(--accent-secondary);
    }
`;
document.head.appendChild(style);

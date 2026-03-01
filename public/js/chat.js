// ============================================================
// AI Agent Hub — Chat Logic
// ============================================================

const AGENT_CONFIG = {
    'research-analyst': {
        name: 'Academic Support',
        icon: '🎓',
        color: 'var(--accent-1)',
        glow: 'var(--accent-1-glow)',
        welcome: 'Have academic questions or need study/research guidance? Ask me about courses, concepts, exams, or time management—I’m here to help!',
    },
    'code-assistant': {
        name: 'Emotional Support',
        icon: '💗',
        color: 'var(--accent-3)',
        glow: 'var(--accent-3-glow)',
        welcome: 'I\'m here to help you handle your studies and emotions when you feel overwhelmed. 📚💙 Tell me how you feel and what you\'re struggling with!',
    },
    'creative-writer': {
        name: 'CV Analyzer',
        icon: '📄',
        color: 'var(--accent-green)',
        glow: 'var(--accent-green-glow)',
        welcome: 'Upload a photo of your CV and I\'ll analyze its strengths and weaknesses for you.',
    },
    'data-analyst': {
        name: 'Career Advisor',
        icon: '🎯',
        color: 'var(--accent-4)',
        glow: 'var(--accent-4-glow)',
        welcome: 'I\'m TBS Career Advisor! 🎓 Tell me your favorite subjects, grades, and interests—I\'ll recommend the perfect career path for you!',
    },
};

// ── State ───────────────────────────────────────────────────
let currentAgent = null;
let sessionId = crypto.randomUUID();
let isLoading = false;

// ── DOM Elements ────────────────────────────────────────────
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const fileBtn = document.getElementById('fileBtn');

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const agentId = params.get('agent');

    if (!agentId || !AGENT_CONFIG[agentId]) {
        window.location.href = '/';
        return;
    }

    currentAgent = agentId;
    const config = AGENT_CONFIG[agentId];

    // Set body data attribute for CSS
    document.body.setAttribute('data-agent', agentId);

    // Set header
    document.getElementById('agentName').textContent = config.name;
    document.getElementById('agentStatus').textContent = 'Online — Powered by n8n';
    document.title = `${config.name} — AI Agent Hub`;

    // Set avatar
    const avatar = document.getElementById('agentAvatar');
    avatar.textContent = config.icon;
    avatar.style.background = config.glow;

    // Set welcome
    const welcomeIcon = document.getElementById('welcomeIcon');
    welcomeIcon.textContent = config.icon;
    welcomeIcon.style.background = config.glow;
    document.getElementById('welcomeTitle').textContent = `Hi, I'm ${config.name}`;
    document.getElementById('welcomeDesc').textContent = config.welcome;

    // Show file upload button for CV Analyzer
    if (agentId === 'creative-writer') {
        fileBtn.style.display = 'flex';
    }

    // Focus input
    messageInput.focus();
});

// ── File Upload (CV Analyzer) ──────────────────────────────
fileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        addMessage('⚠️ Please upload an image file.', 'agent');
        return;
    }

    // Hide welcome message
    const welcome = document.getElementById('chatWelcome');
    if (welcome) welcome.remove();

    // Show uploaded image
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'message message--user';
        imgDiv.style.maxWidth = '300px';
        const img = document.createElement('img');
        img.src = event.target.result;
        img.style.width = '100%';
        img.style.borderRadius = 'var(--radius-md)';
        imgDiv.appendChild(img);
        chatMessages.appendChild(imgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    reader.readAsDataURL(file);

    // Show typing indicator
    isLoading = true;
    sendBtn.disabled = true;
    const typingEl = showTypingIndicator();

    try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('agentId', currentAgent);
        formData.append('sessionId', sessionId);

        const response = await fetch('/api/analyze-cv', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        typingEl.remove();

        if (response.ok) {
            const responseText = data.response || data.analysis || data.message;
            if (responseText && responseText.trim()) {
                addMessage(responseText, 'agent');
            } else {
                addMessage('⚠️ Could not analyze the CV. Please try again.', 'agent');
            }
        } else {
            addMessage(`⚠️ Error: ${data.error || 'Something went wrong.'}`, 'agent');
        }
    } catch (err) {
        typingEl.remove();
        addMessage('⚠️ Could not reach the server. Make sure it\'s running.', 'agent');
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        fileInput.value = '';
    }
});

// ── Form Submit ─────────────────────────────────────────────
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (!message || isLoading) return;

    // Hide welcome message
    const welcome = document.getElementById('chatWelcome');
    if (welcome) welcome.remove();

    // Add user message
    addMessage(message, 'user');
    messageInput.value = '';

    // Show typing indicator
    isLoading = true;
    sendBtn.disabled = true;
    const typingEl = showTypingIndicator();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: currentAgent,
                message,
                sessionId,
            }),
        });

        const data = await response.json();

        // Remove typing indicator
        typingEl.remove();

        if (response.ok) {
            // Handle empty or missing responses
            const responseText = data.response || data.output || data.text || data.message;
            if (responseText && responseText.trim()) {
                addMessage(responseText, 'agent');
            } else {
                addMessage('⚠️ Received an empty response. Please check the server configuration.', 'agent');
            }
        } else {
            addMessage(`⚠️ Error: ${data.error || 'Something went wrong.'}`, 'agent');
        }
    } catch (err) {
        typingEl.remove();
        addMessage('⚠️ Could not reach the server. Make sure it\'s running.', 'agent');
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
});

// ── Helpers ─────────────────────────────────────────────────
function addMessage(text, sender) {
    // Prevent empty messages
    if (!text || !text.trim()) {
        console.warn('Attempted to add empty message');
        return;
    }
    
    const div = document.createElement('div');
    div.className = `message message--${sender}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

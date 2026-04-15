// Authentication System
let currentLanguage = 'en';
let ws = null;
let authToken = null;
let currentUsername = null;
let firstMessage = true;

window.addEventListener('DOMContentLoaded', () => {
    initAuth();
    updateLanguage();
});

function initAuth() {
    const savedToken = localStorage.getItem('authToken');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUsername) {
        authToken = savedToken;
        currentUsername = savedUsername;
        showChatScreen();
        connectWebSocket();
    } else {
        showAuthScreen();
    }

    document.getElementById('loginBtn')?.addEventListener('click', handleLogin);
    document.getElementById('registerBtn')?.addEventListener('click', handleRegister);

    document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });

    document.getElementById('registerPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRegister();
        }
    });
}

function toggleForm(e) {
    e.preventDefault();
    document.getElementById('loginForm').classList.toggle('active');
    document.getElementById('registerForm').classList.toggle('active');
    clearErrors();
}

function clearErrors() {
    const loginErrorEl = document.getElementById('loginError');
    if (loginErrorEl) {
        loginErrorEl.classList.remove('show');
        loginErrorEl.textContent = '';
    }

    const registerErrorEl = document.getElementById('registerError');
    if (registerErrorEl) {
        registerErrorEl.classList.remove('show');
        registerErrorEl.textContent = '';
    }
}

function showError(formId, message) {
    const errorEl = document.getElementById(formId + 'Error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.add('show');
}

async function handleRegister() {
    clearErrors();

    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    if (!username || !password) {
        showError('register', 'Username and password required');
        return;
    }

    if (password !== passwordConfirm) {
        showError('register', 'Passwords do not match');
        return;
    }

    if (password.length < 6) {
        showError('register', 'Password must be at least 6 characters');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!response.ok) {
            showError('register', data.error || 'Registration failed');
            return;
        }

        const loginResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const loginData = await loginResponse.json();

        if (!loginResponse.ok) {
            showError('register', loginData.error || 'Login after registration failed');
            return;
        }

        authToken = loginData.token;
        currentUsername = loginData.username;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('username', currentUsername);
        showChatScreen();
        connectWebSocket();
    } catch (e) {
        showError('register', 'Connection error');
    }
}

async function handleLogin() {
    clearErrors();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showError('login', 'Username and password required');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!response.ok) {
            showError('login', data.error || 'Login failed');
            return;
        }

        authToken = data.token;
        currentUsername = data.username;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('username', currentUsername);
        showChatScreen();
        connectWebSocket();
    } catch (e) {
        showError('login', 'Connection error');
    }
}

function showAuthScreen() {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('chatContainer').style.display = 'none';
}

function showChatScreen() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('chatContainer').style.display = 'flex';
    document.getElementById('currentUser').textContent = currentUsername || '';
}

function logout() {
    authToken = null;
    currentUsername = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    if (ws) ws.close();
    location.reload();
}

function toggleLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'ar' : 'en';
    updateLanguage();
    updateDirection();
}

function updateLanguage() {
    document.querySelectorAll('[data-en][data-ar]').forEach(el => {
        if (el.hasAttribute('data-placeholder-en')) {
            el.placeholder = currentLanguage === 'en'
                ? el.getAttribute('data-placeholder-en')
                : el.getAttribute('data-placeholder-ar');
        } else {
            el.textContent = currentLanguage === 'en'
                ? el.getAttribute('data-en')
                : el.getAttribute('data-ar');
        }
    });

    const langBtn = document.getElementById('langBtn');
    if (langBtn) {
        langBtn.textContent = currentLanguage === 'en' ? '???????' : 'English';
    }
}

function updateDirection() {
    const body = document.body;
    if (currentLanguage === 'ar') {
        body.classList.add('rtl');
    } else {
        body.classList.remove('rtl');
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}?token=${authToken}`);

    ws.onopen = () => {
        console.log('Connected to chat server');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'system') {
            if (firstMessage) {
                const welcome = messagesContainer.querySelector('.welcome-message');
                if (welcome) welcome.remove();
                firstMessage = false;
            }
            addSystemMessage(data.message);
        } else if (data.type === 'message') {
            if (firstMessage) {
                const welcome = messagesContainer.querySelector('.welcome-message');
                if (welcome) welcome.remove();
                firstMessage = false;
            }
            const isOwn = data.username === currentUsername;
            addMessage(data.text, isOwn ? 'user' : 'other', data.timestamp, data.username);
        } else if (data.type === 'users') {
            updateUserCount(data.count);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(connectWebSocket, 3000);
    };
}

const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ text: message }));
    messageInput.value = '';
    messageInput.focus();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessage(text, sender, timestamp, username) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const timeString = timestamp || new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-content ${sender === 'user' ? 'message-content-user' : 'message-content-other'}">
            <div class="message-username">${escapeHtml(username || 'User')}</div>
            <div class="message-bubble">${escapeHtml(text)}</div>
            <div class="message-time">${timeString}</div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = 'text-align: center; color: #7f8c8d; font-size: 0.85rem; margin: 10px 0; padding: 8px; background: rgba(127, 140, 141, 0.1); border-radius: 8px;';
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUserCount(count) {
    const userCountNum = document.getElementById('userCountNum');
    if (userCountNum) userCountNum.textContent = count;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

messageInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn?.addEventListener('click', sendMessage);

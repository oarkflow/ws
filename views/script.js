let ws = null;

const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const subscribeBtn = document.getElementById('subscribeBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const publishBtn = document.getElementById('publishBtn');
const topicInput = document.getElementById('topicInput');
const messageInput = document.getElementById('messageInput');
const logContainer = document.getElementById('logContainer');

function updateStatus(connected) {
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        subscribeBtn.disabled = false;
        unsubscribeBtn.disabled = false;
        publishBtn.disabled = false;
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        subscribeBtn.disabled = true;
        unsubscribeBtn.disabled = true;
        publishBtn.disabled = true;
    }
}

function logMessage(message, type = 'received') {
    const div = document.createElement('div');
    div.className = `log-message ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function connect() {
    try {
        ws = new WebSocket('wss://localhost:8080/ws?token=mysecrettoken');

        ws.onopen = function (event) {
            logMessage('Connected to WebSocket server', 'received');
            updateStatus(true);
        };

        ws.onmessage = function (event) {
            logMessage('Received: ' + event.data, 'received');
        };

        ws.onclose = function (event) {
            logMessage('Disconnected from WebSocket server', 'error');
            updateStatus(false);
        };

        ws.onerror = function (error) {
            logMessage('WebSocket error: ' + error, 'error');
            updateStatus(false);
        };
    } catch (error) {
        logMessage('Connection error: ' + error.message, 'error');
    }
}

function disconnect() {
    if (ws) {
        ws.close();
        ws = null;
    }
}

function subscribe() {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic');
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = `subscribe:${topic}`;
        ws.send(message);
        logMessage('Sent: ' + message, 'sent');
    }
}

function unsubscribe() {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic');
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = `unsubscribe:${topic}`;
        ws.send(message);
        logMessage('Sent: ' + message, 'sent');
    }
}

function publish() {
    const topic = topicInput.value.trim();
    const message = messageInput.value.trim();
    if (!topic || !message) {
        alert('Please enter both topic and message');
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        const fullMessage = `publish:${topic}:${message}`;
        ws.send(fullMessage);
        logMessage('Sent: ' + fullMessage, 'sent');
    }
}

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
subscribeBtn.addEventListener('click', subscribe);
unsubscribeBtn.addEventListener('click', unsubscribe);
publishBtn.addEventListener('click', publish);

// Initialize status
updateStatus(false);

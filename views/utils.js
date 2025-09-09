// Make logContainer globally accessible
const logContainer = document.getElementById('logContainer');

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function logMessage(message, type = 'received') {
    const div = document.createElement('div');
    div.className = `log-message ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

export function logFileMessage(message, type = 'received', fileUrl = null, buttonText = 'Download') {
    const div = document.createElement('div');
    div.className = `log-message ${type} file-message`;

    const textSpan = document.createElement('span');
    textSpan.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    if (fileUrl) {
        const button = document.createElement('button');
        button.textContent = buttonText;
        button.className = 'file-download-btn';
        button.onclick = () => {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = 'received_file';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        div.appendChild(textSpan);
        div.appendChild(button);
    } else {
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

export function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = 'block';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 3000);
    }
}

// Make logContainer globally accessible
const logContainer = document.getElementById('logContainer');

// Stats tracking
let messageStats = {
    sent: 0,
    files: 0,
    topics: 0
};

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function logMessage(message, type = 'received') {
    const div = document.createElement('div');
    div.className = 'p-3 rounded-lg text-sm mb-3 fade-in flex items-start space-x-3';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex-1';

    if (type === 'sent') {
        div.classList.add('bg-blue-50', 'border-l-4', 'border-blue-400');
        iconDiv.className += ' bg-blue-100';
        iconDiv.innerHTML = '<i data-lucide="arrow-up" class="w-3 h-3 text-blue-600"></i>';
        messageDiv.innerHTML = `<div class="text-blue-800 font-medium">You sent:</div><div class="text-blue-700 mt-1">${message}</div>`;
        updateMessageStats('sent');
    } else if (type === 'error') {
        div.classList.add('bg-red-50', 'border-l-4', 'border-red-400');
        iconDiv.className += ' bg-red-100';
        iconDiv.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 text-red-600"></i>';
        messageDiv.innerHTML = `<div class="text-red-800 font-medium">Error:</div><div class="text-red-700 mt-1">${message}</div>`;
    } else if (type === 'system') {
        div.classList.add('bg-slate-50', 'border-l-4', 'border-slate-400');
        iconDiv.className += ' bg-slate-100';
        iconDiv.innerHTML = '<i data-lucide="info" class="w-3 h-3 text-slate-600"></i>';
        messageDiv.innerHTML = `<div class="text-slate-800 font-medium">System:</div><div class="text-slate-700 mt-1">${message}</div>`;
    } else {
        div.classList.add('bg-green-50', 'border-l-4', 'border-green-400');
        iconDiv.className += ' bg-green-100';
        iconDiv.innerHTML = '<i data-lucide="arrow-down" class="w-3 h-3 text-green-600"></i>';
        messageDiv.innerHTML = `<div class="text-green-800 font-medium">Received:</div><div class="text-green-700 mt-1">${message}</div>`;
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'text-xs text-slate-500 mt-2';
    timeDiv.textContent = new Date().toLocaleTimeString();

    messageDiv.appendChild(timeDiv);
    div.appendChild(iconDiv);
    div.appendChild(messageDiv);

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Re-initialize Lucide icons for new elements
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function logFileMessage(message, type = 'received', fileUrl = null, buttonText = 'Download') {
    const div = document.createElement('div');
    div.className = 'p-3 rounded-lg text-sm mb-3 fade-in flex items-start space-x-3';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex-1';

    if (type === 'sent') {
        div.classList.add('bg-purple-50', 'border-l-4', 'border-purple-400');
        iconDiv.className += ' bg-purple-100';
        iconDiv.innerHTML = '<i data-lucide="upload" class="w-3 h-3 text-purple-600"></i>';
        contentDiv.innerHTML = `<div class="text-purple-800 font-medium">File sent:</div><div class="text-purple-700 mt-1">${message}</div>`;
        updateMessageStats('files');
    } else {
        div.classList.add('bg-orange-50', 'border-l-4', 'border-orange-400');
        iconDiv.className += ' bg-orange-100';
        iconDiv.innerHTML = '<i data-lucide="download" class="w-3 h-3 text-orange-600"></i>';
        contentDiv.innerHTML = `<div class="text-orange-800 font-medium">File received:</div><div class="text-orange-700 mt-1">${message}</div>`;
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'text-xs text-slate-500 mt-2';
    timeDiv.textContent = new Date().toLocaleTimeString();

    if (fileUrl) {
        const button = document.createElement('button');
        button.innerHTML = `<i data-lucide="download" class="w-3 h-3 inline mr-1"></i>${buttonText}`;
        button.className = 'mt-2 px-3 py-1 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-xs font-medium inline-flex items-center';
        button.onclick = () => {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = 'received_file';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        contentDiv.appendChild(button);
    }

    contentDiv.appendChild(timeDiv);
    div.appendChild(iconDiv);
    div.appendChild(contentDiv);

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Re-initialize Lucide icons for new elements
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        setTimeout(() => {
            indicator.classList.add('hidden');
        }, 3000);
    }
}

export function updateMessageStats(type) {
    if (type === 'sent') {
        messageStats.sent++;
        const sentEl = document.getElementById('messagesSent');
        if (sentEl) sentEl.textContent = messageStats.sent;
    } else if (type === 'files') {
        messageStats.files++;
        const filesEl = document.getElementById('filesShared');
        if (filesEl) filesEl.textContent = messageStats.files;
    } else if (type === 'topics') {
        messageStats.topics++;
        const topicsEl = document.getElementById('activeTopics');
        if (topicsEl) topicsEl.textContent = messageStats.topics;
    }
}

export function resetMessageStats() {
    messageStats = { sent: 0, files: 0, topics: 0 };
    const sentEl = document.getElementById('messagesSent');
    const filesEl = document.getElementById('filesShared');
    const topicsEl = document.getElementById('activeTopics');
    if (sentEl) sentEl.textContent = '0';
    if (filesEl) filesEl.textContent = '0';
    if (topicsEl) topicsEl.textContent = '0';
}

export function clearLog() {
    if (logContainer) {
        logContainer.innerHTML = '';
        resetMessageStats();
    }
}

// Make clearLog globally available
window.clearLog = clearLog;

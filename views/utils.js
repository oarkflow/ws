// Make logContainer globally accessible
const logContainer = document.getElementById('logContainer');

// Toast notification system
let toastContainer = null;

function createToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = createToastContainer();

    const toast = document.createElement('div');
    toast.className = `p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full max-w-sm`;

    let bgColor = 'bg-blue-500';
    let textColor = 'text-white';
    let icon = 'info';

    switch (type) {
        case 'success':
            bgColor = 'bg-green-500';
            icon = 'check-circle';
            break;
        case 'error':
            bgColor = 'bg-red-500';
            icon = 'alert-circle';
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            textColor = 'text-gray-900';
            icon = 'alert-triangle';
            break;
        default:
            bgColor = 'bg-blue-500';
            icon = 'info';
    }

    toast.className += ` ${bgColor} ${textColor}`;

    toast.innerHTML = `
        <div class="flex items-center space-x-3">
            <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0"></i>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    }, 10);

    // Auto remove after duration
    setTimeout(() => {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);

    // Re-initialize Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

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
    // Filter out system messages to keep the log clean
    if (type === 'system') {
        return;
    }

    const div = document.createElement('div');
    div.className = 'p-3 rounded-lg text-sm mb-3 fade-in border border-gray-200 bg-white flex w-fit';

    // Align messages based on type
    if (type === 'sent') {
        div.classList.add('justify-end');
        div.classList.add('place-self-end');
    } else {
        div.classList.add('justify-start');
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'max-w-xs lg:max-w-md xl:max-w-lg';

    if (type === 'sent') {
        div.classList.add('border-l-4', 'border-blue-400');
        messageDiv.innerHTML = `
            <div class="text-blue-800 font-medium text-sm bg-blue-50 p-3 rounded-lg">${message}</div>
            <div class="text-xs text-gray-500 mt-1 text-right">${new Date().toLocaleTimeString()}</div>
        `;
        updateMessageStats('sent');
    } else if (type === 'error') {
        div.classList.add('border-l-4', 'border-red-400');
        messageDiv.innerHTML = `
            <div class="text-red-800 font-medium text-sm bg-red-50 p-3 rounded-lg">${message}</div>
            <div class="text-xs text-gray-500 mt-1">${new Date().toLocaleTimeString()}</div>
        `;
    } else {
        div.classList.add('border-l-4', 'border-green-400');
        messageDiv.innerHTML = `
            <div class="text-green-800 text-sm bg-green-50 p-3 rounded-lg">${message}</div>
            <div class="text-xs text-gray-500 mt-1">${new Date().toLocaleTimeString()}</div>
        `;
    }

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
    div.className = 'p-3 rounded-lg text-sm mb-3 fade-in border border-gray-200 bg-white flex w-fit';

    // Align messages based on type
    if (type === 'sent') {
        div.classList.add('justify-end');
        div.classList.add('place-self-end');
    } else {
        div.classList.add('justify-start');
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'max-w-xs lg:max-w-md xl:max-w-lg';

    if (type === 'sent') {
        div.classList.add('border-l-4', 'border-purple-400');
        messageDiv.innerHTML = `
            <div class="text-purple-800 font-medium text-sm bg-purple-50 p-3 rounded-lg">${message}</div>
            <div class="text-xs text-gray-500 mt-1 text-right">${new Date().toLocaleTimeString()}</div>
        `;
        updateMessageStats('files');
    } else {
        div.classList.add('border-l-4', 'border-orange-400');
        messageDiv.innerHTML = `
            <div class="text-orange-800 text-sm bg-orange-50 p-3 rounded-lg">${message}</div>
            <div class="text-xs text-gray-500 mt-1">${new Date().toLocaleTimeString()}</div>
        `;
    }

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
        messageDiv.appendChild(button);
    }

    div.appendChild(messageDiv);

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Re-initialize Lucide icons for new elements
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function showTypingIndicator() {
    // Remove any existing typing indicator
    const existingIndicator = document.getElementById('typingIndicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    // Create typing indicator message
    const div = document.createElement('div');
    div.id = 'typingIndicator';
    div.className = 'p-2 text-xs italic text-gray-500 fade-in mb-2 text-center';

    div.innerHTML = 'Someone is typing...';

    // Add to bottom of log container
    if (logContainer) {
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (div.parentNode) {
                div.remove();
            }
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

export function updateStatus(connected) {
    const statusDiv = document.getElementById('status');
    const statusDot = statusDiv.querySelector('div');
    const statusText = statusDiv.querySelector('span');

    if (connected) {
        statusDot.className = 'w-2 h-2 bg-green-500 rounded-full pulse-soft';
        statusText.textContent = 'Connected';
        statusText.className = 'text-sm font-medium text-green-600';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        setAliasBtn.disabled = false;
        subscribeBtn.disabled = false;
        sendBtn.disabled = false;
        sendFileBtn.disabled = false;
        pingBtn.disabled = false;
        userListBtn.disabled = false;
    } else {
        statusDot.className = 'w-2 h-2 bg-red-500 rounded-full pulse-soft';
        statusText.textContent = 'Disconnected';
        statusText.className = 'text-sm font-medium text-red-600';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        setAliasBtn.disabled = true;
        subscribeBtn.disabled = true;
        sendBtn.disabled = true;
        sendFileBtn.disabled = true;
        pingBtn.disabled = true;
        userListBtn.disabled = true;
        userCount.textContent = '0';
        userList.innerHTML = '';
        recipientSelect.innerHTML = '<option value="">Select recipient...</option>';
        topicSelect.innerHTML = '<option value="">Select topic...</option>';
        fileTopicSelect.innerHTML = '<option value="">Select topic...</option>';
        subscriptionsList.innerHTML = '';
    }
}

export function updateConnectionCount(count) {
    // Update the user count display with connection count
    if (userCount) {
        userCount.textContent = count;
    }
}

// Function to update the user list display
export function updateUserList(users) {
    userCount.textContent = users.length;

    // Preserve current selections
    const currentRecipientSelection = recipientSelect.value;
    const currentFileRecipientSelection = fileRecipientSelect.value;

    userList.innerHTML = '';
    recipientSelect.innerHTML = '<option value="">Select recipient...</option>';
    fileRecipientSelect.innerHTML = '<option value="">Select recipient...</option>';

    users.forEach(user => {
        // Check if this is the current user
        console.log('Checking user:', user.id, user.alias);
        console.log('Current user info - ID:', window.currentUserId, 'Alias:', window.currentUserAlias);
        console.log('wscon user info - ID:', window.wscon?.userId, 'Alias:', window.wscon?.userAlias);

        const isCurrentUser = (user.id === window.currentUserId) ||
            (user.alias === window.currentUserAlias) ||
            (user.id === window.wscon?.userId) ||
            (user.alias === window.wscon?.userAlias);

        console.log(`User ${user.id} (${user.alias}): isCurrentUser = ${isCurrentUser}`);
        const displayName = isCurrentUser ? `${user.alias} (Me)` : user.alias;

        // Add to user list with new Tailwind classes
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg cursor-pointer transition-colors hover:bg-slate-50 text-sm';
        if (isCurrentUser) {
            userDiv.classList.add('bg-brand-600', 'text-blue-500', 'border-brand-600', 'font-medium');
        }
        userDiv.innerHTML = `
            <span class="truncate">${displayName}</span>
            <div class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
        `;
        userDiv.dataset.userId = user.id;
        userDiv.onclick = () => selectUser(user.id);
        userList.appendChild(userDiv);

        // Add to recipient select
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = displayName;
        recipientSelect.appendChild(option);

        // Add to file recipient select
        const fileOption = document.createElement('option');
        fileOption.value = user.id;
        fileOption.textContent = displayName;
        fileRecipientSelect.appendChild(fileOption);
    });

    // Restore selections if the users still exist
    if (currentRecipientSelection) {
        recipientSelect.value = currentRecipientSelection;
        // Also update the visual selection in the user list
        const selectedUserDiv = document.querySelector(`[data-user-id="${currentRecipientSelection}"]`);
        if (selectedUserDiv) {
            document.querySelectorAll('.user-item').forEach(item => {
                item.classList.remove('bg-blue-100', 'border-blue-300', 'text-blue-800');
            });
            selectedUserDiv.classList.add('bg-blue-100', 'border-blue-300', 'text-blue-800');
        }
    }

    if (currentFileRecipientSelection) {
        fileRecipientSelect.value = currentFileRecipientSelection;
    }
}

// Function to update current user information
export function setCurrentUserInfo(userId, userAlias) {
    console.log('Setting current user info:', { userId, userAlias });
    console.log('wscon.userId:', window.wscon?.userId);
    console.log('wscon.userAlias:', window.wscon?.userAlias);

    // Store current user information for UI state management
    window.currentUserId = userId;
    window.currentUserAlias = userAlias;

    console.log('Current user info set to:', { userId, userAlias });
}

// Function to clear current user information
export function clearCurrentUserInfo() {
    window.currentUserId = null;
    window.currentUserAlias = null;
}

export function selectUser(userId) {
    // Remove selected class from all users
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('bg-blue-100', 'border-blue-300', 'text-blue-800');
        item.classList.add('bg-white', 'border-slate-200');
        if (item.classList.contains('bg-brand-600')) {
            item.classList.add('text-white');
        } else {
            item.classList.add('text-slate-900');
        }
    });

    // Add selected class to clicked user
    const selectedUser = document.querySelector(`[data-user-id="${userId}"]`);
    if (selectedUser) {
        selectedUser.classList.remove('bg-white', 'border-slate-200', 'text-slate-900');
        selectedUser.classList.add('bg-blue-100', 'border-blue-300', 'text-blue-800');
        recipientSelect.value = userId;
        // Set message type to direct
        document.querySelector('[data-type="direct"]').click();
        // Show recipient select without clearing the value
        recipientSelect.classList.remove('hidden');
        topicSelect.classList.add('hidden');
        topicSelect.value = '';
    }
}

export function toggleRecipientSelect() {
    if (messageType.value === 'direct') {
        recipientSelect.classList.remove('hidden');
        topicSelect.classList.add('hidden');
        // Don't clear recipientSelect value here - preserve user selection
        topicSelect.value = '';
    } else if (messageType.value === 'topic') {
        recipientSelect.classList.add('hidden');
        topicSelect.classList.remove('hidden');
        recipientSelect.value = '';
        // Don't clear topicSelect value here - preserve topic selection
    } else {
        recipientSelect.classList.add('hidden');
        topicSelect.classList.add('hidden');
        recipientSelect.value = '';
        topicSelect.value = '';
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('bg-blue-100', 'border-blue-300', 'text-blue-800');
            item.classList.add('bg-white', 'border-slate-200');
            if (item.classList.contains('bg-brand-600')) {
                item.classList.add('text-white');
            } else {
                item.classList.add('text-slate-900');
            }
        });
    }
}

export function toggleFileRecipientSelect() {
    if (fileType.value === 'direct') {
        fileRecipientSelect.classList.remove('hidden');
        fileTopicSelect.classList.add('hidden');
        // Don't clear fileRecipientSelect value here - preserve user selection
        fileTopicSelect.value = '';
    } else if (fileType.value === 'topic') {
        fileRecipientSelect.classList.add('hidden');
        fileTopicSelect.classList.remove('hidden');
        fileRecipientSelect.value = '';
        // Don't clear fileTopicSelect value here - preserve topic selection
    } else {
        fileRecipientSelect.classList.add('hidden');
        fileTopicSelect.classList.add('hidden');
        fileRecipientSelect.value = '';
        fileTopicSelect.value = '';
    }
}

export function updateSubscriptionsList() {
    subscriptionsList.innerHTML = '';
    if (window.wscon && window.wscon.subscriptions) {
        window.wscon.subscriptions.forEach(topic => {
            const badge = document.createElement('span');
            badge.className = 'inline-flex items-center bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-sm font-medium';
            badge.innerHTML = `
                <i data-lucide="hash" class="w-3 h-3 mr-1"></i>
                ${topic}
                <button onclick="unsubscribeFromTopic('${topic}')" class="ml-2 text-brand-600 hover:text-brand-800 font-bold">&times;</button>
            `;
            subscriptionsList.appendChild(badge);
        });
    }
    // Re-initialize Lucide icons for new elements
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function unsubscribeFromTopic(topic) {
    if (window.wscon) {
        window.wscon.unsubscribe(topic);
    }
}

// Add message type handling
export function setMessageType(type) {
    // Update hidden input
    const messageTypeInput = document.getElementById('messageType');
    if (messageTypeInput) {
        messageTypeInput.value = type;
    }

    // Update UI based on message type
    toggleRecipientSelect();
}

// DOM elements
export const statusEl = document.getElementById('status');
export const connectBtn = document.getElementById('connectBtn');
export const disconnectBtn = document.getElementById('disconnectBtn');
export const aliasInput = document.getElementById('aliasInput');
export const setAliasBtn = document.getElementById('setAliasBtn');
export const messageInput = document.getElementById('messageInput');
export const messageType = document.getElementById('messageType') || { value: 'broadcast' }; // Fallback for hidden input
export const recipientSelect = document.getElementById('recipientSelect');
export const topicSelect = document.getElementById('topicSelect');
export const sendBtn = document.getElementById('sendBtn');
export const pingBtn = document.getElementById('pingBtn');
export const userListBtn = document.getElementById('userListBtn');
export const userCount = document.getElementById('userCount');
export const userList = document.getElementById('userList');
export const logContainer = document.getElementById('logContainer');

// Subscription elements
export const topicInput = document.getElementById('topicInput');
export const subscribeBtn = document.getElementById('subscribeBtn');
export const subscriptionsList = document.getElementById('subscriptionsList');

// File upload elements
export const fileInput = document.getElementById('fileInput');
export const fileType = document.getElementById('fileType');
export const fileRecipientSelect = document.getElementById('fileRecipientSelect');
export const fileTopicSelect = document.getElementById('fileTopicSelect');
export const sendFileBtn = document.getElementById('sendFileBtn');

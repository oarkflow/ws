export function updateStatus(connected) {
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        setAliasBtn.disabled = false;
        subscribeBtn.disabled = false;
        sendBtn.disabled = false;
        sendFileBtn.disabled = false;
        pingBtn.disabled = false;
        userListBtn.disabled = false;
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
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

        // Add to user list
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.textContent = displayName;
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
                item.classList.remove('selected');
            });
            selectedUserDiv.classList.add('selected');
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
        item.classList.remove('selected');
    });

    // Add selected class to clicked user
    const selectedUser = document.querySelector(`[data-user-id="${userId}"]`);
    if (selectedUser) {
        selectedUser.classList.add('selected');
        recipientSelect.value = userId;
        messageType.value = 'direct';
        // Show recipient select without clearing the value
        recipientSelect.style.display = 'inline-block';
        topicSelect.style.display = 'none';
        topicSelect.value = '';
    }
}

export function toggleRecipientSelect() {
    if (messageType.value === 'direct') {
        recipientSelect.style.display = 'inline-block';
        topicSelect.style.display = 'none';
        // Don't clear recipientSelect value here - preserve user selection
        topicSelect.value = '';
    } else if (messageType.value === 'topic') {
        recipientSelect.style.display = 'none';
        topicSelect.style.display = 'inline-block';
        recipientSelect.value = '';
        // Don't clear topicSelect value here - preserve topic selection
    } else {
        recipientSelect.style.display = 'none';
        topicSelect.style.display = 'none';
        recipientSelect.value = '';
        topicSelect.value = '';
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
}

export function toggleFileRecipientSelect() {
    if (fileType.value === 'direct') {
        fileRecipientSelect.style.display = 'inline-block';
        fileTopicSelect.style.display = 'none';
        // Don't clear fileRecipientSelect value here - preserve user selection
        fileTopicSelect.value = '';
    } else if (fileType.value === 'topic') {
        fileRecipientSelect.style.display = 'none';
        fileTopicSelect.style.display = 'inline-block';
        fileRecipientSelect.value = '';
        // Don't clear fileTopicSelect value here - preserve topic selection
    } else {
        fileRecipientSelect.style.display = 'none';
        fileTopicSelect.style.display = 'none';
        fileRecipientSelect.value = '';
        fileTopicSelect.value = '';
    }
}

export function updateSubscriptionsList() {
    subscriptionsList.innerHTML = '';
    if (window.wscon && window.wscon.subscriptions) {
        window.wscon.subscriptions.forEach(topic => {
            const div = document.createElement('div');
            div.className = 'subscription-item';
            div.innerHTML = `${topic} <button onclick="unsubscribeFromTopic('${topic}')">Unsubscribe</button>`;
            subscriptionsList.appendChild(div);
        });
    }
}

export function unsubscribeFromTopic(topic) {
    if (window.wscon) {
        window.wscon.unsubscribe(topic);
    }
}

// DOM elements
export const statusEl = document.getElementById('status');
export const connectBtn = document.getElementById('connectBtn');
export const disconnectBtn = document.getElementById('disconnectBtn');
export const aliasInput = document.getElementById('aliasInput');
export const setAliasBtn = document.getElementById('setAliasBtn');
export const messageInput = document.getElementById('messageInput');
export const messageType = document.getElementById('messageType');
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

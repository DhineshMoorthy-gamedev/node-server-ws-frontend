const wsUrl = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || !location.hostname)
    ? 'ws://localhost:8080'
    : 'wss://node-server-ws.onrender.com';
let socket = null;
let currentTasks = [];
let reconnectTimer = null;
let currentProjectId = localStorage.getItem('lastProjectId') || '';
let currentMemberName = localStorage.getItem('lastMemberName') || '';
const sessionId = Math.random().toString(36).substring(2, 11); // Generate unique session ID

// --- Elements ---
const elements = {
    inviteForm: document.getElementById('invite-form'),
    noInviteMsg: document.getElementById('no-invite-message'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    statusContainer: document.getElementById('status-container'),
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    searchBox: document.getElementById('task-search'),
    lastSyncTime: document.getElementById('last-sync-time'),
    wsUrlDisplay: document.getElementById('ws-url-display'),
    lists: {
        Pending: document.getElementById('list-pending'),
        InProgress: document.getElementById('list-inprogress'),
        Completed: document.getElementById('list-completed'),
        Blocked: document.getElementById('list-blocked')
    },
    editorStatus: {
        container: document.getElementById('editor-status-container'),
        dot: document.getElementById('editor-status-dot'),
        text: document.getElementById('editor-status-text')
    },
    project: {
        input: document.getElementById('project-id-input'),
        display: document.getElementById('project-display')
    },
    member: {
        input: document.getElementById('member-name-input'),
        display: document.getElementById('member-display')
    },
    joinBtn: document.getElementById('join-btn'),
    switchBtn: document.getElementById('switch-project-btn'),
    errorMsg: document.getElementById('error-message'),
    presenceList: document.getElementById('presence-list')
};

const isInvitePage = location.pathname.endsWith('index.html') || location.pathname.endsWith('/') || (!location.pathname.includes('.html') && !location.pathname.includes('dashboard'));
const isDashboardPage = location.pathname.includes('dashboard.html');
const platform = 'Web Dashboard';

const statusMapping = {
    0: 'Pending', 1: 'InProgress', 2: 'Completed', 3: 'Blocked',
    'Pending': 'Pending', 'InProgress': 'InProgress', 'Completed': 'Completed', 'Blocked': 'Blocked'
};

const priorityMapping = {
    0: 'Low', 1: 'Medium', 2: 'High', 3: 'Critical'
};

function updateStatus(status) {
    elements.statusDot.className = 'status-dot';
    elements.statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    if (status === 'connected') {
        elements.statusDot.classList.add('connected');
        elements.connectBtn.disabled = true;
        elements.disconnectBtn.disabled = false;
        elements.wsUrlDisplay.textContent = `Connected to Cluster • ${wsUrl}`;
    } else if (status === 'connecting') {
        elements.statusDot.classList.add('connecting');
        elements.connectBtn.disabled = true;
        elements.disconnectBtn.disabled = true;
        elements.wsUrlDisplay.textContent = `Bridging connection...`;
    } else if (status === 'error') {
        elements.statusDot.classList.add('error');
        elements.connectBtn.disabled = false;
        elements.disconnectBtn.disabled = true;
        elements.wsUrlDisplay.textContent = `Cluster Link Error • ${wsUrl}`;
    } else {
        elements.connectBtn.disabled = false;
        elements.disconnectBtn.disabled = true;
        elements.wsUrlDisplay.textContent = `Systems offline • ${wsUrl}`;
    }
}

function updateEditorStatus(isOnline, projectId = null) {
    if (!elements.editorStatus.container) return;

    // Only update if the projectId matches our current project
    if (projectId && projectId !== currentProjectId) return;

    elements.editorStatus.container.style.display = 'flex';
    elements.editorStatus.dot.className = 'status-dot ' + (isOnline ? 'connected' : 'error');
    elements.editorStatus.text.textContent = isOnline ? 'Editor Online' : 'Editor Offline';
}

function updateProjectDisplay() {
    if (elements.project.display) {
        elements.project.display.textContent = currentProjectId ? `CODE: ${currentProjectId}` : '';
        elements.project.display.style.display = currentProjectId ? 'inline-block' : 'none';
    }
    if (elements.project.input) {
        elements.project.input.value = currentProjectId;
    }

    if (elements.member.display) {
        elements.member.display.textContent = currentMemberName ? `NAME: ${currentMemberName}` : '';
        elements.member.display.style.display = currentMemberName ? 'inline-block' : 'none';
    }
    if (elements.member.input) {
        elements.member.input.value = currentMemberName;
    }
}

function showStatusMessage(msg) {
    if (elements.lastSyncTime) {
        elements.lastSyncTime.textContent = msg.toUpperCase();
    }
}

function updatePresenceUI(clients) {
    if (!elements.presenceList) return;

    if (!clients || clients.length === 0) {
        elements.presenceList.innerHTML = '';
        return;
    }

    // Filter out ourselves
    const others = clients.filter(c => c.SenderId !== sessionId);

    if (others.length === 0) {
        elements.presenceList.innerHTML = '';
        return;
    }

    elements.presenceList.innerHTML = others.map(client => {
        const icon = getPlatformIcon(client.Platform);
        return `
            <div class="presence-badge" title="${client.Name} (${client.Platform}) • Last seen ${client.LastSeen}">
                <i data-lucide="${icon}"></i>
                <span>${client.Name}</span>
            </div>
        `;
    }).join('');

    // Refresh Lucide icons
    if (window.lucide) {
        window.lucide.createIcons({
            root: elements.presenceList
        });
    }
}

function getPlatformIcon(platformStr) {
    const p = (platformStr || '').toLowerCase();
    if (p.includes('editor')) return 'monitor';
    if (p.includes('android') || p.includes('iphone') || p.includes('ios')) return 'smartphone';
    if (p.includes('web') || p.includes('browser') || p.includes('dashboard')) return 'globe';
    if (p.includes('windows') || p.includes('mac')) return 'laptop';
    return 'user';
}

function renderBoard(tasks, isCached = false) {
    currentTasks = tasks;
    const filter = elements.searchBox.value.toLowerCase();

    // Clear and Reset
    Object.values(elements.lists).forEach(list => list.innerHTML = '');

    // If no project is specified

    tasks.forEach((task, index) => {
        const title = (task.Title || '').toLowerCase();
        const desc = (task.Description || '').toLowerCase();

        if (filter && !title.includes(filter) && !desc.includes(filter)) {
            return;
        }

        const statusKey = statusMapping[task.Status] || 'Pending';
        const listEl = elements.lists[statusKey];

        if (listEl) {
            const card = createTaskCard(task, index);
            listEl.appendChild(card);

            // Refresh Lucide Icons for this specific card
            if (window.lucide) {
                window.lucide.createIcons({
                    root: card
                });
            }
        }
    });

    const syncLabel = isCached ? 'LAST SYNC (CACHED)' : 'LAST SYNC';
    elements.lastSyncTime.textContent = `${syncLabel}: ${new Date().toLocaleTimeString()}`;
}

function createTaskCard(task, index) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.style.animationDelay = `${index * 0.05}s`;

    const priority = typeof task.Priority === 'number' ? priorityMapping[task.Priority] : (task.Priority || 'Medium');
    const assigneeInitials = task.Assignee ? task.Assignee.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';
    const assignerInitials = task.Assigner ? task.Assigner.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';

    let linksHtml = '';
    if (task.Links && task.Links.length > 0) {
        linksHtml = `
            <div class="task-links">
                ${task.Links.map(link => `
                    <div class="link-item" title="${link.ObjectName} (${link.ObjectType || 'Unity Object'})">
                        <i data-lucide="${getLinkIcon(link.ObjectType)}"></i>
                        <span>${link.ObjectName || 'Unnamed Link'}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    card.innerHTML = `
        <div class="priority-tag priority-${priority}"></div>
        <div class="task-title">${task.Title || 'Untitled Sequence'}</div>
        <div class="task-desc">${task.Description || 'No metadata available for this task.'}</div>
        ${linksHtml}
        <div class="task-footer">
            <div class="task-people">
                <div class="person-info" title="Assignee">
                    <div class="avatar-circle">${assigneeInitials}</div>
                    <span>${task.Assignee || 'Unassigned'}</span>
                </div>
                <div class="person-link">
                    <i data-lucide="arrow-right"></i>
                </div>
                <div class="person-info" title="Assigner">
                    <div class="avatar-circle assigner-avatar">${assignerInitials}</div>
                    <span>${task.Assigner || 'Admin'}</span>
                </div>
            </div>
            <div class="priority-label label-${priority}">${priority}</div>
        </div>
    `;

    return card;
}

function getLinkIcon(type) {
    if (!type) return 'link';
    const t = type.toLowerCase();
    if (t.includes('gameobject')) return 'box';
    if (t.includes('material')) return 'layers';
    if (t.includes('texture')) return 'image';
    if (t.includes('script') || t.includes('code')) return 'code';
    if (t.includes('scene')) return 'map';
    if (t.includes('audio')) return 'music';
    if (t.includes('animation')) return 'film';
    if (t.includes('prefab')) return 'package';
    return 'file';
}

function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) return;

    updateStatus('connecting');

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            updateStatus('connected');
            updateProjectDisplay();
            showStatusMessage(`CONNECTED. PROJECT: ${currentProjectId}`);

            // Only request initial sync if project is set
            if (currentProjectId) {
                // 1. Join Project
                if (currentMemberName) {
                    socket.send(JSON.stringify({
                        sender: 'mobile',
                        senderId: sessionId,
                        projectId: currentProjectId,
                        platform: platform,
                        type: 'member_join',
                        payload: currentMemberName
                    }));
                }

                // 2. Request Sync
                socket.send(JSON.stringify({
                    sender: 'mobile',
                    senderId: sessionId,
                    projectId: currentProjectId,
                    platform: platform,
                    type: 'request_sync',
                    payload: 'Initialize Dashboard'
                }));
            } else {
                showStatusMessage("Enter Invite Code to begin");
            }

            if (reconnectTimer) {
                clearInterval(reconnectTimer);
                reconnectTimer = null;
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log(`Received ${data.type} from ${data.sender} [Project: ${data.projectId || 'none'}]`);

                // Strict Filtering: Project ID mismatch
                // If message has no projectId or it doesn't match our current selection, ignore it
                if (data.projectId !== currentProjectId) {
                    return;
                }

                // Filtering: If targetId is set and doesn't match our sessionId, ignore the message
                if (data.targetId && data.targetId !== sessionId) {
                    console.log(`Skipping message targeted for ${data.targetId}`);
                    return;
                }

                if (data.type === 'editor_status') {
                    updateEditorStatus(data.status === 'online', data.projectId);
                }

                if (data.type === 'status') {
                    showStatusMessage(data.payload);
                    if (data.editorOffline !== undefined) {
                        updateEditorStatus(!data.editorOffline, data.projectId);
                    }
                }

                if (data.type === 'task_sync' && data.payload) {
                    if (data.editorOffline !== undefined) {
                        updateEditorStatus(!data.editorOffline, data.projectId);
                    } else if (data.sender === 'editor') {
                        updateEditorStatus(true, data.projectId);
                    }

                    const taskData = JSON.parse(data.payload);

                    // Update presence UI
                    if (taskData.ActiveClients) {
                        updatePresenceUI(taskData.ActiveClients);
                    }

                    if (taskData.Tasks && taskData.Tasks.length > 0) {
                        renderBoard(taskData.Tasks, data.isCached);
                    } else {
                        renderBoard([]);
                        showStatusMessage(`No tasks found for project: ${currentProjectId}`);
                    }
                }
            } catch (e) {
                console.warn('Sync packet corrupted:', e);
            }
        };

        socket.onclose = () => {
            // Only sets to disconnected if we weren't in an error state
            if (elements.statusText.textContent.toLowerCase() !== 'error') {
                updateStatus('disconnected');
            }

            // Auto-reconnect logic
            if (!reconnectTimer) {
                reconnectTimer = setInterval(connect, 5000);
            }
        };

        socket.onerror = (error) => {
            console.error('Core Link Failure:', error);
            updateStatus('error');
        };

    } catch (err) {
        console.error('Initialization Failure:', err);
        updateStatus('error');
    }
}

function disconnect() {
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) socket.close();
}

// --- Page Specific Initialization ---

function initInvitePage() {
    // Parse URL Parameters
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get('projectId');
    const urlName = params.get('name');

    if (!urlProjectId) {
        if (elements.inviteForm) elements.inviteForm.style.display = 'none';
        if (elements.noInviteMsg) elements.noInviteMsg.style.display = 'block';
        return;
    }

    currentProjectId = urlProjectId;
    localStorage.setItem('lastProjectId', urlProjectId);

    if (urlName) {
        currentMemberName = urlName;
        localStorage.setItem('lastMemberName', urlName);
    }

    if (elements.project.input) elements.project.input.value = currentProjectId;
    if (elements.member.input) elements.member.input.value = currentMemberName;

    elements.joinBtn.addEventListener('click', () => {
        const code = elements.project.input.value.trim();
        const name = elements.member.input.value.trim();

        if (!code || !name) {
            elements.errorMsg.textContent = "Please provide both an Invite Code and Member Name.";
            elements.errorMsg.style.display = 'block';
            return;
        }

        currentProjectId = code;
        currentMemberName = name;
        localStorage.setItem('lastProjectId', code);
        localStorage.setItem('lastMemberName', name);

        // Redirect to dashboard (now dashboard.html)
        location.href = 'dashboard.html';
    });
}

function initDashboardPage() {
    // Check for credentials
    if (!currentProjectId || !currentMemberName) {
        location.href = 'index.html';
        return;
    }

    // Connect automatically
    connect();

    // Event Listeners for Dashboard
    if (elements.connectBtn) elements.connectBtn.addEventListener('click', () => {
        if (reconnectTimer) clearInterval(reconnectTimer);
        connect();
    });

    if (elements.disconnectBtn) elements.disconnectBtn.addEventListener('click', disconnect);
    if (elements.searchBox) elements.searchBox.addEventListener('input', () => renderBoard(currentTasks));

    if (elements.switchBtn) {
        elements.switchBtn.addEventListener('click', () => {
            disconnect();
            location.href = 'index.html';
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();

    if (isInvitePage) {
        initInvitePage();
    } else {
        initDashboardPage();
    }
});

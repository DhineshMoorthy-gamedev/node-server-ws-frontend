const wsUrl = 'wss://node-server-ws.onrender.com';
let socket = null;
let currentTasks = [];
let reconnectTimer = null;
const sessionId = Math.random().toString(36).substring(2, 11); // Generate unique session ID

const elements = {
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
    counts: {
        Pending: document.getElementById('count-pending'),
        InProgress: document.getElementById('count-inprogress'),
        Completed: document.getElementById('count-completed'),
        Blocked: document.getElementById('count-blocked')
    }
};

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

function renderBoard(tasks) {
    currentTasks = tasks;
    const filter = elements.searchBox.value.toLowerCase();

    // Clear and Reset
    Object.values(elements.lists).forEach(list => list.innerHTML = '');
    const columnCounts = { Pending: 0, InProgress: 0, Completed: 0, Blocked: 0 };

    tasks.forEach((task, index) => {
        const title = (task.Title || '').toLowerCase();
        const desc = (task.Description || '').toLowerCase();

        if (filter && !title.includes(filter) && !desc.includes(filter)) {
            return;
        }

        const statusKey = statusMapping[task.Status] || 'Pending';
        const listEl = elements.lists[statusKey];

        if (listEl) {
            columnCounts[statusKey]++;
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

    // Update Meta
    Object.keys(columnCounts).forEach(key => {
        elements.counts[key].textContent = columnCounts[key];
    });

    elements.lastSyncTime.textContent = `LAST SYNC: ${new Date().toLocaleTimeString()}`;
}

function createTaskCard(task, index) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.style.animationDelay = `${index * 0.05}s`;

    const priority = typeof task.Priority === 'number' ? priorityMapping[task.Priority] : (task.Priority || 'Medium');
    const initials = task.Assignee ? task.Assignee.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';

    card.innerHTML = `
        <div class="priority-tag priority-${priority}"></div>
        <div class="task-title">${task.Title || 'Untitled Sequence'}</div>
        <div class="task-desc">${task.Description || 'No metadata available for this task.'}</div>
        <div class="task-footer">
            <div class="task-assignee">
                <div class="avatar-circle">${initials}</div>
                <span>${task.Assignee || 'Unassigned'}</span>
            </div>
            <div class="priority-label label-${priority}">${priority}</div>
        </div>
    `;

    return card;
}

function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) return;

    updateStatus('connecting');

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            updateStatus('connected');

            // Request initial sync
            socket.send(JSON.stringify({
                sender: 'mobile',
                senderId: sessionId,
                type: 'request_sync',
                payload: 'Initialize Dashboard'
            }));

            if (reconnectTimer) {
                clearInterval(reconnectTimer);
                reconnectTimer = null;
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Filtering: If targetId is set and doesn't match our sessionId, ignore the message
                if (data.targetId && data.targetId !== sessionId) {
                    console.log(`Skipping message targeted for ${data.targetId}`);
                    return;
                }

                if (data.type === 'task_sync' && data.payload) {
                    const taskData = JSON.parse(data.payload);
                    if (taskData.Tasks) {
                        renderBoard(taskData.Tasks);
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

// Event Listeners
elements.connectBtn.addEventListener('click', () => {
    if (reconnectTimer) clearInterval(reconnectTimer);
    connect();
});
elements.disconnectBtn.addEventListener('click', disconnect);
elements.searchBox.addEventListener('input', () => renderBoard(currentTasks));

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    connect();
});


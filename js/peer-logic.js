var peer, conn;
var myID = "";
var currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var messagesArray = []; 
var currentFriendID = "Unknown";
var requestTimer; 

// --- VARIABLES ---
var incomingFiles = {}; 
var outgoingTransfers = {}; 
var CHUNK_SIZE = 64 * 1024; 
var activeTransferCount = 0;

// --- CALL VARIABLES ---
var currentCall = null;
var localStream = null;
var callTimerInt;

// --- KEYBOARD SAFETY ---
window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        alert("⚠️ Screenshots disabled!");
        document.body.style.display = 'none';
        setTimeout(() => document.body.style.display = 'flex', 1000);
    }
});

function updateTransferWarning(change) {
    activeTransferCount += change;
    if (activeTransferCount < 0) activeTransferCount = 0;
    
    const banner = document.getElementById('transfer-warning');
    if (activeTransferCount > 0) {
        banner.style.display = 'block'; 
        document.body.classList.add('transfer-active');
        window.onbeforeunload = () => "File transfer in progress. Are you sure?";
        
        // Auto-hide after 15 seconds (Safety fallback)
        setTimeout(() => { banner.style.display = 'none'; }, 15000);
        
    } else {
        banner.style.display = 'none'; 
        document.body.classList.remove('transfer-active');
        window.onbeforeunload = null;
    }
}

// --- AUTO-RECONNECT ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible' && peer && peer.disconnected) {
        peer.reconnect();
    }
});

window.onload = () => {
    // 1. Show Guide if not seen before
    if (!localStorage.getItem('seen_guide')) {
        const guide = document.getElementById('welcome-guide');
        if(guide) {
            guide.style.display = 'flex';
            
            // 2. Auto-hide after 3 seconds (3000 milliseconds)
            setTimeout(() => {
                guide.style.display = 'none';
                localStorage.setItem('seen_guide', 'true');
            }, 3000); 
        }
    }
    
    // 3. Restore Avatar (Keep your existing avatar logic)
    const saved = localStorage.getItem('my_avatar');
    if (saved) currentAvatar = saved;
};
    
    // Restore Avatar
    const saved = localStorage.getItem('my_avatar');
    if (saved) {
        currentAvatar = saved;
        document.getElementById('my-avatar-display').src = saved;
    }
};

function startApp() {
    let rawID = document.getElementById('chosen-id').value.trim();
    myID = rawID.toLowerCase().replace(/\s/g, ''); 
    if (!myID) return alert("Enter ID!");

    peer = new Peer(myID, { debug: 1 });

    peer.on('open', (id) => {
        // --- THE FIX: Remove Login Screen so you can click things ---
        const login = document.getElementById('login-screen');
        if(login) {
            login.style.display = 'none';
            login.remove(); // Physically remove it so it can't block clicks
        }

        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('display-name').innerText = id;
        document.getElementById('my-avatar-display').src = currentAvatar;
        
        setInterval(checkFriendStatus, 4000);

        // --- FIX: ACTIVATE CONNECT BUTTON ---
        document.getElementById('connect-btn').onclick = () => {
            const friendID = document.getElementById('friend-id').value.trim().toLowerCase().replace(/\s/g, '');
            if (!friendID) return alert("Please enter Friend's ID");
            if (friendID === myID) return alert("You cannot connect to yourself!");

            const btn = document.getElementById('connect-btn');
            btn.innerText = "Connecting...";
            
            // Initiate connection
            const conn = peer.connect(friendID, { reliable: true });

            conn.on('open', () => {
                btn.innerText = "Connected!";
                btn.style.background = "#2ecc71"; // Green
                // Send a handshake request immediately
                conn.send({ type: 'REQ', sender: myID });
            });

            conn.on('error', (err) => {
                alert("Connection failed. Is friend online?");
                btn.innerText = "Connect";
                btn.style.background = "#00d1b2"; // Reset color
            });
        };
    });

    peer.on('connection', (incoming) => {
        incoming.on('data', (data) => {
            if (data.type === 'REQ') showRequest(incoming, data.sender);
            if (data.type === 'CHAT') renderMessage(data);
            if (data.type === 'FILE_START') handleFileStart(data);
            if (data.type === 'FILE_CHUNK') handleIncomingChunk(data);
            if (data.type === 'AUDIO') renderMessage(data);
            if (data.type === 'SAVE_REQ') handleSaveRequest(incoming);
            if (data.type === 'HANGUP') endCall();
            if (data.type === 'DEL') document.getElementById(data.id)?.remove();
        });
    });

    peer.on('call', (call) => {
        window.incomingCallObject = call;
        document.getElementById('video-overlay').style.display = 'flex';
    });
}

function showRequest(temp, sender) {
    const pop = document.getElementById('request-popup');
    pop.style.display = 'flex';
    document.getElementById('request-msg').innerText = sender + " wants to connect.";
    
    document.getElementById('accept-btn').onclick = () => {
        conn = temp; currentFriendID = sender;
        conn.send({ type: 'ACC', sender: myID });
        pop.style.display = 'none';
        setupChat();
    };
    
    document.getElementById('reject-btn').onclick = () => { 
        temp.send({ type: 'REJ' }); 
        pop.style.display = 'none'; 
    };
}

function setupChat() {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('status-dot').className = "dot online";
    
    document.getElementById('send-btn').onclick = () => {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if(!text || !conn) return;
        const msg = { type: 'CHAT', sender: myID, text: text, id: 'm-'+Date.now() };
        conn.send(msg); 
        renderMessage(msg); 
        input.value = "";
    };
}

// --- FILE LOGIC ---
function sendFileInChunks(file) {
    if (!file || !conn) return;
    updateTransferWarning(1);
    
    const fileId = 'f-' + Date.now();
    const msgId = 'm-' + Date.now();
    
    conn.send({ type: 'FILE_START', fileId, name: file.name, size: file.size, msgId });
    renderFileProgress(msgId, file.name, 0, true);
    
    let offset = 0;
    const sendNext = () => {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => {
            conn.send({ type: 'FILE_CHUNK', fileId, data: e.target.result });
            offset += CHUNK_SIZE;
            updateProgress(msgId, Math.floor((offset / file.size) * 100));
            if (offset < file.size) {
                setTimeout(sendNext, 10);
            } else {
                updateTransferWarning(-1);
                updateProgress(msgId, 100, true);
            }
        };
        reader.readAsArrayBuffer(slice);
    };
    sendNext();
}

function handleFileStart(data) {
    incomingFiles[data.fileId] = { buffer: [], received: 0, size: data.size, name: data.name, msgId: data.msgId };
    renderFileProgress(data.msgId, data.name, 0);
    updateTransferWarning(1);
}

function handleIncomingChunk(data) {
    const file = incomingFiles[data.fileId];
    if (!file) return;
    file.buffer.push(data.data);
    file.received += data.data.byteLength;
    updateProgress(file.msgId, Math.floor((file.received / file.size) * 100));
    
    if (file.received >= file.size) {
        const blob = new Blob(file.buffer);
        const url = URL.createObjectURL(blob);
        replaceProgressWithFile(file.msgId, url, file.name);
        delete incomingFiles[data.fileId];
        updateTransferWarning(-1);
    }
}

// --- RENDER MESSAGE (With Lock/Unlock Logic) ---
function renderMessage(data, isHistory = false) {
    const isMe = data.sender === myID;
    const chatBox = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.id = data.id || 'm-'+Date.now();
    row.className = `msg-row ${isMe ? 'sent' : 'received'}`;
    
    let content = "";
    let mediaTag = "";

    // If Audio or Video
    if (data.type === 'AUDIO') mediaTag = `<audio controls src="${data.fileData || ''}" class="chat-audio"></audio>`;
    if (data.type === 'VIDEO') mediaTag = `<video controls playsinline src="${data.fileData || ''}" class="chat-video"></video>`;

    if (data.type === 'AUDIO' || data.type === 'VIDEO') {
        if(!data.fileData && isHistory) { 
            content = `<span class="text" style="color:#aaa; font-style:italic;">${data.text}</span>`; 
        } else {
             // Logic for Lock/Unlock buttons
             const btnClass = isMe ? "dl-btn dl-unlocked" : "dl-btn dl-locked"; 
             const btnIcon = isMe ? "⬇️" : "🔒";
             const btnAction = isMe ? `unlockDownload('${data.id}')` : `requestDownload('${data.id}')`;
             content = `<div class="media-wrap">${mediaTag}<div id="btn-${data.id}" class="${btnClass}" onclick="${btnAction}">${btnIcon}</div></div>`;
        }
    } else if (data.type === 'FILE') { 
        content = `<a href="${data.fileData}" download="${data.fileName}" class="file-link">📄 ${data.fileName}</a>`; 
    } else { 
        content = `<span class="text">${data.text}</span>`; 
    }
    
    const tools = (isMe && !isHistory) ? `<div class="tools"><span onclick="delMsg('${data.id}')">🗑️</span></div>` : '';
    
    row.innerHTML = `<div class="bubble">${content}</div>${tools}`;
    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- CALLING ---
function startVideoCall() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        document.getElementById('local-video').srcObject = stream;
        document.getElementById('video-overlay').style.display = 'flex';
        const call = peer.call(currentFriendID, stream);
        setupCallHandlers(call);
    });
}

function setupCallHandlers(call) {
    call.on('stream', remoteStream => {
        document.getElementById('remote-video').srcObject = remoteStream;
    });
}

function endCall() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    document.getElementById('video-overlay').style.display = 'none';
}

function checkFriendStatus() {
    if (conn && conn.open) return;
    const fid = document.getElementById('friend-id').value.trim().toLowerCase();
    if (!fid) return;
    const ping = peer.connect(fid, { reliable: false });
    ping.on('open', () => { document.getElementById('status-dot').className = "dot online"; ping.close(); });
    ping.on('error', () => { document.getElementById('status-dot').className = "dot offline"; });
}
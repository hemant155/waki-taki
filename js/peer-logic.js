var peer, conn;
var myID = "";
var currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var messagesArray = []; 
var currentFriendID = "Unknown";
var incomingFiles = {}; 
var outgoingTransfers = {}; 
var CHUNK_SIZE = 64 * 1024; 
var activeTransferCount = 0;
var currentCall = null;
var localStream = null;

window.onload = () => {
    if (!localStorage.getItem('seen_guide')) {
        document.getElementById('welcome-guide').style.display = 'flex';
    }
};

function startApp() {
    let rawID = document.getElementById('chosen-id').value.trim();
    myID = rawID.toLowerCase().replace(/\s/g, ''); 
    if (!myID) return alert("Enter ID!");

    peer = new Peer(myID, { debug: 1 });

    peer.on('open', (id) => {
        const login = document.getElementById('login-screen');
        login.style.display = 'none';
        login.remove(); // DELETE FROM DOM TO FIX IPHONE FREEZE

        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('display-name').innerText = id;
        document.getElementById('my-avatar-display').src = currentAvatar;
        setInterval(checkFriendStatus, 4000);
    });

    peer.on('connection', (incoming) => {
        incoming.on('data', (data) => {
            if (data.type === 'REQ') showRequest(incoming, data.sender);
            if (data.type === 'FILE_CHUNK') handleIncomingChunk(data);
            if (data.type === 'FILE_START') handleFileStart(data);
            if (data.type === 'CHAT') renderMessage(data);
            if (data.type === 'HANGUP') endCall();
        });
    });

    peer.on('call', (call) => {
        window.incomingCallObject = call;
        document.getElementById('video-overlay').style.display = 'flex';
        document.getElementById('call-status').innerText = "Incoming Call...";
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
        temp.send({ type: 'REJ' }); pop.style.display = 'none';
    };
}

function setupChat() {
    document.getElementById('status-dot').className = "dot online";
    conn.on('data', (data) => {
        if (data.type === 'CHAT') renderMessage(data);
        if (data.type === 'FILE_CHUNK') handleIncomingChunk(data);
        // ... (all other listeners)
    });
}

// --- FILE CHUNKING LOGIC ---
function handleFileStart(data) {
    incomingFiles[data.fileId] = { buffer: [], received: 0, size: data.size, name: data.name };
}

function handleIncomingChunk(data) {
    const file = incomingFiles[data.fileId];
    if (!file) return;
    file.buffer.push(data.data);
    file.received += data.data.byteLength;
    if (file.received >= file.size) {
        const blob = new Blob(file.buffer);
        const url = URL.createObjectURL(blob);
        renderMessage({ sender: currentFriendID, text: `<a href="${url}" download="${file.name}">📄 Download ${file.name}</a>` });
        delete incomingFiles[data.fileId];
    }
}

// --- CALLING FUNCTIONS ---
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

function renderMessage(data) {
    const box = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.className = `msg-row ${data.sender === myID ? 'sent' : 'received'}`;
    row.innerHTML = `<div class="bubble">${data.text}</div>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}

function checkFriendStatus() {
    if (conn && conn.open) return;
    const fid = document.getElementById('friend-id').value.trim().toLowerCase();
    if (!fid) return;
    const ping = peer.connect(fid, { reliable: false });
    ping.on('open', () => { document.getElementById('status-dot').className = "dot online"; ping.close(); });
    ping.on('error', () => { document.getElementById('status-dot').className = "dot offline"; });
}

window.closeGuide = () => { document.getElementById('welcome-guide').style.display = 'none'; localStorage.setItem('seen_guide', 'true'); };
window.selectAvatar = (el) => { 
    document.querySelectorAll('.avatar-pick').forEach(img => img.classList.remove('active'));
    el.classList.add('active'); currentAvatar = el.src; 
};
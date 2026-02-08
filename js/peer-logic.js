var peer, conn, myID, currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var incomingFiles = {}, outgoingTransfers = {}, CHUNK_SIZE = 64 * 1024;
var currentCall, localStream;

window.onload = () => {
    if (!localStorage.getItem('seen_guide')) document.getElementById('welcome-guide').style.display = 'flex';
    const saved = localStorage.getItem('my_avatar');
    if (saved) currentAvatar = saved;
};

function startApp() {
    let rawID = document.getElementById('chosen-id').value.trim();
    myID = rawID.toLowerCase().replace(/\s/g, ''); 
    if (!myID) return alert("Enter ID!");

    peer = new Peer(myID, { debug: 1 });

    peer.on('open', (id) => {
        // --- THE FIX: CLEANUP LOGIN ---
        const login = document.getElementById('login-screen');
        login.style.display = 'none';
        login.remove(); 

        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('display-name').innerText = id;
        document.getElementById('my-avatar-display').src = currentAvatar;
        setInterval(checkFriendStatus, 4000);
    });

    peer.on('connection', (incoming) => {
        incoming.on('data', (data) => {
            if (data.type === 'REQ') showRequest(incoming, data.sender);
            if (data.type === 'CHAT') renderMessage(data);
            if (data.type === 'FILE_START') handleFileStart(data);
            if (data.type === 'FILE_CHUNK') handleIncomingChunk(data);
            if (data.type === 'AUDIO') renderMessage(data);
            if (data.type === 'HANGUP') endCall();
        });
    });

    peer.on('call', (call) => {
        window.incomingCallObject = call;
        document.getElementById('incoming-call-popup').style.display = 'flex';
    });
}

// --- FILE CHUNKING ENGINE ---
function handleFileStart(data) {
    incomingFiles[data.fileId] = { buffer: [], received: 0, size: data.size, name: data.name, msgId: data.msgId };
    renderFileProgress(data.msgId, data.name, 0);
}

function handleIncomingChunk(data) {
    const file = incomingFiles[data.fileId];
    if (!file) return;
    file.buffer.push(data.data);
    file.received += data.data.byteLength;
    const progress = Math.floor((file.received / file.size) * 100);
    updateProgress(file.msgId, progress);

    if (file.received >= file.size) {
        const blob = new Blob(file.buffer);
        const url = URL.createObjectURL(blob);
        replaceProgressWithFile(file.msgId, url, file.name);
        delete incomingFiles[data.fileId];
    }
}

function startVideoCall() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        document.getElementById('local-video').srcObject = stream;
        document.getElementById('video-overlay').style.display = 'flex';
        const call = peer.call(currentFriendID, stream);
        call.on('stream', rs => document.getElementById('remote-video').srcObject = rs);
    });
}

function endCall() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    document.getElementById('video-overlay').style.display = 'none';
}

function renderMessage(data) {
    const box = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.id = data.id || 'm-' + Date.now();
    row.className = `msg-row ${data.sender === myID ? 'sent' : 'received'}`;
    
    let content = data.text || "";
    if (data.type === 'AUDIO') content = `<audio controls src="${data.fileData}"></audio>`;
    
    row.innerHTML = `<div class="bubble">${content}</div>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}
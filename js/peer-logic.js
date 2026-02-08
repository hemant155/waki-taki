var peer, conn, myID, currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var messagesArray = [], incomingFiles = {}, outgoingTransfers = {}, CHUNK_SIZE = 64 * 1024;
var currentCall, localStream, callTimerInt;

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
        const login = document.getElementById('login-screen');
        login.style.display = 'none';
        login.remove(); // The iPhone Freeze Fix

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
            if (data.type === 'SAVE_REQ') handleSaveRequest(incoming);
            if (data.type === 'HANGUP') endCall();
            if (data.type === 'DEL') document.getElementById(data.id)?.remove();
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
    document.getElementById('reject-btn').onclick = () => { temp.send({ type: 'REJ' }); pop.style.display = 'none'; };
}

function setupChat() {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('status-dot').className = "dot online";
    document.getElementById('send-btn').onclick = () => {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if(!text || !conn) return;
        const msg = { type: 'CHAT', sender: myID, text: text, id: 'm-'+Date.now() };
        conn.send(msg); renderMessage(msg); input.value = "";
    };
}

// --- FILE LOGIC ---
function sendFileInChunks(file) {
    if (!file || !conn) return;
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
            if (offset < file.size) setTimeout(sendNext, 10);
            else updateProgress(msgId, 100, true);
        };
        reader.readAsArrayBuffer(slice);
    };
    sendNext();
}

function handleFileStart(data) {
    incomingFiles[data.fileId] = { buffer: [], received: 0, size: data.size, name: data.name, msgId: data.msgId };
    renderFileProgress(data.msgId, data.name, 0);
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
    }
}

// --- CALL LOGIC ---
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

function checkFriendStatus() {
    if (conn && conn.open) return;
    const fid = document.getElementById('friend-id').value.trim().toLowerCase();
    if (!fid) return;
    const ping = peer.connect(fid, { reliable: false });
    ping.on('open', () => { document.getElementById('status-dot').className = "dot online"; ping.close(); });
    ping.on('error', () => { document.getElementById('status-dot').className = "dot offline"; });
}

window.shareMyID = function() {
    const id = document.getElementById('display-name').innerText;
    navigator.clipboard.writeText(id).then(() => alert("ID Copied!"));
};

function renderMessage(data) {
    const box = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.id = data.id || 'm-'+Date.now();
    row.className = `msg-row ${data.sender === myID ? 'sent' : 'received'}`;
    let content = data.text || "";
    if (data.type === 'AUDIO') content = `<audio controls src="${data.fileData}"></audio>`;
    if (data.type === 'FILE') content = `<a href="${data.fileData}" download="${data.fileName}">📄 ${data.fileName}</a>`;
    row.innerHTML = `<div class="bubble">${content}</div><div class="meta"><span onclick="delMsg('${row.id}')">🗑️</span></div>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}
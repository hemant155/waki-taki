var peer, conn, myID, currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var incomingFiles = {}, outgoingTransfers = {}, CHUNK_SIZE = 64 * 1024;
var currentCall, localStream;

window.onload = () => {
    if (!localStorage.getItem('seen_guide')) {
        const guide = document.getElementById('welcome-guide');
        guide.style.display = 'flex';
        // Auto-disappear after 8 seconds
        setTimeout(() => { closeGuide(); }, 8000);
    }
    const saved = localStorage.getItem('my_avatar');
    if (saved) currentAvatar = saved;
};

function startApp() {
    let rawID = document.getElementById('chosen-id').value.trim();
    myID = rawID.toLowerCase().replace(/\s/g, ''); 
    if (!myID) return alert("Enter ID!");

    peer = new Peer(myID, { debug: 1 });

    peer.on('open', (id) => {
        document.getElementById('login-screen').remove(); // Kills the invisible layer
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
    document.getElementById('reject-btn').onclick = () => { temp.send({ type: 'REJ' }); pop.style.display = 'none'; };
}

function setupChat() {
    document.getElementById('status-dot').className = "dot online";
    document.getElementById('send-btn').onclick = () => {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if(!text || !conn) return;
        const msg = { type: 'CHAT', sender: myID, text: text };
        conn.send(msg); renderMessage(msg); input.value = "";
    };
}

function sendFileInChunks(file) {
    if (!file || !conn) return;
    const warn = document.getElementById('transfer-warning');
    warn.style.display = 'block';
    // Auto-hide warning after 5 seconds if it gets stuck
    setTimeout(() => { warn.style.display = 'none'; }, 5000);

    const fileId = 'f-' + Date.now();
    conn.send({ type: 'FILE_START', fileId, name: file.name, size: file.size });
    
    let offset = 0;
    const sendNext = () => {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => {
            conn.send({ type: 'FILE_CHUNK', fileId, data: e.target.result });
            offset += CHUNK_SIZE;
            if (offset < file.size) setTimeout(sendNext, 10);
            else { warn.style.display = 'none'; }
        };
        reader.readAsArrayBuffer(slice);
    };
    sendNext();
}

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
        renderMessage({ sender: currentFriendID, text: `<a href="${url}" download="${file.name}">📄 ${file.name}</a>` });
        delete incomingFiles[data.fileId];
    }
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
window.shareMyID = () => { navigator.clipboard.writeText(myID); alert("ID Copied!"); };
window.selectAvatar = (el) => { 
    document.querySelectorAll('.avatar-pick').forEach(img => img.classList.remove('active'));
    el.classList.add('active'); currentAvatar = el.src; 
};
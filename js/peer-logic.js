var peer, conn;
var myID = "";
var currentAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
var messagesArray = []; 
var currentFriendID = "Unknown";
var requestTimer; 

// --- VARIABLES ---
var incomingFiles = {}; 
var outgoingTransfers = {}; 
var CHUNK_SIZE = 64 * 1024; // 64KB Speed

window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        alert("⚠️ Screenshots disabled!");
        document.body.style.display = 'none';
        setTimeout(() => document.body.style.display = 'flex', 1000);
    }
});

// --- AUTO-RECONNECT & RESUME TRIGGER ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
        // If disconnected, try to reconnect
        if (conn && !conn.open && currentFriendID !== "Unknown") {
            console.log("App resumed. Reconnecting...");
            let temp = peer.connect(currentFriendID, { reliable: true });
            
            temp.on('open', () => {
                conn = temp;
                setupChat();
                alert("♻️ Connection Restored! Resuming transfers...");
                
                // CRITICAL FIX: Trigger Resume for all active transfers
                for (let fileId in outgoingTransfers) {
                    console.log(`Attempting to resume file: ${fileId}`);
                    conn.send({ type: 'RESUME_REQ', fileId: fileId });
                }
            });
        }
    }
});

window.onload = () => {
    let createdIDs = [];
    try { createdIDs = JSON.parse(localStorage.getItem('my_created_ids') || "[]"); } catch(e) {}
    if (createdIDs.length > 0) document.getElementById('chosen-id').value = createdIDs[createdIDs.length - 1];
    
    const savedAvatar = localStorage.getItem('my_avatar');
    if (savedAvatar) {
        currentAvatar = savedAvatar;
        const customPrev = document.getElementById('custom-preview');
        if(customPrev) { customPrev.src = savedAvatar; customPrev.style.display = 'block'; customPrev.classList.add('active'); }
    }

    let recentFriends = [];
    try { recentFriends = JSON.parse(localStorage.getItem('recent_friends') || "[]"); } catch(e) {}
    const dataList = document.getElementById('friend-history');
    if(dataList) {
        recentFriends.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            dataList.appendChild(opt);
        });
    }
};

function selectAvatar(el) {
    document.querySelectorAll('.avatar-pick').forEach(img => img.classList.remove('active'));
    el.classList.add('active');
    currentAvatar = el.src;
    localStorage.setItem('my_avatar', currentAvatar);
}

function handleFileUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentAvatar = e.target.result;
            const prev = document.getElementById('custom-preview');
            prev.src = currentAvatar; prev.style.display = 'block';
            document.querySelectorAll('.avatar-pick').forEach(img => img.classList.remove('active'));
            prev.classList.add('active');
            localStorage.setItem('my_avatar', currentAvatar);
        };
        reader.readAsDataURL(file);
    }
}

function startApp() {
    let rawID = document.getElementById('chosen-id').value.trim();
    myID = rawID.toLowerCase(); 

    if (!myID) return alert("Enter User ID!");

    let createdIDs = JSON.parse(localStorage.getItem('my_created_ids') || "[]");
    
    if (!createdIDs.includes(myID) && createdIDs.length >= 2) {
        const errorMsg = document.getElementById('id-error');
        errorMsg.style.display = 'block';
        errorMsg.innerText = `Limit Reached! You can only use: ${createdIDs.join(', ')}`;
        return;
    }

    if (!createdIDs.includes(myID)) {
        createdIDs.push(myID);
        localStorage.setItem('my_created_ids', JSON.stringify(createdIDs));
    }

    peer = new Peer(myID);

    peer.on('open', (id) => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('display-name').innerText = id;
        document.getElementById('my-avatar-display').src = currentAvatar;
        setInterval(checkFriendStatus, 3000);
    });

    peer.on('connection', (incoming) => {
        incoming.on('data', (data) => {
            if (data.type === 'REQ') showRequest(incoming, data.sender);
        });
    });
    
    peer.on('disconnected', () => { peer.reconnect(); });
}

function showRequest(temp, sender) {
    const pop = document.getElementById('request-popup');
    const timerText = document.getElementById('conn-timer');
    
    document.getElementById('request-msg').innerText = `${sender} wants to connect.`;
    pop.style.display = 'flex';
    if(navigator.vibrate) navigator.vibrate(200);

    let timeLeft = 30;
    timerText.innerText = `Auto-reject in ${timeLeft}s`;
    
    if (requestTimer) clearInterval(requestTimer);

    requestTimer = setInterval(() => {
        timeLeft--;
        timerText.innerText = `Auto-reject in ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(requestTimer);
            temp.send({ type: 'REJ' });
            pop.style.display = 'none';
            temp.close();
        }
    }, 1000);

    document.getElementById('accept-btn').onclick = () => {
        clearInterval(requestTimer);
        conn = temp;
        currentFriendID = sender;
        conn.send({ type: 'ACC', sender: myID });
        pop.style.display = 'none';
        setupChat();
    };

    document.getElementById('reject-btn').onclick = () => {
        clearInterval(requestTimer);
        temp.send({ type: 'REJ' });
        pop.style.display = 'none';
        setTimeout(() => temp.close(), 500);
    };
}

function checkFriendStatus() {
    const fid = document.getElementById('friend-id').value.trim().toLowerCase();
    const dot = document.getElementById('status-dot');
    if (conn && conn.open && conn.peer === fid) {
        dot.className = "dot online";
        return;
    }
    if (!fid) { dot.className = "dot offline"; return; }
    
    const ping = peer.connect(fid, { reliable: false });
    ping.on('open', () => { dot.className = "dot online"; ping.close(); });
    setTimeout(() => { if (!ping.open && (!conn || !conn.open)) dot.className = "dot offline"; }, 1500);
}

function setupChat() {
    document.getElementById('status-dot').className = "dot online";
    const fidInput = document.getElementById('friend-id').value.trim();
    if(fidInput) currentFriendID = fidInput;
    
    if (currentFriendID !== "Unknown") {
        let recents = JSON.parse(localStorage.getItem('recent_friends') || "[]");
        if (!recents.includes(currentFriendID)) {
            recents.push(currentFriendID);
            localStorage.setItem('recent_friends', JSON.stringify(recents));
        }
    }

    conn.on('data', (data) => {
        // --- 1. CHUNK HANDLER ---
        if (data.type === 'FILE_CHUNK') {
            handleIncomingChunk(data);
            return; 
        }
        
        // --- 2. FILE START ---
        if (data.type === 'FILE_START') {
            incomingFiles[data.fileId] = {
                buffer: [],
                size: data.size,
                received: 0,
                name: data.name,
                fileType: data.fileType,
                msgId: data.msgId,
                fileId: data.fileId,
                watchdog: null
            };
            renderFileProgress(data.msgId, data.name, 0, false, data.fileId);
            setTimeout(() => { conn.send({ type: 'FILE_ACK', fileId: data.fileId }); }, 100);
            return;
        }

        if (data.type === 'FILE_ACK') resumeSending(data.fileId, 0);
        
        // --- CANCEL SIGNAL ---
        if (data.type === 'FILE_CANCEL') {
            const transfer = outgoingTransfers[data.fileId] || incomingFiles[data.fileId];
            if (transfer) {
                if(transfer.watchdog) clearTimeout(transfer.watchdog);
                const row = document.getElementById(transfer.msgId);
                if (row) row.querySelector('.bubble').innerHTML = `<span style="color:#ff4757">🚫 Transfer Cancelled</span>`;
                delete outgoingTransfers[data.fileId];
                delete incomingFiles[data.fileId];
            }
        }

        // --- RESUME HANDSHAKE ---
        if (data.type === 'RESUME_REQ') {
            // SENDER is asking Receiver: "How much do you have?"
            const fileMeta = incomingFiles[data.fileId];
            if (fileMeta) {
                // Receiver Replies: "I have X bytes"
                conn.send({ type: 'RESUME_ACK', fileId: data.fileId, offset: fileMeta.received });
            }
        }
        if (data.type === 'RESUME_ACK') {
            // SENDER got reply: "Okay, resuming from X"
            resumeSending(data.fileId, data.offset);
        }

        // --- STANDARD MESSAGES ---
        if (['CHAT', 'IMG', 'AUDIO'].includes(data.type)) {
            renderMessage(data); 
            playSound();
            conn.send({ type: 'READ_RECEIPT', id: data.id });
        }
        
        if (data.type === 'READ_RECEIPT') markAsRead(data.id);
        if (data.type === 'TYPING_START') document.getElementById('typing-bar').style.display = 'block';
        if (data.type === 'TYPING_STOP') document.getElementById('typing-bar').style.display = 'none';
        
        if (data.type === 'REQ_DL') {
            if(confirm(`User wants to download/view your media. Allow?`)) {
                conn.send({ type: 'ACC_DL', msgId: data.msgId });
            }
        }
        if (data.type === 'ACC_DL') unlockDownload(data.msgId);

        if (data.type === 'SAVE_REQ') {
            const permPop = document.getElementById('perm-popup');
            const permTimer = document.getElementById('perm-timer');
            permPop.style.display = 'flex';
            document.getElementById('perm-msg').innerText = `${currentFriendID} wants to save this chat.`;
            let timeLeft = 15;
            permTimer.innerText = `Auto-deny in ${timeLeft}s`;
            if (requestTimer) clearInterval(requestTimer);
            requestTimer = setInterval(() => {
                timeLeft--;
                permTimer.innerText = `Auto-deny in ${timeLeft}s`;
                if (timeLeft <= 0) {
                    clearInterval(requestTimer);
                    conn.send({ type: 'SAVE_DENY' });
                    permPop.style.display = 'none';
                }
            }, 1000);
            document.getElementById('perm-allow').onclick = () => {
                clearInterval(requestTimer);
                document.getElementById('perm-allow').innerText = "Sending...";
                conn.send({ type: 'SAVE_ACC' });
                setTimeout(() => { permPop.style.display = 'none'; document.getElementById('perm-allow').innerText = "Allow"; }, 500);
            };
            document.getElementById('perm-deny').onclick = () => {
                clearInterval(requestTimer);
                conn.send({ type: 'SAVE_DENY' });
                permPop.style.display = 'none';
            };
        }
        
        if (data.type === 'SAVE_ACC') {
            const btn = document.getElementById('save-chat-btn');
            if(btn) { btn.innerHTML = '💾'; btn.style.color = 'white'; }
            setTimeout(() => {
                alert("✅ Permission Granted! Chat Saved.");
                const saveName = prompt("Name this chat:");
                const finalName = (saveName && saveName.trim() !== "") ? saveName : `Chat with ${currentFriendID}`;
                performLocalSave(finalName);
            }, 50);
        }

        if (data.type === 'SAVE_DENY') {
            const btn = document.getElementById('save-chat-btn');
            if(btn) { btn.innerHTML = '💾'; btn.style.color = 'red'; }
            setTimeout(() => { alert("❌ Permission Denied."); if(btn) btn.style.color = 'white'; }, 100);
        }

        if (data.type === 'DEL') document.getElementById(data.id)?.remove();
        if (data.type === 'EDIT') {
            const el = document.getElementById(data.id);
            if (el) el.querySelector('.text').innerText = data.text + " (edited)";
        }
    });

    conn.on('close', () => {
        document.getElementById('status-dot').className = "dot offline";
    });
}

function cancelTransfer(fileId) {
    if(conn && conn.open) conn.send({ type: 'FILE_CANCEL', fileId: fileId });
    if (outgoingTransfers[fileId]) {
        if(outgoingTransfers[fileId].timer) clearTimeout(outgoingTransfers[fileId].timer);
        const msgId = outgoingTransfers[fileId].msgId;
        delete outgoingTransfers[fileId];
        const row = document.getElementById(msgId);
        if (row) row.querySelector('.bubble').innerHTML = `<span style="color:#ff4757">🚫 Upload Cancelled</span>`;
    }
    if (incomingFiles[fileId]) {
        if(incomingFiles[fileId].watchdog) clearTimeout(incomingFiles[fileId].watchdog);
        const msgId = incomingFiles[fileId].msgId;
        delete incomingFiles[fileId];
        const row = document.getElementById(msgId);
        if (row) row.querySelector('.bubble').innerHTML = `<span style="color:#ff4757">🚫 Download Cancelled</span>`;
    }
}

function sendFileInChunks(file) {
    if (!conn || !conn.open) return alert("Disconnected!");
    const msgId = 'm-' + Date.now();
    const fileId = 'f-' + Date.now();
    
    outgoingTransfers[fileId] = { file: file, msgId: msgId, timer: null };
    
    conn.send({
        type: 'FILE_START',
        fileId: fileId,
        name: file.name,
        size: file.size,
        fileType: file.type,
        msgId: msgId
    });

    renderFileProgress(msgId, file.name, 0, true, fileId);
}

function resumeSending(fileId, offset) {
    const transfer = outgoingTransfers[fileId];
    if (!transfer) return;
    
    // Clear old timer to prevent double-speed bug
    if (transfer.timer) clearTimeout(transfer.timer);

    const file = transfer.file;
    const msgId = transfer.msgId;

    function sendNextChunk() {
        // Stop if connection died (we will resume later)
        if (!conn || !conn.open) return; 
        
        // Stop if transfer cancelled
        if (!outgoingTransfers[fileId]) return;

        // Congestion Control: Pause if buffer full
        if (conn.dataChannel.bufferedAmount > 8 * 1024 * 1024) {
            console.log("Buffer full, waiting...");
            outgoingTransfers[fileId].timer = setTimeout(sendNextChunk, 50);
            return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => {
            conn.send({ type: 'FILE_CHUNK', fileId: fileId, data: e.target.result, offset: offset });
            offset += CHUNK_SIZE;
            const percent = Math.min(100, Math.round((offset / file.size) * 100));
            updateProgress(msgId, percent);

            if (offset < file.size) {
                // Keep 15ms delay for stability
                outgoingTransfers[fileId].timer = setTimeout(sendNextChunk, 15); 
            } else {
                updateProgress(msgId, 100, true);
                delete outgoingTransfers[fileId];
            }
        };
        reader.readAsArrayBuffer(slice);
    }
    // Start loop
    sendNextChunk();
}

function handleIncomingChunk(data) {
    const fileMeta = incomingFiles[data.fileId];
    if (!fileMeta) return;

    // Watchdog: If I don't get next chunk in 3s, scream RESUME
    if (fileMeta.watchdog) clearTimeout(fileMeta.watchdog);
    fileMeta.watchdog = setTimeout(() => {
        console.log("Stuck? Requesting resume...");
        conn.send({ type: 'RESUME_REQ', fileId: data.fileId });
    }, 3000);

    if (data.offset === fileMeta.received) {
        fileMeta.buffer.push(data.data);
        fileMeta.received += data.data.byteLength;
        const percent = Math.min(100, Math.round((fileMeta.received / fileMeta.size) * 100));
        updateProgress(fileMeta.msgId, percent);

        if (fileMeta.received >= fileMeta.size) {
            
            clearTimeout(fileMeta.watchdog);

            if (fileMeta.size > 50 * 1024 * 1024) {
                renderLargeFileButton(fileMeta.msgId, data.fileId);
            } else {
                const blob = new Blob(fileMeta.buffer, { type: fileMeta.fileType });
                const url = URL.createObjectURL(blob);
                replaceProgressWithFile(fileMeta.msgId, url, fileMeta.fileType, fileMeta.name);
                delete incomingFiles[data.fileId];
            }
            playSound();
        }
    } else {
        // Immediate Gap Detection
        conn.send({ type: 'RESUME_REQ', fileId: data.fileId });
    }
}

function renderLargeFileButton(msgId, fileId) {
    const row = document.getElementById(msgId);
    if (!row) return;

    const content = `
        <div class="file-progress-card">
            <span style="font-size:12px; font-weight:bold;">File Ready! (Large)</span>
            <div style="margin-top:5px;">
                <button id="save-btn-${fileId}" onclick="saveLargeFile('${fileId}')" class="btn-success" style="font-size:11px;">💾 Save to Device</button>
            </div>
        </div>`;
    row.querySelector('.bubble').innerHTML = content;
}

function saveLargeFile(fileId) {
    const fileMeta = incomingFiles[fileId];
    if (!fileMeta) return alert("File data lost. Please request again.");

    const btn = document.getElementById(`save-btn-${fileId}`);
    if(btn) btn.innerText = "Processing...";

    setTimeout(() => {
        try {
            const blob = new Blob(fileMeta.buffer, { type: fileMeta.fileType });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileMeta.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => {
                URL.revokeObjectURL(url);
                delete incomingFiles[fileId];
                const row = document.getElementById(fileMeta.msgId);
                if(row) row.querySelector('.bubble').innerHTML = `<span style="color:#2ecc71">✅ Saved to Device</span>`;
            }, 1000);
            
        } catch(e) {
            alert("Memory Error: Device ran out of RAM.");
        }
    }, 100);
}


function renderFileProgress(id, fileName, percent, isMe = false, fileId = null) {
    const chatBox = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.id = id;
    row.className = `msg-row ${isMe ? 'sent' : 'received'}`;
    const cancelBtn = fileId ? `<button onclick="cancelTransfer('${fileId}')" style="background:transparent; border:none; color:#ff4757; font-weight:bold; cursor:pointer; margin-left:5px;">✕</button>` : '';
    const content = `
        <div class="file-progress-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${fileName}</span>
                ${cancelBtn}
            </div>
            <div class="progress-track"><div class="progress-fill" id="prog-${id}" style="width:${percent}%"></div></div>
            <span id="label-${id}" style="font-size:10px;">${percent}%</span>
        </div>`;
    row.innerHTML = `<div class="bubble">${content}</div>`;
    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateProgress(id, percent, isComplete = false) {
    const bar = document.getElementById(`prog-${id}`);
    const label = document.getElementById(`label-${id}`);
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.innerText = isComplete ? "Completed" : `${percent}%`;
}

function replaceProgressWithFile(id, url, type, name) {
    const row = document.getElementById(id);
    if (!row) return;

    let mediaTag = "";
    if (type.startsWith('image/')) mediaTag = `<img src="${url}" class="chat-img">`;
    else if (type.startsWith('audio/')) mediaTag = `<audio controls src="${url}" class="chat-audio"></audio>`;
    else if (type.startsWith('video/')) mediaTag = `<video controls playsinline src="${url}" class="chat-video"></video>`;
    else mediaTag = `<a href="${url}" download="${name}" class="file-link">📄 ${name}</a>`;

    const btnClass = "dl-btn dl-locked"; 
    const btnAction = `requestDownload('${id}')`;

    const content = `
        <div class="media-wrap">
            ${mediaTag}
            <div id="btn-${id}" class="${btnClass}" onclick="${btnAction}">🔒</div>
        </div>`;
    
    row.querySelector('.bubble').innerHTML = content;
}

function requestDownload(msgId) {
    if(!conn || !conn.open) return alert("Disconnected");
    const btn = document.getElementById('btn-' + msgId);
    btn.innerText = "⏳";
    conn.send({ type: 'REQ_DL', msgId: msgId });
}

function unlockDownload(msgId) {
    const btn = document.getElementById('btn-' + msgId);
    if(btn) {
        btn.innerHTML = "⬇️"; 
        btn.className = "dl-btn dl-unlocked"; 
        btn.onclick = () => {
            const row = document.getElementById(msgId);
            const img = row.querySelector('img') || row.querySelector('video') || row.querySelector('audio');
            const src = img.src;
            const a = document.createElement('a');
            a.href = src;
            a.download = `Walki-Talki-Media-${Date.now()}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        alert("✅ Download Approved!");
    }
}

function performLocalSave(chatName) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('wt_history') || "[]"); } catch(e) { history = []; }
    if (history.length >= 20) return alert("⚠️ Memory Full (20/20)!");
    if (messagesArray.length === 0) return alert("⚠️ Nothing to save!");
    const liteMsgs = messagesArray.map(msg => {
        if (['IMG', 'AUDIO', 'VIDEO', 'FILE_START'].includes(msg.type)) {
            return { ...msg, fileData: null, text: `[Media: ${msg.type} - Not Saved]` };
        }
        return msg;
    });
    const entry = { name: chatName, friend: currentFriendID, date: new Date().toLocaleString(), msgs: liteMsgs };
    try {
        history.push(entry);
        localStorage.setItem('wt_history', JSON.stringify(history));
        alert(`✅ Saved as "${chatName}"!`);
    } catch (e) { alert("Save failed: Storage still full."); }
}

function playSound() {
    const audio = document.getElementById('msg-sound');
    audio.currentTime = 0;
    audio.play().catch(() => {});
    if(navigator.vibrate) navigator.vibrate(100);
}

function markAsRead(msgId) {
    const el = document.getElementById(msgId);
    if (el) {
        const tick = el.querySelector('.tick-mark');
        if (tick) { tick.innerText = "✓✓"; tick.classList.add('read-blue'); }
    }
}

function renderMessage(data, isHistory = false) {
    if (!isHistory) messagesArray.push(data);
    const isMe = data.sender === myID;
    const chatBox = document.getElementById('chat-box');
    const row = document.createElement('div');
    row.id = data.id;
    row.className = `msg-row ${isMe ? 'sent' : 'received'}`;
    const name = isMe ? "" : `<div class="s-name">${data.sender}</div>`;
    
    let content = "";
    if (['IMG', 'AUDIO', 'VIDEO'].includes(data.type)) {
        let mediaTag = "";
        if (data.type === 'IMG') mediaTag = `<img src="${data.fileData || ''}" class="chat-img">`;
        if (data.type === 'AUDIO') mediaTag = `<audio controls src="${data.fileData || ''}" class="chat-audio"></audio>`;
        if (data.type === 'VIDEO') mediaTag = `<video controls playsinline src="${data.fileData || ''}" class="chat-video"></video>`;
        
        if(!data.fileData && isHistory) {
             content = `<span class="text" style="color:#aaa; font-style:italic;">${data.text}</span>`;
        } else {
             const btnClass = isMe ? "dl-btn dl-unlocked" : "dl-btn dl-locked";
             const btnIcon = isMe ? "⬇️" : "🔒";
             const btnAction = isMe ? `unlockDownload('${data.id}')` : `requestDownload('${data.id}')`;
             content = `
                <div class="media-wrap">
                    ${mediaTag}
                    <div id="btn-${data.id}" class="${btnClass}" onclick="${btnAction}">${btnIcon}</div>
                </div>`;
        }
    } else if (data.type === 'FILE') {
        content = `<a href="${data.fileData}" download="${data.fileName}" class="file-link">📄 ${data.fileName}</a>`;
    } else {
        content = `<span class="text">${data.text}</span>`;
    }

    const tick = isMe ? `<span class="tick-mark">✓</span>` : '';
    const tools = (isMe && !isHistory) ? `<div class="tools"><span onclick="delMsg('${data.id}')">🗑️</span></div>` : '';
    
    row.innerHTML = `<div class="bubble">${name}${content}<div class="meta">${tick} ${tools}</div></div>`;
    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    if(isMe && ['IMG', 'AUDIO', 'VIDEO'].includes(data.type)) {
        setTimeout(() => unlockDownload(data.id), 0);
    }
}
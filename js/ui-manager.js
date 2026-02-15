let mediaRecorder, audioChunks = [], voiceStream, typingTimer;
let privacyMode = false;

// --- SAVE BUTTON LOGIC ---
document.getElementById('save-chat-btn').onclick = function() {
    if (!conn || !conn.open) return showSystemMessage("Connect first", "#e74c3c");

    
    const btn = document.getElementById('save-chat-btn');
    btn.innerHTML = '⏳'; 
    btn.style.color = 'orange';

    conn.send({ type: 'SAVE_REQ' });
};

// --- HISTORY MENU ---
function openHistoryMenu() {
    const listDiv = document.getElementById('history-list');
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    } catch(e) { history = []; }
    
    listDiv.innerHTML = ""; 

    if (history.length === 0) {
        listDiv.innerHTML = '<p style="color:#666; font-size:12px;">No saved chats found.</p>';
    } else {
        const usage = document.createElement('div');
        usage.style.cssText = "color:#00d1b2; font-size:11px; margin-bottom:10px; text-align:right;";
        usage.innerText = `Storage: ${history.length} / 20`;
        listDiv.appendChild(usage);

        history.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const info = document.createElement('div');
            info.style.flex = "1";
            info.innerHTML = `
                <b style="color:white; font-size:14px;">${entry.name}</b><br>
                <span style="font-size:10px; color:#888;">${entry.date} (${entry.msgs.length} msgs)</span>
            `;
            info.onclick = () => loadSpecificChat(index);

            const delBtn = document.createElement('button');
            delBtn.innerText = "❌";
            delBtn.style.cssText = "background:transparent; border:none; color:#ff4757; font-size:14px; cursor:pointer; padding:5px;";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteHistoryItem(index);
            };

            item.style.display = "flex";
            item.style.alignItems = "center";
            item.appendChild(info);
            item.appendChild(delBtn);
            listDiv.appendChild(item);
        });
    }
    document.getElementById('history-popup').style.display = 'flex';
}

function deleteHistoryItem(index) {
    if(!confirm("Permanently delete this saved chat?")) return;
    let history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    history.splice(index, 1);
    localStorage.setItem('wt_history', JSON.stringify(history));
    openHistoryMenu();
}

function loadSpecificChat(index) {
    const history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    const selectedChat = history[index];
    if (!selectedChat) return;
    const chatBox = document.getElementById('chat-box');

    if (chatBox.children.length > 0) {
        if (!confirm("Messages are already loaded. Clear current chat and load history?")) return;
    }

    chatBox.innerHTML = "";
    document.getElementById('history-popup').style.display = 'none';

    selectedChat.msgs.forEach(msg => {
        renderMessage(msg, true); 
    });

    const separator = document.createElement('div');
    separator.style.cssText = "text-align:center; color:#555; font-size:10px; margin:10px 0;";
    separator.innerText = `--- Loaded: ${selectedChat.name} ---`;
    chatBox.appendChild(separator);
}

// --- PRIVACY ---
function togglePrivacy() {
    privacyMode = !privacyMode;
    const mask = document.getElementById('privacy-mask');
    const btn = document.getElementById('privacy-btn');
    if (privacyMode) { mask.style.display = 'flex'; btn.style.color = '#00d1b2'; } 
    else { mask.style.display = 'none'; btn.style.color = 'white'; }
}

const mask = document.getElementById('privacy-mask');
mask.addEventListener('mousedown', () => mask.style.opacity = '0');
mask.addEventListener('mouseup', () => mask.style.opacity = '1');
mask.addEventListener('mouseleave', () => mask.style.opacity = '1');
mask.addEventListener('touchstart', (e) => { e.preventDefault(); mask.style.opacity = '0'; });
mask.addEventListener('touchend', (e) => { e.preventDefault(); mask.style.opacity = '1'; });
mask.addEventListener('touchcancel', (e) => { e.preventDefault(); mask.style.opacity = '1'; });

// --- CONNECTION ---
document.getElementById('connect-btn').onclick = function() {
    const fid = document.getElementById('friend-id').value.trim().toLowerCase();
    
    if (fid && peer) {
        if (conn) conn.close();
        let temp = peer.connect(fid);
        temp.on('open', () => { temp.send({ type: 'REQ', sender: myID }); });
        setTimeout(() => { if (!temp.open) 
            showSystemMessage("User offline or timed out", "#e74c3c");


         }, 35000); 
        
        temp.on('data', (data) => {
            if (data.type === 'ACC') { conn = temp; currentFriendID = data.sender; setupChat(); 
                showSystemMessage("Connected", "#2ecc71");
 }
            if (data.type === 'REJ') showSystemMessage("Request Rejected", "#e74c3c");

        });
    }
};

document.getElementById('send-btn').onclick = function() {
    const input = document.getElementById('message-input');
    if(input.value && conn && conn.open){
        const btn = document.getElementById('send-btn');
        btn.disabled = true;

        const pack = {
            type : 'CHAT',
            id: 'm-' + Date.now(),
            text: input.value,
            sender: myID
        };

        conn.send(pack);
        renderMessage(pack);
        input.value = "";

        setTimeout(() => {
            btn.disabled = false;
        }, 200);
    } else { alert("Not connected!"); }
};

function handleTyping() {
    if (conn && conn.open) {
        conn.send({ type: 'TYPING_START' });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => { conn.send({ type: 'TYPING_STOP' }); }, 1000);
    }
}

// --- FILE HANDLER (THE FIX) ---
function startFileTransfer(input) {
    const file = input.files[0];
    if (!file) return;
    if (!conn || !conn.open) return showSystemMessage("Not connected", "#e74c3c");


    // FIX: Send EVERYTHING via Chunker, even small files.
    // This ensures they get the Ack/Resume protection.
    sendFileInChunks(file);
    
    input.value = "";
}

// --- VOICE (Keep as is, voice notes are tiny) ---
async function openVoicePopup() {
    if (!conn || !conn.open) return alert("Connect first!");
    try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startRecording(voiceStream);
        document.getElementById('voice-overlay').style.display = 'flex';
    } catch (err) { 
        showSystemMessage("Mic access denied", "#e74c3c");
     }
}

function startRecording(stream) {
    audioChunks = [];
    let options = { mimeType: 'audio/webm' };
    if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
    try { mediaRecorder = new MediaRecorder(stream, options); } catch (e) { mediaRecorder = new MediaRecorder(stream); }
    mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); };
    mediaRecorder.start();
}

function stopAndSend() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
            const blobType = mediaRecorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunks, { type: blobType });
            if (blob.size < 500) { closeVoicePopup(); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const pack = { type: 'AUDIO', id: 'm-'+Date.now(), fileData: reader.result, sender: myID };
                conn.send(pack); renderMessage(pack); closeVoicePopup();
            };
            reader.readAsDataURL(blob);
        };
        mediaRecorder.stop();
    }
}

function cancelVoice() { if (mediaRecorder) mediaRecorder.stop(); audioChunks = []; closeVoicePopup(); }
function closeVoicePopup() { document.getElementById('voice-overlay').style.display = 'none'; if(voiceStream) voiceStream.getTracks().forEach(track => track.stop()); }
function delMsg(id) { if (confirm("Delete?") && conn && conn.open) { conn.send({ type: 'DEL', id: id }); document.getElementById(id).remove(); } }
function viewImage(img) { const win = window.open(""); win.document.write('<img src="' + img.src + '" style="width:100%">'); }
function editMsg(id) { const el = document.getElementById(id).querySelector('.text'); if(!el) return; const nt = prompt("Edit:", el.innerText.replace(" (edited)", "")); if (nt && conn && conn.open) { conn.send({ type: 'EDIT', id: id, text: nt }); el.innerText = nt + " (edited)"; } }
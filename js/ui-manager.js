let mediaRecorder, audioChunks = [], voiceStream, typingTimer;
let privacyMode = false;

// --- SAVE BUTTON LOGIC ---
document.getElementById('save-chat-btn').onclick = function() {
    if (!conn || !conn.open) return alert("Connect first!");
    const btn = document.getElementById('save-chat-btn');
    btn.innerHTML = '⏳'; btn.style.color = 'orange';
    conn.send({ type: 'SAVE_REQ' });
};

// --- HISTORY MENU ---
function openHistoryMenu() {
    const listDiv = document.getElementById('history-list');
    let history = [];
    try { history = JSON.parse(localStorage.getItem('wt_history') || "[]"); } catch(e) { history = []; }
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
            info.innerHTML = `<b style="color:white; font-size:13px;">${entry.name}</b><br><small style="color:#888;">${entry.date}</small>`;
            
            const delBtn = document.createElement('button');
            delBtn.innerHTML = "🗑️";
            delBtn.style.cssText = "background:none; border:none; color:#ff4757; cursor:pointer;";
            delBtn.onclick = (e) => { e.stopPropagation(); deleteHistory(index); };
            
            item.onclick = () => loadHistoryChat(entry);
            
            item.appendChild(info);
            item.appendChild(delBtn);
            listDiv.appendChild(item);
        });
    }
    document.getElementById('history-popup').style.display = 'flex';
}

function handleSaveRequest(conn) {
    const chatData = {
        name: `Chat with ${conn.peer}`,
        date: new Date().toLocaleString(),
        messages: messagesArray
    };
    let history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    if(history.length >= 20) history.shift();
    history.push(chatData);
    localStorage.setItem('wt_history', JSON.stringify(history));
    alert("Chat Saved!");
}

function deleteHistory(index) {
    if(!confirm("Delete this saved chat?")) return;
    let history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    history.splice(index, 1);
    localStorage.setItem('wt_history', JSON.stringify(history));
    openHistoryMenu(); 
}

function loadHistoryChat(entry) {
    document.getElementById('chat-box').innerHTML = '<div style="text-align:center; color:#888; margin:10px;">--- Viewing Saved Chat ---</div>';
    entry.messages.forEach(msg => {
        // We call the global renderMessage from peer-logic
        if(window.renderMessage) window.renderMessage(msg, true);
    });
    document.getElementById('history-popup').style.display = 'none';
}

// --- VOICE RECORDING ---
function openVoicePopup() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        voiceStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('voice-overlay').style.display = 'flex';
    }).catch(err => alert("Mic access denied: " + err));
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

// --- HANDLE PROFILE PICTURE UPLOAD (SAVES TO MEMORY) ---
function handleFileUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // 1. Get image data
            const newAvatar = e.target.result;
            
            // 2. Update preview immediately
            const preview = document.getElementById('custom-preview');
            preview.src = newAvatar;
            preview.style.display = 'block';
            
            // 3. Highlight it
            document.querySelectorAll('.avatar-pick').forEach(img => img.classList.remove('active'));
            preview.classList.add('active');

            // 4. SAVE TO STORAGE (Crucial Step)
            localStorage.setItem('my_avatar', newAvatar);
            
            // 5. Update global
            if(window.currentAvatar) window.currentAvatar = newAvatar;
        };
        reader.readAsDataURL(file);
    }
}
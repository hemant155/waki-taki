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
            item.innerHTML = `
                <div>
                    <b style="color:white; font-size:13px;">${entry.name}</b><br>
                    <small style="color:#888;">${entry.date}</small>
                </div>
                <button onclick="deleteHistory(${index})" style="background:none; border:none; color:#ff4757;">🗑️</button>
            `;
            item.onclick = (e) => { if(e.target.tagName !== 'BUTTON') loadHistoryChat(entry); };
            listDiv.appendChild(item);
        });
    }
    document.getElementById('history-popup').style.display = 'flex';
}

// --- VOICE RECORDING LOGIC ---
function openVoicePopup() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        voiceStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('voice-overlay').style.display = 'flex';
    }).catch(err => alert("Mic error: " + err));
}

function stopAndSend() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = () => {
                const pack = { type: 'AUDIO', id: 'm-'+Date.now(), fileData: reader.result, sender: myID };
                conn.send(pack); renderMessage(pack);
                closeVoicePopup();
            };
            reader.readAsDataURL(blob);
        };
        mediaRecorder.stop();
    }
}

function closeVoicePopup() {
    document.getElementById('voice-overlay').style.display = 'none';
    if(voiceStream) voiceStream.getTracks().forEach(t => t.stop());
}

function delMsg(id) {
    if (confirm("Delete this message?")) {
        if(conn && conn.open) conn.send({ type: 'DEL', id: id });
        document.getElementById(id).remove();
    }
}
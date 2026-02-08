let mediaRecorder, audioChunks = [], voiceStream;

// --- SAVE BUTTON ---
document.getElementById('save-chat-btn').onclick = function() {
    if (!conn || !conn.open) return alert("Connect first!");
    this.innerHTML = '⏳';
    conn.send({ type: 'SAVE_REQ' });
};

// --- HISTORY LOGIC ---
function openHistoryMenu() {
    const listDiv = document.getElementById('history-list');
    let history = JSON.parse(localStorage.getItem('wt_history') || "[]");
    listDiv.innerHTML = history.length === 0 ? '<p>No saved chats.</p>' : "";
    history.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<b>${entry.name}</b><br><small>${entry.date}</small> <span onclick="deleteHistory(${index})">🗑️</span>`;
        listDiv.appendChild(item);
    });
    document.getElementById('history-popup').style.display = 'flex';
}

// --- VOICE LOGIC ---
function openVoicePopup() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        voiceStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('voice-overlay').style.display = 'flex';
    });
}

function stopAndSend() {
    mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
            const pack = { type: 'AUDIO', id: 'm-'+Date.now(), fileData: reader.result, sender: myID };
            conn.send(pack); renderMessage(pack);
            document.getElementById('voice-overlay').style.display = 'none';
            voiceStream.getTracks().forEach(t => t.stop());
        };
        reader.readAsDataURL(blob);
    };
    mediaRecorder.stop();
}

function handleFileUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentAvatar = e.target.result;
            document.getElementById('custom-preview').src = currentAvatar;
            document.getElementById('custom-preview').style.display = 'block';
            localStorage.setItem('my_avatar', currentAvatar);
        };
        reader.readAsDataURL(file);
    }
}

function delMsg(id) {
    if (confirm("Delete?")) {
        if(conn) conn.send({ type: 'DEL', id: id });
        document.getElementById(id).remove();
    }
}
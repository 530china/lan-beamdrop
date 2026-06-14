document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const headerDeviceName = document.getElementById('device-name');
  
  const clipboardInput = document.getElementById('clipboard-input');
  const btnSendClipboard = document.getElementById('btn-send-clipboard');
  const btnAttach = document.getElementById('btn-attach');
  const fileUploadInput = document.getElementById('file-upload-input');
  const chatMessages = document.getElementById('chat-messages');
  
  const activityLog = document.getElementById('activity-log');
  const logToggle = document.getElementById('log-toggle');
  const logContent = document.getElementById('log-content');
  const toastContainer = document.getElementById('toast-container');
  
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxDownload = document.getElementById('lightbox-download');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxBackdrop = document.getElementById('lightbox-backdrop');

  // Settings
  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const inputShareDir = document.getElementById('setting-share-dir');

  // --- Init ---
  fetchDeviceInfo();
  
  // Client ID for chat bubbles
  let myClientId = localStorage.getItem('lanbeamdrop_client_id');
  if (!myClientId) {
    myClientId = 'device-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('lanbeamdrop_client_id', myClientId);
  }

  function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return '📱 平板 (iPad)';
    if (/iPhone/.test(ua)) return '📱 手机 (iPhone)';
    if (/Windows/.test(ua)) return '💻 网页端 (Windows)';
    if (/Macintosh/.test(ua)) return '💻 网页端 (Mac)';
    if (/HarmonyOS|OpenHarmony/.test(ua)) {
      if (!/Mobile/.test(ua)) return '📱 平板 (HarmonyOS)';
      return '📱 手机 (HarmonyOS)';
    }
    if (/Android/.test(ua)) {
      if (!/Mobile/.test(ua)) return '📱 平板 (Android)';
      return '📱 手机 (Android)';
    }
    return '📱 未知设备';
  }
  const myDeviceName = getDeviceName();

  // --- Device Info ---
  async function fetchDeviceInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        headerDeviceName.textContent = data.deviceName;
        
        // Settings Visibility
        if (data.isLocalHost) {
          btnSettings.classList.remove('hidden');
          inputShareDir.value = data.shareDir || '';
        }
      }
    } catch (err) {
      console.error('Failed to fetch info', err);
    }
  }

  // --- Settings ---
  function openSettings() {
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);

  btnSaveSettings.addEventListener('click', async () => {
    const newDir = inputShareDir.value.trim();
    if (!newDir) {
      showToast('存储目录不能为空', 'error');
      return;
    }
    
    btnSaveSettings.textContent = '保存中...';
    btnSaveSettings.disabled = true;
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareDir: newDir })
      });
      const data = await res.json();
      if (data.success) {
        showToast('设置保存成功', 'success');
        closeSettings();
        // 刷新消息流
        fetchUnifiedMessages();
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
    } finally {
      btnSaveSettings.textContent = '保存设置';
      btnSaveSettings.disabled = false;
    }
  });

  // --- Unified Chat Logic ---
  let renderedMessageIds = new Set();
  let lastMessagesKey = '';
  const uploadingFiles = new Map();
  
  function scrollToBottom() {
    if(chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  setInterval(fetchUnifiedMessages, 2000);
  fetchUnifiedMessages();

  async function fetchUnifiedMessages() {
    try {
      const [clipRes, filesRes] = await Promise.all([
        fetch('/api/clipboard'),
        fetch('/api/files')
      ]);
      
      let history = [];
      
      if (clipRes.ok) {
        const data = await clipRes.json();
        if (data.history) {
          history = history.concat(data.history.map(item => ({
            ...item,
            type: 'text'
          })));
        }
      }
      
      if (filesRes.ok) {
        const data = await filesRes.json();
        if (data.files) {
          history = history.concat(data.files.map(file => ({
            id: 'file_' + file.name + '_' + file.mtime,
            type: 'file',
            content: file.name,
            fileUrl: '/api/files/download/' + encodeURIComponent(file.name),
            fileSize: file.size,
            clientId: 'HOST',
            deviceName: '🖥️ 服务端文件 (' + window.location.hostname + ')',
            timestamp: file.mtime
          })));
        }
      }

      // Merge uploading files
      uploadingFiles.forEach(up => {
         history.push({
            id: up.id,
            type: 'upload',
            content: up.name,
            fileSize: '上传中...',
            clientId: myClientId,
            deviceName: myDeviceName,
            timestamp: up.timestamp,
            progress: up.progress
         });
      });
      
      history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Limit to last 100 items for performance
      history = history.slice(-100);
      
      // Check if anything changed
      const currentKey = history.map(h => h.id + '_' + (h.progress || 0)).join(',');
      if (currentKey !== lastMessagesKey) {
        lastMessagesKey = currentKey;
        renderChatHistory(history);
      }
      
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  }

  function renderChatHistory(history) {
    if (!history || history.length === 0) return;
    
    let isAtBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 10;
    let newMessages = false;

    // remove empty state if exists
    const empty = chatMessages.querySelector('.empty-state');
    if (empty) empty.remove();
    
    chatMessages.innerHTML = '';
    renderedMessageIds.clear();
    
    history.forEach(msg => {
      newMessages = true;
      renderedMessageIds.add(msg.id);
      
      const isSelf = msg.clientId === myClientId;
      const div = document.createElement('div');
      div.className = `chat-message ${isSelf ? 'self' : 'other'}`;
      
      const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      let metaHtml = `<span class="time">${time}</span> <span>${msg.deviceName}</span>`;
      
      if (msg.type === 'text') {
        if (!isSelf) {
          metaHtml += `<button class="btn-copy-msg" data-text="${encodeURIComponent(msg.content)}">📋 复制</button>`;
        }
        div.innerHTML = `
          <div class="chat-bubble text-bubble" data-text="${encodeURIComponent(msg.content)}" style="cursor: pointer;" title="点击复制">${escapeHtml(msg.content)}</div>
          <div class="chat-meta">${metaHtml}</div>
        `;
      } else if (msg.type === 'file') {
        const sizeStr = formatSize(msg.fileSize);
        if (isImage(msg.content)) {
          div.innerHTML = `
            <div class="chat-bubble" style="padding: 4px; background: transparent; box-shadow: none;">
              <img src="${msg.fileUrl}" class="image-preview" data-src="${msg.fileUrl}" data-name="${escapeHtml(msg.content)}" alt="${escapeHtml(msg.content)}" title="点击查看原图">
            </div>
            <div class="chat-meta">${metaHtml}</div>
          `;
        } else {
          const icon = getFileIcon(msg.content);
          div.innerHTML = `
            <a href="${msg.fileUrl}" class="file-bubble" download>
              <div class="file-icon-large">${icon}</div>
              <div class="file-details">
                <span class="file-name">${escapeHtml(msg.content)}</span>
                <span class="file-size">${sizeStr}</span>
              </div>
            </a>
            <div class="chat-meta">${metaHtml}</div>
          `;
        }
      } else if (msg.type === 'upload') {
        const icon = getFileIcon(msg.content);
        div.innerHTML = `
          <div class="file-bubble">
            <div class="file-icon-large">${icon}</div>
            <div class="file-details">
              <span class="file-name">${escapeHtml(msg.content)}</span>
              <span class="file-size">${msg.fileSize}</span>
              <div class="upload-progress-container">
                 <div class="upload-progress-bar" id="prog_${msg.id}" style="width: ${msg.progress}%"></div>
              </div>
            </div>
          </div>
          <div class="chat-meta">${metaHtml}</div>
        `;
      }
      chatMessages.appendChild(div);
    });

    if (newMessages) {
      const doCopy = (encodedText, btnEl) => {
        const text = decodeURIComponent(encodedText);
        if (navigator.clipboard && window.isSecureContext) {
           navigator.clipboard.writeText(text).then(() => showSuccess(btnEl)).catch(() => fallbackCopy(text, btnEl));
        } else {
           fallbackCopy(text, btnEl);
        }
      };

      const showSuccess = (el) => {
        showToast('✅ 已复制', 'success');
        if (el && el.tagName === 'BUTTON') {
           const originalText = el.innerHTML;
           el.innerHTML = '✅ 已复制';
           setTimeout(() => el.innerHTML = originalText, 2000);
        }
      };

      const fallbackCopy = (text, el) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          const successful = document.execCommand('copy');
          if (successful) showSuccess(el);
          else showToast('❌ 复制失败', 'error');
        } catch (err) {
          showToast('❌ 复制失败', 'error');
        }
        document.body.removeChild(textArea);
      };

      // Add copy listeners to explicit buttons
      const copyBtns = chatMessages.querySelectorAll('.btn-copy-msg');
      copyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          doCopy(btn.dataset.text, btn);
        });
      });

      // Add copy listeners to text bubbles
      const textBubbles = chatMessages.querySelectorAll('.text-bubble');
      textBubbles.forEach(bubble => {
        bubble.addEventListener('click', (e) => {
          e.stopPropagation();
          doCopy(bubble.dataset.text, null);
        });
      });
      
      // Add lightbox listeners
      const imagePreviews = chatMessages.querySelectorAll('.image-preview');
      imagePreviews.forEach(img => {
        img.addEventListener('click', () => {
          openLightbox(img.dataset.src, img.dataset.name);
        });
      });
      
      if (isAtBottom || renderedMessageIds.size <= history.length) {
        scrollToBottom();
      }
    }
  }

  // --- Attachments / Upload ---
  btnAttach.addEventListener('click', () => {
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    files.forEach(file => {
      uploadFileAsMessage(file);
    });
    fileUploadInput.value = '';
  });

  function uploadFileAsMessage(file) {
    const uploadId = 'upload_' + Date.now() + '_' + file.name;
    const upObj = { id: uploadId, name: file.name, progress: 0, timestamp: new Date().toISOString() };
    uploadingFiles.set(uploadId, upObj);
    fetchUnifiedMessages().then(() => scrollToBottom());
    
    const formData = new FormData();
    formData.append('files', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const p = Math.round((e.loaded / e.total) * 100);
        upObj.progress = p;
        const bar = document.getElementById(`prog_${uploadId}`);
        if(bar) bar.style.width = p + '%';
      }
    };

    xhr.onload = () => {
      uploadingFiles.delete(uploadId);
      if (xhr.status === 200) {
        showToast(`发送成功: ${file.name}`, 'success');
        addLog(`发送文件: ${file.name}`);
      } else {
        showToast(`发送失败: ${file.name}`, 'error');
      }
      fetchUnifiedMessages();
    };

    xhr.onerror = () => {
      uploadingFiles.delete(uploadId);
      showToast(`发送出错: ${file.name}`, 'error');
      fetchUnifiedMessages();
    };

    xhr.send(formData);
  }

  btnSendClipboard.addEventListener('click', async () => {
    const text = clipboardInput.value.trim();
    if (!text) return;
    
    const btnContent = btnSendClipboard.innerHTML;
    btnSendClipboard.textContent = '...';
    btnSendClipboard.disabled = true;
    
    try {
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: text,
          clientId: myClientId,
          deviceName: myDeviceName
        })
      });
      
      if (res.ok) {
        clipboardInput.value = '';
        fetchUnifiedMessages().then(() => scrollToBottom());
        addLog('发送文本');
      } else {
        showToast('发送失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
    } finally {
      btnSendClipboard.innerHTML = btnContent;
      btnSendClipboard.disabled = false;
    }
  });

  clipboardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnSendClipboard.click();
    }
  });

  // --- Paste Support ---
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let hasFile = false;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        hasFile = true;
        let file = items[i].getAsFile();
        if (file) {
          // Rename generic screenshot names to avoid overwriting
          if (file.name === 'image.png' || file.name.startsWith('image')) {
            const ext = file.name.split('.').pop() || 'png';
            const newName = `screenshot_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
            file = new File([file], newName, { type: file.type });
          }
          uploadFileAsMessage(file);
        }
      }
    }
    
    if (hasFile) {
      e.preventDefault(); // Prevent pasting raw base64 string into textarea
    }
  });

  // --- Utils ---
  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
      'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝', 'md': '📝',
      'apk': '📱', 'exe': '💻'
    };
    return icons[ext] || '📄';
  }

  function isImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
  }

  function formatSize(bytes) {
    if (bytes === undefined || isNaN(bytes)) return bytes; // for "上传中..." string
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Lightbox ---
  function openLightbox(src, filename) {
    lightboxImg.src = src;
    lightboxDownload.href = src;
    lightboxDownload.download = filename;
    lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    setTimeout(() => {
      lightboxImg.src = '';
    }, 300); // clear after animation
  }

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  // --- Activity Log ---
  logToggle.addEventListener('click', () => {
    activityLog.classList.toggle('open');
  });

  function addLog(message) {
    const time = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<span class="log-time">${time}</span> ${message}`;
    
    const empty = logContent.querySelector('.log-empty');
    if (empty) empty.remove();
    
    logContent.prepend(item);
    if (logContent.children.length > 20) {
      logContent.lastChild.remove();
    }
  }

  // --- Toast ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastFadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});

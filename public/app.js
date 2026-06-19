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
  const inputMaxFileSize = document.getElementById('setting-max-file-size');
  const inputPort = document.getElementById('setting-port');

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

  let serverMaxFileSize = 0;

  // --- Device Info ---
  async function fetchDeviceInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        headerDeviceName.textContent = data.deviceName;
        const appVersionEl = document.getElementById('app-version');
        if (appVersionEl) appVersionEl.textContent = 'v' + (data.version || '0.1.0');
        serverMaxFileSize = data.maxFileSize || 0;
        
        // Settings Visibility
        if (data.isLocalHost) {
          btnSettings.classList.remove('hidden');
          inputShareDir.value = data.shareDir || '';
          if (inputMaxFileSize && data.maxFileSize) {
            inputMaxFileSize.value = Math.round(data.maxFileSize / (1024 * 1024 * 1024));
          }
          if (inputPort && data.port) {
            inputPort.value = data.port;
          }
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
    
    const payload = { shareDir: newDir };
    if (inputMaxFileSize && inputMaxFileSize.value) {
      payload.maxFileSize = parseInt(inputMaxFileSize.value, 10) * 1024 * 1024 * 1024;
    }
    if (inputPort && inputPort.value) {
      payload.port = parseInt(inputPort.value, 10);
    }
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('设置保存成功', 'success');
        closeSettings();
        // 重新拉取最新的设备信息（如最新的最大文件限制）
        fetchDeviceInfo();
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

  // --- Settings UI: Tabs & Browse Folder ---
  const settingsMenu = document.getElementById('settings-menu');
  if (settingsMenu) {
    settingsMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'LI') {
        // Remove active class from all tabs
        settingsMenu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab
        e.target.classList.add('active');
        const targetId = e.target.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
      }
    });
  }

  // --- Diagnostics Logic ---
  const btnDiagArp = document.getElementById('btn-diag-arp');
  const tbodyDiagArp = document.getElementById('diag-arp-tbody');
  const inputDiagPing = document.getElementById('input-diag-ping');
  const btnDiagPing = document.getElementById('btn-diag-ping');
  const preDiagPingResult = document.getElementById('diag-ping-result');

  if (btnDiagArp) {
    btnDiagArp.addEventListener('click', async () => {
      btnDiagArp.textContent = '扫描中...';
      btnDiagArp.disabled = true;
      try {
        const res = await fetch('/api/diagnostics/arp');
        const data = await res.json();
        tbodyDiagArp.innerHTML = '';
        if (data.success && data.devices.length > 0) {
          data.devices.forEach(dev => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: monospace;">${dev.ip}</td>
              <td style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: monospace; color: #888;">${dev.mac}</td>
              <td style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <button class="btn-secondary" style="padding: 2px 8px; font-size: 12px;" onclick="document.getElementById('input-diag-ping').value='${dev.ip}'; document.getElementById('btn-diag-ping').click();">Ping</button>
              </td>
            `;
            tbodyDiagArp.appendChild(tr);
          });
        } else {
          tbodyDiagArp.innerHTML = `<tr><td colspan="3" style="padding: 8px; text-align: center; color: #888;">未能扫描到设备或无权限</td></tr>`;
        }
      } catch (err) {
        tbodyDiagArp.innerHTML = `<tr><td colspan="3" style="padding: 8px; text-align: center; color: #ef4444;">扫描失败: ${err.message}</td></tr>`;
      } finally {
        btnDiagArp.textContent = '🔍 扫描局域网设备 (ARP)';
        btnDiagArp.disabled = false;
      }
    });
  }

  if (btnDiagPing) {
    btnDiagPing.addEventListener('click', async () => {
      const ip = inputDiagPing.value.trim();
      if (!ip) return;
      btnDiagPing.textContent = 'Ping...';
      btnDiagPing.disabled = true;
      preDiagPingResult.style.display = 'block';
      preDiagPingResult.textContent = '探测中...';
      preDiagPingResult.style.color = '#fff';
      
      try {
        const res = await fetch(`/api/diagnostics/ping?ip=${encodeURIComponent(ip)}`);
        const data = await res.json();
        if (data.success) {
          preDiagPingResult.style.color = data.reachable ? '#10b981' : '#ef4444';
          let diagText = data.reachable 
            ? `✅ 连通成功！\n如果仍打不开网页，说明物理网络正常，极大概率是电脑 Windows 防火墙拦截了本程序的端口！请去防火墙放行该程序。` 
            : `❌ 连通失败，目标不可达。\n如果在上面的 ARP 表中能看到这个 IP，但 Ping 不通，极大可能是路由器的 AP 隔离（双频隔离）阻止了通信！`;
          preDiagPingResult.textContent = `${diagText}\n\n[底层输出]:\n${data.log}`;
        } else {
          preDiagPingResult.style.color = '#ef4444';
          preDiagPingResult.textContent = data.error || '请求失败';
        }
      } catch (err) {
        preDiagPingResult.style.color = '#ef4444';
        preDiagPingResult.textContent = `请求出错: ${err.message}`;
      } finally {
        btnDiagPing.textContent = 'Ping 测试';
        btnDiagPing.disabled = false;
      }
    });
  }

  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  const explorerModal = document.getElementById('explorer-modal');
  const explorerList = document.getElementById('explorer-list');
  const explorerSidebar = document.getElementById('explorer-sidebar');
  const explorerPathInput = document.getElementById('explorer-path-input');
  const explorerBtnGo = document.getElementById('explorer-btn-go');
  const explorerBtnMkdir = document.getElementById('explorer-btn-mkdir');
  const explorerBtnUp = document.getElementById('explorer-btn-up');
  const explorerBtnSelect = document.getElementById('explorer-btn-select');
  const explorerBtnCancel = document.getElementById('explorer-btn-cancel');
  
  let currentExplorerPath = '';
  let currentExplorerParent = '';

  async function loadDirectory(targetDir = '') {
    explorerList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">正在加载...</div>';
    try {
      const res = await fetch(`/api/explorer/list?dir=${encodeURIComponent(targetDir)}`);
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || '无法读取目录', 'error');
        explorerList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--accent-1);">读取失败</div>';
        return;
      }
      
      currentExplorerPath = data.path;
      currentExplorerParent = data.parent;
      
      // Update header
      if (explorerPathInput) {
        explorerPathInput.value = currentExplorerPath;
      }
      explorerBtnUp.style.opacity = currentExplorerParent === '' && currentExplorerPath === '' ? '0.3' : '1';
      explorerBtnUp.style.pointerEvents = currentExplorerParent === '' && currentExplorerPath === '' ? 'none' : 'auto';

      // Highlight active drive
      if (explorerSidebar) {
        const drives = explorerSidebar.querySelectorAll('.explorer-drive');
        drives.forEach(drive => {
          const driveName = drive.querySelector('span').textContent;
          if (currentExplorerPath.toUpperCase().startsWith(driveName.toUpperCase())) {
            drive.classList.add('active');
          } else {
            drive.classList.remove('active');
          }
        });
      }

      // Render folders
      explorerList.innerHTML = '';
      if (data.folders.length === 0) {
        explorerList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">空文件夹</div>';
      } else {
        data.folders.forEach(folder => {
          const item = document.createElement('div');
          item.className = 'explorer-item';
          item.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" color="#6366f1">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${folder.name}</span>
          `;
          item.addEventListener('click', () => loadDirectory(folder.path));
          explorerList.appendChild(item);
        });
      }
    } catch (err) {
      showToast('网络错误', 'error');
    }
  }

  async function loadDrives() {
    if (!explorerSidebar) return;
    try {
      const res = await fetch('/api/explorer/list?dir=');
      const data = await res.json();
      if (data.success && data.folders) {
        explorerSidebar.innerHTML = '';
        data.folders.forEach(folder => {
          const item = document.createElement('div');
          item.className = 'explorer-drive';
          const name = folder.name.replace(/\\/g, '').replace(/\//g, '');
          item.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
              <line x1="6" y1="12" x2="6.01" y2="12"></line>
            </svg>
            <span>${name || '根'}</span>
          `;
          item.addEventListener('click', () => loadDirectory(folder.path));
          explorerSidebar.appendChild(item);
        });
      }
    } catch (err) {
      console.error('Failed to load drives', err);
    }
  }

  if (btnBrowseFolder) {
    btnBrowseFolder.addEventListener('click', () => {
      explorerModal.classList.remove('hidden');
      loadDrives();
      loadDirectory(inputShareDir.value.trim());
    });
  }

  if (explorerBtnGo && explorerPathInput) {
    const triggerGo = () => {
      const p = explorerPathInput.value.trim();
      loadDirectory(p);
    };
    explorerBtnGo.addEventListener('click', triggerGo);
    explorerPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerGo();
    });
  }

  if (explorerBtnUp) {
    explorerBtnUp.addEventListener('click', () => {
      loadDirectory(currentExplorerParent);
    });
  }

  if (explorerBtnCancel) {
    explorerBtnCancel.addEventListener('click', () => {
      explorerModal.classList.add('hidden');
    });
    document.getElementById('explorer-backdrop').addEventListener('click', () => {
      explorerModal.classList.add('hidden');
    });
  }

  if (explorerBtnMkdir) {
    explorerBtnMkdir.addEventListener('click', () => {
      if (document.getElementById('new-folder-input')) return;
      if (!currentExplorerPath) {
        showToast('请先选择一个物理路径', 'error');
        return;
      }

      const item = document.createElement('div');
      item.className = 'explorer-item';
      item.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" color="#6366f1">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <input type="text" id="new-folder-input" class="inline-input" placeholder="输入名称并回车" />
      `;
      if (explorerList.firstChild) {
        explorerList.insertBefore(item, explorerList.firstChild);
      } else {
        explorerList.innerHTML = '';
        explorerList.appendChild(item);
      }
      
      const input = document.getElementById('new-folder-input');
      input.focus();

      const commit = async () => {
        const name = input.value.trim();
        if (!name) {
          item.remove();
          if (explorerList.children.length === 0) {
            explorerList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">空文件夹</div>';
          }
          return;
        }
        input.disabled = true;
        try {
          const res = await fetch('/api/explorer/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentPath: currentExplorerPath, folderName: name })
          });
          const data = await res.json();
          if (data.success) {
            loadDirectory(currentExplorerPath);
            showToast('文件夹创建成功', 'success');
          } else {
            showToast(data.error || '创建失败', 'error');
            item.remove();
          }
        } catch (err) {
          showToast('网络错误', 'error');
          item.remove();
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') item.remove();
      });
      input.addEventListener('blur', () => {
        if (!input.disabled) item.remove();
      });
    });
  }

  if (explorerBtnSelect) {
    explorerBtnSelect.addEventListener('click', () => {
      if (currentExplorerPath) {
        inputShareDir.value = currentExplorerPath;
        explorerModal.classList.add('hidden');
      } else {
        showToast('请选择一个具体的文件夹', 'error');
      }
    });
  }

  // --- Unified Chat Logic ---
  let renderedMessageIds = new Set();
  const uploadingFiles = new Map(); // uploadId -> {id, name, progress, timestamp}
  const activeXhrs = new Map(); // uploadId -> XMLHttpRequest();
  let lastMessagesKey = '';
  
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
            speed: up.speed,
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
      const currentKey = history.map(h => h.id + '_' + (h.progress || 0) + '_' + (h.speed || '')).join(',');
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
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">
                <span class="file-size">${msg.fileSize}</span>
                <span id="speed_${msg.id}" style="color: var(--primary-color);">${msg.speed || ''}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="upload-progress-container" style="flex: 1; margin-top: 0;">
                   <div class="upload-progress-bar" id="prog_${msg.id}" style="width: ${msg.progress}%"></div>
                </div>
                <button class="btn-cancel-upload" data-id="${msg.id}" title="取消上传" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0; font-size: 1rem; line-height: 1;">✖</button>
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
      
      // Add cancel upload listeners
      const cancelBtns = chatMessages.querySelectorAll('.btn-cancel-upload');
      cancelBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const uploadId = btn.dataset.id;
          const xhr = activeXhrs.get(uploadId);
          if (xhr) xhr.abort();
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
    if (serverMaxFileSize && file.size > serverMaxFileSize) {
      showToast(`文件超过上限，请在服务端的设置中修改限制`, 'error');
      return;
    }

    // Sanitize filename to avoid spaces/special characters breaking DOM IDs
    const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
    const uploadId = 'upload_' + Date.now() + '_' + safeName;
    const upObj = { id: uploadId, name: file.name, progress: 0, speed: '\u8ba1\u7b97\u4e2d...', timestamp: new Date().toISOString() };
    uploadingFiles.set(uploadId, upObj);
    fetchUnifiedMessages().then(() => scrollToBottom());
    
    const formData = new FormData();
    formData.append('files', file);

    const xhr = new XMLHttpRequest();
    activeXhrs.set(uploadId, xhr);
    xhr.open('POST', '/api/files/upload', true);

    let lastLoaded = 0;
    let lastTime = Date.now();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const p = Math.round((e.loaded / e.total) * 100);
        upObj.progress = p;
        
        const now = Date.now();
        const diffTime = now - lastTime;
        if (diffTime >= 500 || e.loaded === e.total) {
          const diffLoaded = e.loaded - lastLoaded;
          const speedBps = (diffLoaded / diffTime) * 1000;
          upObj.speed = formatSize(speedBps) + '/s';
          lastLoaded = e.loaded;
          lastTime = now;
        }

        const bar = document.getElementById(`prog_${uploadId}`);
        if(bar) bar.style.width = p + '%';
        
        const speedEl = document.getElementById(`speed_${uploadId}`);
        if(speedEl) speedEl.textContent = upObj.speed;
      }
    };

    xhr.onload = () => {
      activeXhrs.delete(uploadId);
      if (xhr.status === 200) {
        upObj.progress = 100;
        const bar = document.getElementById(`prog_${uploadId}`);
        if(bar) bar.style.width = '100%';
        
        showToast(`发送成功: ${file.name}`, 'success');
        addLog(`发送文件: ${file.name}`);
        
        // Keep the progress bar visible for 1 second before converting to a file bubble
        setTimeout(() => {
          uploadingFiles.delete(uploadId);
          fetchUnifiedMessages();
        }, 1000);
      } else {
        uploadingFiles.delete(uploadId);
        let errorMsg = `发送失败: ${file.name}`;
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.error) errorMsg = `失败: ${res.error}`;
        } catch (e) { /* ignore */ }
        showToast(errorMsg, 'error');
        fetchUnifiedMessages();
      }
    };

    xhr.onerror = () => {
      activeXhrs.delete(uploadId);
      uploadingFiles.delete(uploadId);
      showToast(`发送出错: ${file.name}`, 'error');
      fetchUnifiedMessages();
    };

    xhr.onabort = () => {
      activeXhrs.delete(uploadId);
      uploadingFiles.delete(uploadId);
      showToast(`已取消上传: ${file.name}`, 'info');
      addLog(`取消发送: ${file.name}`);
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

// ============================================
// 局域网测速 (Speed Test) 逻辑
// ============================================
(function initSpeedTest() {
  const btnSpeedtest = document.getElementById('btn-speedtest');
  const speedtestModal = document.getElementById('speedtest-modal');
  const btnCloseSpeedtest = document.getElementById('btn-close-speedtest');
  const btnStartSpeedtest = document.getElementById('btn-start-speedtest');
  const speedDownload = document.getElementById('speed-download');
  const speedUpload = document.getElementById('speed-upload');
  const speedtestConclusion = document.getElementById('speedtest-conclusion');

  if (btnSpeedtest) {
    btnSpeedtest.addEventListener('click', () => {
      speedtestModal.classList.remove('hidden');
    });
  }

  if (btnCloseSpeedtest) {
    btnCloseSpeedtest.addEventListener('click', () => {
      speedtestModal.classList.add('hidden');
    });
  }

  async function runDownloadTest() {
    const startTime = performance.now();
    let bytesReceived = 0;
    const controller = new AbortController();
    
    // 强制 3 秒后中断
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch('/api/speedtest/download', { signal: controller.signal });
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
        
        // 每 0.1 秒刷新一次 UI 以免卡死
        const elapsedSec = (performance.now() - startTime) / 1000;
        if (elapsedSec > 0.1) {
          const speed = (bytesReceived / 1024 / 1024) / elapsedSec;
          speedDownload.textContent = speed.toFixed(1);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Download test error:', err);
      }
    } finally {
      clearTimeout(timeoutId);
    }
    
    const finalElapsed = (performance.now() - startTime) / 1000;
    return (bytesReceived / 1024 / 1024) / finalElapsed;
  }

  async function runUploadTest() {
    const startTime = performance.now();
    let bytesSent = 0;
    const testDuration = 3000; // 3 秒
    
    // 生成 2MB 的垃圾内存数据
    const payload = new Uint8Array(2 * 1024 * 1024);
    
    while (performance.now() - startTime < testDuration) {
      try {
        await fetch('/api/speedtest/upload', {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/octet-stream' }
        });
        bytesSent += payload.length;
        
        const elapsedSec = (performance.now() - startTime) / 1000;
        const speed = (bytesSent / 1024 / 1024) / elapsedSec;
        speedUpload.textContent = speed.toFixed(1);
      } catch (err) {
        console.error('Upload test error:', err);
        break;
      }
    }
    
    const finalElapsed = (performance.now() - startTime) / 1000;
    return (bytesSent / 1024 / 1024) / finalElapsed;
  }

  if (btnStartSpeedtest) {
    btnStartSpeedtest.addEventListener('click', async () => {
      btnStartSpeedtest.disabled = true;
      btnStartSpeedtest.textContent = '测试下行中...';
      btnStartSpeedtest.style.opacity = '0.7';
      speedDownload.textContent = '0.0';
      speedUpload.textContent = '0.0';
      speedtestConclusion.classList.add('hidden');

      // 跑下载
      const dlSpeed = await runDownloadTest();
      speedDownload.textContent = dlSpeed.toFixed(1);

      // 跑上传
      btnStartSpeedtest.textContent = '测试上行中...';
      const ulSpeed = await runUploadTest();
      speedUpload.textContent = ulSpeed.toFixed(1);

      // 恢复 UI
      btnStartSpeedtest.textContent = '重新测速';
      btnStartSpeedtest.disabled = false;
      btnStartSpeedtest.style.opacity = '1';

      // 智能诊断结论
      speedtestConclusion.classList.remove('hidden');
      const minSpeed = Math.min(dlSpeed, ulSpeed);
      const helpLink = '<br><br><a href="/troubleshooting.html#speed" target="_blank" style="color: #93c5fd; text-decoration: underline;">👉 为什么速度跑不满？点击查看提速指南</a>';
      
      if (minSpeed < 10) {
        speedtestConclusion.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        speedtestConclusion.style.borderLeft = '4px solid #ef4444';
        speedtestConclusion.innerHTML = '<strong style="color: #fca5a5;">🔴 警告：局域网极慢</strong><br>您的速度极低，可能是连接了 2.4G Wi-Fi 或信号极差。建议切换到 5G，或直接用手机开热点给电脑连！' + helpLink;
      } else if (minSpeed < 30) {
        speedtestConclusion.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        speedtestConclusion.style.borderLeft = '4px solid #f59e0b';
        speedtestConclusion.innerHTML = '<strong style="color: #fcd34d;">🟡 提示：速度一般</strong><br>带宽满足日常传图和轻量级文件，但传输超大文件（如电影）可能会较耗时。' + helpLink;
      } else {
        speedtestConclusion.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        speedtestConclusion.style.borderLeft = '4px solid #10b981';
        speedtestConclusion.innerHTML = '<strong style="color: #6ee7b7;">🟢 畅通无阻</strong><br>网络环境极佳！您处于局域网高速通道，可尽情跑满带宽传输超大文件！' + helpLink;
      }
    });
  }
})();

import { formatBytes, escapeHtml, showToast } from './utils.js';
import { apiConfig, fetchFiles, fetchClipboard, deleteFile, uploadFileChunked } from './api.js';
import { renderChatHistory, doCopy } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const headerDeviceName = document.getElementById('device-name');
  
  const clipboardInput = document.getElementById('clipboard-input');
  const btnSendClipboard = document.getElementById('btn-send-clipboard');
  const btnAttach = document.getElementById('btn-attach');
  const fileUploadInput = document.getElementById('file-upload-input');
  const chatMessages = document.getElementById('chat-messages');

  // FAB Menu & Batch Mode Elements
  const fabContainer = document.getElementById('fab-container');
  const fabMain = document.getElementById('fab-main');
  const fabMenu = document.getElementById('fab-menu');
  const fabMenuBatch = document.getElementById('fab-menu-batch');
  const fabMenuSpeedtest = document.getElementById('fab-menu-speedtest');
  
  const batchActionBar = document.getElementById('batch-action-bar');
  const batchSelectedCount = document.getElementById('batch-selected-count');
  const btnBatchDelete = document.getElementById('btn-batch-delete');
  const btnBatchDownload = document.getElementById('btn-batch-download');
  const btnBatchCancel = document.getElementById('btn-batch-cancel');

  let isBatchMode = false;
  let selectedFiles = new Set();
  
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
  const btnOpenFolder = document.getElementById('btn-open-folder');

  // QR Code Modal
  const btnConnectPhone = document.getElementById('btn-connect-phone');
  const qrcodeModal = document.getElementById('qrcode-modal');
  const btnCloseQrcode = document.getElementById('btn-close-qrcode');
  const qrcodeBackdrop = document.getElementById('qrcode-backdrop');
  const qrcodeImg = document.getElementById('qrcode-img');
  const qrcodeUrlInput = document.getElementById('qrcode-url-input');
  const btnCopyQrcodeUrl = document.getElementById('btn-copy-qrcode-url');
  const qrcodePinArea = document.getElementById('qrcode-pin-area');
  const qrcodePinCode = document.getElementById('qrcode-pin-code');
  const settingsModal = document.getElementById('settings-modal');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const inputShareDir = document.getElementById('setting-share-dir');
  const inputAccessPassword = document.getElementById('setting-access-password');
  const inputMaxFileSize = document.getElementById('setting-max-file-size');
  const inputMaxClipboardHistory = document.getElementById('setting-max-clipboard-history');
  const inputPort = document.getElementById('setting-port');
  const btnClearHistory = document.getElementById('btn-clear-history');

  // Search State
  let fullUnifiedHistory = [];
  let searchKeyword = '';
  let searchType = 'all';
  const inputSearchKeyword = document.getElementById('search-keyword');
  const searchFilters = document.getElementById('search-filters');
  const btnSearchToggle = document.getElementById('btn-search-toggle');
  const chatSearchBar = document.getElementById('chat-search-bar');

  let forceNextScrollBottom = false;

  if (btnSearchToggle && chatSearchBar) {
    btnSearchToggle.addEventListener('click', () => {
      const isActive = chatSearchBar.classList.toggle('active');
      if (isActive) {
        if (inputSearchKeyword) inputSearchKeyword.focus();
      } else {
        // 关闭时自动清空搜索状态
        if (searchKeyword !== '' || searchType !== 'all') {
          if (inputSearchKeyword) inputSearchKeyword.value = '';
          searchKeyword = '';
          searchType = 'all';
          if (searchFilters) {
            searchFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            const defaultPill = searchFilters.querySelector('[data-type="all"]');
            if (defaultPill) defaultPill.classList.add('active');
          }
          forceNextScrollBottom = true;
          applySearchAndRender();
        }
      }
    });
  }

  if (inputSearchKeyword) {
    inputSearchKeyword.addEventListener('input', (e) => {
      const prevKeyword = searchKeyword;
      searchKeyword = e.target.value.trim().toLowerCase();
      
      // 如果删除了搜索关键字（清空），则强制下一次渲染滚到底部
      if (prevKeyword && !searchKeyword) {
        forceNextScrollBottom = true;
      }
      applySearchAndRender();
    });
  }

  if (searchFilters) {
    searchFilters.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-pill')) {
        searchFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        searchType = e.target.dataset.type;
        applySearchAndRender();
      }
    });
  }

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
          if (btnOpenFolder) btnOpenFolder.classList.remove('hidden');
          if (btnConnectPhone) btnConnectPhone.classList.remove('hidden');
          window._qrData = {
            qrCodeDataUrl: data.qrCodeDataUrl || '',
            connectionUrl: data.connectionUrl || data.url || '',
            pin: data.accessPassword || ''
          };
          if (inputShareDir) inputShareDir.value = data.shareDir || '';
          if (inputAccessPassword) inputAccessPassword.value = data.accessPassword || '';
          
          // 如果是主机，触发后台静默检测更新
          checkUpdateBanner(data.version);

          if (inputMaxFileSize && data.maxFileSize) {
            inputMaxFileSize.value = Math.round(data.maxFileSize / (1024 * 1024 * 1024));
          }
          if (inputMaxClipboardHistory && data.maxClipboardHistory !== undefined) {
            inputMaxClipboardHistory.value = data.maxClipboardHistory;
          }
          if (inputPort && data.port) {
            inputPort.value = data.port;
          }
        }
      }
    } catch (err) {
      console.error('获取设备信息失败:', err);
    }
  }

  // --- 懒加载更新检测 ---
  async function checkUpdateBanner(currentVersion) {
    if (document.getElementById('update-banner-alert')) return; // 防重复
    
    try {
      const res = await fetch('/api/system/update');
      if (!res.ok) return;
      const updateData = await res.json();
      
      if (updateData && updateData.hasUpdate) {
        const dismissedVer = sessionStorage.getItem('dismissedUpdate');
        if (dismissedVer !== updateData.latestVersion) {
          const header = document.getElementById('app-header');
          if (header) {
            const banner = document.createElement('div');
            banner.id = 'update-banner-alert';
            banner.className = 'update-banner';
            banner.innerHTML = `
              <div class="update-banner-content">
                <div class="update-banner-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  发现新版本 v${updateData.latestVersion}
                </div>
                <div class="update-banner-desc">
                  当前版本 v${currentVersion}，强烈建议升级以获取最新功能与修复。
                </div>
              </div>
              <div class="update-banner-actions">
                <a href="${updateData.releaseUrl}" target="_blank" class="btn-update">立即下载</a>
                <button class="btn-close-banner" id="btn-dismiss-update" title="忽略此版本">×</button>
              </div>
            `;
            header.insertAdjacentElement('afterend', banner);

            document.getElementById('btn-dismiss-update').addEventListener('click', () => {
              sessionStorage.setItem('dismissedUpdate', updateData.latestVersion);
              banner.style.opacity = '0';
              banner.style.transform = 'translateY(-10px)';
              setTimeout(() => banner.remove(), 300);
            });
          }
        }
      }
    } catch (err) {
      console.error('检测更新失败:', err);
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

  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/settings/open-folder', { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          showToast(data.error || '无法打开文件夹', 'error');
        }
      } catch (err) {
        showToast('网络错误', 'error');
      }
    });
  }

  // QR Code Modal handlers
  if (btnConnectPhone) {
    btnConnectPhone.addEventListener('click', () => {
      const qr = window._qrData || {};
      if (qrcodeImg && qr.qrCodeDataUrl) qrcodeImg.src = qr.qrCodeDataUrl;
      if (qrcodeUrlInput) qrcodeUrlInput.value = qr.connectionUrl || '';
      if (qr.pin) {
        if (qrcodePinArea) qrcodePinArea.style.display = 'block';
        if (qrcodePinCode) qrcodePinCode.textContent = qr.pin;
      } else {
        if (qrcodePinArea) qrcodePinArea.style.display = 'none';
      }
      if (qrcodeModal) qrcodeModal.classList.remove('hidden');
    });
  }

  const closeQrcode = () => { if (qrcodeModal) qrcodeModal.classList.add('hidden'); };
  if (btnCloseQrcode) btnCloseQrcode.addEventListener('click', closeQrcode);
  if (qrcodeBackdrop) qrcodeBackdrop.addEventListener('click', closeQrcode);

  if (btnCopyQrcodeUrl) {
    btnCopyQrcodeUrl.addEventListener('click', () => {
      const url = qrcodeUrlInput ? qrcodeUrlInput.value : '';
      if (!url) return;
      doCopy(encodeURIComponent(url), btnCopyQrcodeUrl);
    });
  }

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
    if (inputMaxClipboardHistory && inputMaxClipboardHistory.value) {
      payload.maxClipboardHistory = parseInt(inputMaxClipboardHistory.value, 10);
    }
    if (inputAccessPassword && inputAccessPassword.value !== undefined) {
      const pwd = inputAccessPassword.value.trim();
      if (pwd !== '' && pwd !== 'random' && !/^\d{4}$/.test(pwd)) {
        showToast('访问密码必须是 4 位纯数字，或者是 random', 'error');
        btnSaveSettings.textContent = '保存设置';
        btnSaveSettings.disabled = false;
        return;
      }
      payload.accessPassword = pwd;
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

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      if (!confirm('确定要彻底清空所有纯文本历史记录吗？\n（物理文件不受影响）')) return;
      
      try {
        const res = await fetch('/api/clipboard', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast('历史记录已清空', 'success');
          fetchUnifiedMessages();
          closeSettings();
        } else {
          showToast('清空失败', 'error');
        }
      } catch (err) {
        showToast('网络错误', 'error');
      }
    });
  }

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
  
  function scrollToBottom(smooth = false) {
    if (!chatMessages) return;
    
    const executeScroll = () => {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    };

    // 确保 DOM 已完整绘制
    requestAnimationFrame(() => {
      executeScroll();
      
      // 监听未加载完成的图片，加载完毕后再次滚动，防止图片撑开容器导致无法沉底
      const images = chatMessages.querySelectorAll('img');
      images.forEach(img => {
        if (!img.complete) {
          img.addEventListener('load', executeScroll, { once: true });
        }
      });
    });
  }

  // --- WebSocket Real-Time Engine ---
  let ws = null;
  let wsReconnectTimer = null;

  function connectWebSocket() {
    if (ws) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to real-time engine');
      if (wsReconnectTimer) {
        clearInterval(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      fetchUnifiedMessages(); // Fetch once on connect to catch up
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.action) {
          if (payload.action === 'FILE_ADDED') {
            const files = Array.isArray(payload.data.files) ? payload.data.files : [payload.data.files];
            files.forEach(file => {
               const msg = {
                 id: 'file_' + file.name + '_' + file.mtime,
                 type: 'file',
                 content: file.name,
                 fileUrl: '/api/files/download/' + encodeURIComponent(file.name),
                 fileSize: file.size,
                 clientId: 'HOST',
                 deviceName: '🖥️ 服务端文件 (' + window.location.hostname + ')',
                 timestamp: file.mtime
               };
               fullUnifiedHistory.push(msg);
            });
            applySearchAndRender();
            scrollToBottom(true);
          } else if (payload.action === 'CLIPBOARD_ADDED') {
            const msg = {
               ...payload.data,
               type: 'text'
            };
            fullUnifiedHistory.push(msg);
            applySearchAndRender();
            scrollToBottom(true);
          } else if (payload.action === 'FILE_DELETED') {
            const deletedFiles = payload.data.deletedFiles || [];
            fullUnifiedHistory = fullUnifiedHistory.filter(h => !(h.type === 'file' && deletedFiles.includes(h.content)));
            applySearchAndRender();
          } else if (payload.action === 'CLIPBOARD_DELETED') {
            if (payload.data && payload.data.ids) {
              const ids = payload.data.ids;
              fullUnifiedHistory = fullUnifiedHistory.filter(h => !(h.type === 'text' && ids.includes(h.id)));
            } else {
              fullUnifiedHistory = fullUnifiedHistory.filter(h => h.type !== 'text');
            }
            applySearchAndRender();
          }
        }
      } catch (err) {
        console.error('[WebSocket] Message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected. Reconnecting in 3s...');
      ws = null;
      if (!wsReconnectTimer) {
        wsReconnectTimer = setInterval(connectWebSocket, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      if (ws) ws.close(); // Force close to trigger reconnect
    };
  }

  // Initialize WebSockets instead of polling
  connectWebSocket();

  async function fetchUnifiedMessages() {
    try {
      const [clipRes, filesRes] = await Promise.all([
        fetchClipboard(),
        fetchFiles()
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
      
      fullUnifiedHistory = history;
      applySearchAndRender();
      
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  }

  function applySearchAndRender() {
    let history = [...fullUnifiedHistory];
    
    // 1. Filter by Search Keyword (applies to content or filename)
    if (searchKeyword) {
      history = history.filter(item => {
        const text = (item.content || '').toLowerCase();
        return text.includes(searchKeyword);
      });
    }
    
    // 2. Filter by Category Type
    if (searchType !== 'all') {
      history = history.filter(item => {
        const text = (item.content || '').toLowerCase();
        
        if (searchType === 'link') {
          return item.type === 'text' && (text.includes('http://') || text.includes('https://'));
        }
        
        // For media/docs, we generally expect files, or texts that end with extensions
        const isImageVideo = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|webm)$/i.test(text);
        const isAudio = /\.(mp3|wav|aac|m4a|flac|ogg)$/i.test(text);
        const isDoc = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv)$/i.test(text);
        
        if (searchType === 'image_video') return isImageVideo;
        if (searchType === 'audio') return isAudio;
        if (searchType === 'doc') return isDoc;
        
        return true;
      });
    }

    // 3. Sort by timestamp ascending
    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // 4. Limit to last 100 items for DOM performance
    history = history.slice(-100);
    
    // Check if anything changed
    const currentKey = history.map(h => h.id + '_' + (h.progress || 0) + '_' + (h.speed || '')).join(',');
    if (currentKey !== lastMessagesKey) {
      lastMessagesKey = currentKey;
      renderChatHistory(chatMessages, history, {
        forceNextScrollBottom: () => {
          const val = forceNextScrollBottom;
          forceNextScrollBottom = false;
          return val;
        },
        updateBatchUI,
        myClientId,
        isBatchMode: () => isBatchMode,
        onCancelUpload: (id) => {
          if (activeXhrs.has(id)) {
            activeXhrs.get(id).abort();
            activeXhrs.delete(id);
          }
          uploadingFiles.delete(id);
          fetchUnifiedMessages();
        },
        onGalleryOpen: window.openGallery
      });
    }
  }

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
    fetchUnifiedMessages().then(() => scrollToBottom(true));
    
    let lastLoaded = 0;
    let lastTime = Date.now();

    const onProgress = (loaded, total) => {
      const p = Math.round((loaded / total) * 100);
      upObj.progress = p;
      
      const now = Date.now();
      const diffTime = now - lastTime;
      if (diffTime >= 500 || loaded === total) {
        const diffLoaded = loaded - lastLoaded;
        const speedBps = (diffLoaded / diffTime) * 1000;
        upObj.speed = formatBytes(speedBps) + '/s';
        lastLoaded = loaded;
        lastTime = now;
      }

      const bar = document.getElementById(`prog_${uploadId}`);
      if(bar) bar.style.width = p + '%';
      
      const speedEl = document.getElementById(`speed_${uploadId}`);
      if(speedEl) speedEl.textContent = upObj.speed;
    };

    let abortUpload = () => {};
    const onAbort = (abortFn) => {
      abortUpload = abortFn;
    };

    activeXhrs.set(uploadId, { abort: () => abortUpload() });

    uploadFileChunked(file, onProgress, onAbort)
      .then(() => {
        activeXhrs.delete(uploadId);
        upObj.progress = 100;
        const bar = document.getElementById(`prog_${uploadId}`);
        if(bar) bar.style.width = '100%';
        
        showToast(`发送成功: ${file.name}`, 'success');
        addLog(`发送文件: ${file.name}`);
        
        setTimeout(() => {
          uploadingFiles.delete(uploadId);
          fetchUnifiedMessages();
        }, 1000);
      })
      .catch((err) => {
        activeXhrs.delete(uploadId);
        uploadingFiles.delete(uploadId);
        if (err.name === 'AbortError' || err.message === 'AbortError') {
          showToast(`已取消上传: ${file.name}`, 'info');
          addLog(`取消发送: ${file.name}`);
        } else {
          showToast(`发送失败: ${err.message || file.name}`, 'error');
        }
        fetchUnifiedMessages();
      });
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
        fetchUnifiedMessages().then(() => scrollToBottom(true));
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

  // --- Drag and Drop File Upload ---
  const dragOverlay = document.getElementById('drag-overlay');
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    // 仅在拖拽的是“文件”时触发遮罩，忽略文本或 HTML 的拖拽
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) {
        dragOverlay.classList.remove('hidden');
      }
    }
  });

  document.addEventListener('dragleave', (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        dragOverlay.classList.add('hidden');
      }
    }
  });

  document.addEventListener('dragover', (e) => {
    // 必须阻止默认行为，否则 drop 事件不会触发
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy'; // 显示拷贝图标
    }
  });

  document.addEventListener('drop', (e) => {
    // 防止 Safari 等浏览器默认打开文件导致跳出当前页面
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');

    if (e.dataTransfer && e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);
      let hasDirectory = false;
      
      items.forEach(item => {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry && entry.isDirectory) {
            hasDirectory = true;
          } else {
            const file = item.getAsFile();
            if (file) {
              uploadFileAsMessage(file);
            }
          }
        }
      });
      
      if (hasDirectory) {
        showToast('📁 不支持直接发送文件夹，请先将其压缩为 .zip 后再拖入。', 'error');
      }
    } else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Fallback for older browsers
      const files = Array.from(e.dataTransfer.files);
      files.forEach(file => {
        uploadFileAsMessage(file);
      });
    }
  });

  // --- Manual File Upload ---
  if (btnAttach && fileUploadInput) {
    btnAttach.addEventListener('click', () => {
      fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        files.forEach(file => uploadFileAsMessage(file));
        fileUploadInput.value = ''; // Reset for consecutive identical file selections
      }
    });
  }

  // --- Utility ---
  // --- Lightbox Gallery ---
  let galleryImages = [];
  let currentGalleryIndex = 0;
  const btnPrev = document.getElementById('lightbox-prev');
  const btnNext = document.getElementById('lightbox-next');

  window.openGallery = function(imagesArr, startIndex) {
    galleryImages = imagesArr.map(img => ({ src: img.fileUrl, name: img.content }));
    currentGalleryIndex = startIndex;
    updateGalleryView();
    lightbox.classList.remove('hidden');
  };

  window.openLightbox = function(src, filename) {
    galleryImages = [{ src, name: filename }];
    currentGalleryIndex = 0;
    updateGalleryView();
    lightbox.classList.remove('hidden');
  };

  function updateGalleryView() {
    if (galleryImages.length === 0) return;
    const imgData = galleryImages[currentGalleryIndex];
    lightboxImg.src = imgData.src;
    lightboxDownload.href = imgData.src;
    lightboxDownload.download = imgData.name;
    
    if (galleryImages.length > 1) {
      if (btnPrev) btnPrev.classList.remove('hidden');
      if (btnNext) btnNext.classList.remove('hidden');
    } else {
      if (btnPrev) btnPrev.classList.add('hidden');
      if (btnNext) btnNext.classList.add('hidden');
    }
  }

  function nextGalleryImage(e) {
    if (e) e.stopPropagation();
    if (galleryImages.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % galleryImages.length;
    updateGalleryView();
  }

  function prevGalleryImage(e) {
    if (e) e.stopPropagation();
    if (galleryImages.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + galleryImages.length) % galleryImages.length;
    updateGalleryView();
  }

  if (btnNext) btnNext.addEventListener('click', nextGalleryImage);
  if (btnPrev) btnPrev.addEventListener('click', prevGalleryImage);

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('hidden')) {
      if (e.key === 'ArrowRight') nextGalleryImage();
      if (e.key === 'ArrowLeft') prevGalleryImage();
      if (e.key === 'Escape') closeLightbox();
    }
    if (e.key === 'Escape' && qrcodeModal && !qrcodeModal.classList.contains('hidden')) {
      closeQrcode();
    }
  });

  function closeLightbox() {
    lightbox.classList.add('hidden');
    setTimeout(() => {
      lightboxImg.src = '';
      galleryImages = [];
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

  

// ============================================
// 局域网测速 (Speed Test) 逻辑
// ============================================

  const speedtestModal = document.getElementById('speedtest-modal');
  const btnCloseSpeedtest = document.getElementById('btn-close-speedtest');
  const btnStartSpeedtest = document.getElementById('btn-start-speedtest');
  const speedDownload = document.getElementById('speed-download');
  const speedUpload = document.getElementById('speed-upload');
  const speedtestConclusion = document.getElementById('speedtest-conclusion');



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

  // ==========================================
  // Batch Management Logic
  // ==========================================
  
  function updateBatchUI() {
    if (isBatchMode) {
      document.body.classList.add('batch-mode');
      if (fabContainer) fabContainer.classList.add('hidden');
      if (batchActionBar) batchActionBar.classList.remove('hidden');
      if (batchSelectedCount) batchSelectedCount.textContent = `已选 ${selectedFiles.size} 项`;
    } else {
      document.body.classList.remove('batch-mode');
      if (fabContainer) fabContainer.classList.remove('hidden');
      if (batchActionBar) batchActionBar.classList.add('hidden');
      selectedFiles.clear();
      document.querySelectorAll('.batch-checkbox').forEach(cb => cb.checked = false);
    }
  }

  function enterBatchMode(initialFilename = null) {
    if (isBatchMode) return;
    isBatchMode = true;
    selectedFiles.clear();
    if (initialFilename) {
      selectedFiles.add(initialFilename);
    }
    updateBatchUI();

    fetchUnifiedMessages(); // trigger re-render
  }

  function exitBatchMode() {
    isBatchMode = false;
    updateBatchUI();
    fetchUnifiedMessages();
  }

  // FAB Menu Logic
  if (fabMain) {
    fabMain.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = fabMain.classList.contains('active');
      if (isExpanded) {
        fabMain.classList.remove('active');
        fabMenu.classList.add('hidden');
      } else {
        fabMain.classList.add('active');
        fabMenu.classList.remove('hidden');
      }
    });
  }

  // Hide FAB menu when clicking outside
  document.addEventListener('click', (e) => {
    if (fabContainer && !fabContainer.contains(e.target)) {
      fabMain.classList.remove('active');
      fabMenu.classList.add('hidden');
    }
  });

  if (fabMenuBatch) {
    fabMenuBatch.addEventListener('click', (e) => {
      e.stopPropagation();
      fabMain.classList.remove('active');
      fabMenu.classList.add('hidden');
      enterBatchMode();
    });
  }

  if (fabMenuSpeedtest) {
    fabMenuSpeedtest.addEventListener('click', (e) => {
      e.stopPropagation();
      fabMain.classList.remove('active');
      fabMenu.classList.add('hidden');
      
      const modal = document.getElementById('speedtest-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  }

  if (btnBatchCancel) btnBatchCancel.addEventListener('click', () => exitBatchMode());


  if (btnBatchDownload) {
    btnBatchDownload.addEventListener('click', () => {
      if (selectedFiles.size === 0) return;
      const itemsArray = Array.from(selectedFiles);
      const filesToDownload = itemsArray.filter(item => item.startsWith('file:')).map(item => decodeURIComponent(item.substring(5)));
      const albumsToDownload = itemsArray.filter(item => item.startsWith('album:')).map(item => item.substring(6));
      albumsToDownload.forEach(albumStr => {
        albumStr.split('|').forEach(file => filesToDownload.push(decodeURIComponent(file)));
      });
      
      if (filesToDownload.length > 0) {
        const queryParams = filesToDownload.map(f => `files[]=${encodeURIComponent(f)}`).join('&');
        const checkUrl = `/api/files/check-zip?${queryParams}`;
        const url = `/api/files/download-zip?type=batch&${queryParams}`;
        
        fetch(checkUrl).then(res => res.json()).then(data => {
          if (data.valid) {
            const a = document.createElement('a');
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            exitBatchMode();
          } else {
            showToast('选中的文件不存在或已被删除，无法打包', 'error');
          }
        }).catch(() => showToast('网络错误', 'error'));
      } else {
        // 如果全部是纯文本（没有提取出任何有效文件）
        showToast('请至少选择一个文件或相册，纯文本暂不支持打包下载。', 'error');
      }
    });
  }

  if (btnBatchDelete) {
    btnBatchDelete.addEventListener('click', async () => {
      if (selectedFiles.size === 0) return;
      if (!confirm(`确定要删除选中的 ${selectedFiles.size} 项吗？`)) return;

      const itemsArray = Array.from(selectedFiles);
      const filesToDelete = itemsArray.filter(item => item.startsWith('file:')).map(item => item.substring(5));
      const msgsToDelete = itemsArray.filter(item => item.startsWith('msg:')).map(item => item.substring(4));
      
      const albumsToDelete = itemsArray.filter(item => item.startsWith('album:')).map(item => item.substring(6));
      albumsToDelete.forEach(albumStr => {
        albumStr.split('|').forEach(file => filesToDelete.push(file));
      });

      try {
        const promises = [];
        if (filesToDelete.length > 0) {
          promises.push(deleteFile(filesToDelete).then(res => res.json()));
        }

        if (msgsToDelete.length > 0) {
          promises.push(fetch('/api/clipboard/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: msgsToDelete })
          }).then(res => res.json()));
        }

        const results = await Promise.all(promises);
        
        let allSuccess = true;
        for (const data of results) {
          if (!data.success) {
            allSuccess = false;
            showToast(data.error || '部分删除失败', 'error');
          }
        }

        if (allSuccess) {
          showToast('删除成功', 'success');
          exitBatchMode();
        } else {
          exitBatchMode();
        }
      } catch (err) {
        showToast('删除请求失败', 'error');
      }
    });
  }

  let pressTimer;
  let isDragging = false;

  chatMessages.addEventListener('mousedown', handlePressStart);
  chatMessages.addEventListener('touchstart', handlePressStart, { passive: true });

  chatMessages.addEventListener('mouseup', handlePressEnd);
  chatMessages.addEventListener('mouseleave', handlePressEnd);
  chatMessages.addEventListener('touchend', handlePressEnd);
  chatMessages.addEventListener('touchcancel', handlePressEnd);

  chatMessages.addEventListener('mousemove', () => isDragging = true);
  chatMessages.addEventListener('touchmove', () => isDragging = true, { passive: true });

  function handlePressStart(e) {
    const messageRow = e.target.closest('.message-row');
    if (!messageRow) return;
    
    isDragging = false;
    let initialItemId = null;
    
    const cb = messageRow.querySelector('.batch-checkbox');
    if (cb) {
      initialItemId = cb.value;
    }
    
    pressTimer = window.setTimeout(() => {
      if (!isDragging && !isBatchMode && initialItemId) {
        if (navigator.vibrate) navigator.vibrate(50);
        enterBatchMode(initialItemId);
      }
    }, 500); // 500ms 长按触发
  }

  function handlePressEnd() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  // 代理复选框和卡片点击事件
  chatMessages.addEventListener('click', (e) => {
    // 处理相册提取按钮点击 (不限批量模式)
    if (e.target.classList.contains('btn-download-album')) {
      const filesStr = e.target.dataset.files;
      if (filesStr) {
        // filesStr 已经是 encodeURIComponent(filename) 用 '|' 拼接的了
        const filesToDownload = filesStr.split('|').map(f => decodeURIComponent(f));
        const queryParams = filesToDownload.map(f => `files[]=${encodeURIComponent(f)}`).join('&');
        const checkUrl = `/api/files/check-zip?${queryParams}`;
        const url = `/api/files/download-zip?type=album&${queryParams}`;
        
        fetch(checkUrl).then(res => res.json()).then(data => {
          if (data.valid) {
            const a = document.createElement('a');
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else {
            showToast('相册中的图片不存在或已被删除，无法打包', 'error');
          }
        }).catch(() => showToast('网络错误', 'error'));
      }
      return;
    }

    if (!isBatchMode) return;

    const messageRow = e.target.closest('.message-row');
    if (messageRow) {
      const cb = messageRow.querySelector('.batch-checkbox');
      if (cb) {
        // Only prevent default if we didn't click the checkbox directly
        // This allows native checkbox toggling and prevents double-toggling
        if (e.target !== cb && !cb.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          cb.checked = !cb.checked;
        }
        
        const idVal = cb.value;
        if (cb.checked) {
          selectedFiles.add(idVal);
        } else {
          selectedFiles.delete(idVal);
        }
        updateBatchUI();
      }
    }
  });

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
});

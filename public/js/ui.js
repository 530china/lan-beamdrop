import { formatBytes, escapeHtml, showToast } from './utils.js';

export function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
    'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'webm': '🎬', 'ogg': '🎬',
    'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
    'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
    'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝', 'md': '📝',
    'apk': '📱', 'exe': '💻'
  };
  return icons[ext] || '📄';
}

export function isImage(filename) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
}

export function isVideo(filename) {
  return /\.(mp4|webm|ogg|mov|mkv)$/i.test(filename);
}

export function doCopy(encodedText, btnEl) {
  const text = decodeURIComponent(encodedText);
  const showSuccess = (el) => {
    showToast('已复制到剪贴板', 'success');
    if (el && el.tagName === 'BUTTON') {
       const originalText = el.innerHTML;
       el.innerHTML = '已复制';
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
      if (document.execCommand('copy')) showSuccess(el);
      else showToast('复制失败', 'error');
    } catch (err) {
      showToast('复制失败', 'error');
    }
    document.body.removeChild(textArea);
  };

  if (navigator.clipboard && window.isSecureContext) {
     navigator.clipboard.writeText(text).then(() => showSuccess(btnEl)).catch(() => fallbackCopy(text, btnEl));
  } else {
     fallbackCopy(text, btnEl);
  }
}

export function createMessageNode(msg, context) {
  const { myClientId, isBatchMode, onCancelUpload, onGalleryOpen } = context;
  const isSelf = msg.clientId === myClientId;
  const div = document.createElement('div');
  div.className = `chat-message ${isSelf ? 'self' : 'other'}`;
  div.dataset.groupId = msg.id;

  const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  let metaHtml = `<span class="time">${time}</span> <span>${msg.deviceName}</span>`;
  
  if (msg.type === 'text') {
    if (!isSelf) {
      metaHtml += `<button class="btn-copy-msg" data-text="${encodeURIComponent(msg.content)}">复制内容</button>`;
    }
    div.innerHTML = `
      <div class="message-row">
        <div class="batch-checkbox-wrapper">
          <input type="checkbox" class="batch-checkbox" value="msg:${msg.id}">
        </div>
        <div class="message-content">
          <div class="chat-bubble text-bubble" data-text="${encodeURIComponent(msg.content)}" style="cursor: pointer;" title="">${escapeHtml(msg.content)}</div>
          <div class="chat-meta">${metaHtml}</div>
        </div>
      </div>
    `;

    // bind events
    const copyBtn = div.querySelector('.btn-copy-msg');
    if (copyBtn) copyBtn.onclick = (e) => { if(!isBatchMode()) { e.stopPropagation(); doCopy(copyBtn.dataset.text, copyBtn); } };
    
    const textBubble = div.querySelector('.text-bubble');
    if (textBubble) textBubble.onclick = (e) => { if(!isBatchMode()) { e.stopPropagation(); doCopy(textBubble.dataset.text, null); } };

  } else if (msg.type === 'image_album') {
    div.dataset.imgCount = msg.images.length;
    let albumValue = msg.images.map(img => encodeURIComponent(img.content)).join('|');
    let gridHtml = `
      <div class="album-header">
        <span class="album-title">🖼️ 图片相册 (${msg.images.length}张)</span>
        <button class="btn-download-album" data-files="${albumValue}" title="打包下载整个相册">📦 提取打包</button>
      </div>
      <div class="nine-grid" data-count="${msg.images.length}">`;
    msg.images.slice(0, 9).forEach((img, idx) => {
      // 携带时间戳参数作为缓存占位符（Buster），以防移动端浏览器强行缓存了 302 错误重定向或破图状态导致刷新无效
      const thumbUrl = `/api/files/thumbnail/${encodeURIComponent(img.content)}?t=${img.timestamp ? encodeURIComponent(img.timestamp) : ''}`;
      if (idx === 8 && msg.images.length > 9) {
        gridHtml += `
          <div class="img-wrapper">
            <img src="${thumbUrl}" class="image-preview grid-img" data-src="${img.fileUrl}" data-name="${escapeHtml(img.content)}" alt="${escapeHtml(img.content)}" title="">
            <div class="more-overlay" style="pointer-events: none;">+${msg.images.length - 9}</div>
          </div>
        `;
      } else {
        gridHtml += `<img src="${thumbUrl}" class="image-preview grid-img" data-src="${img.fileUrl}" data-name="${escapeHtml(img.content)}" alt="${escapeHtml(img.content)}" title="">`;
      }
    });
    gridHtml += `</div>`;

    div.innerHTML = `
      <div class="message-row">
        <div class="batch-checkbox-wrapper">
          <input type="checkbox" class="batch-checkbox" value="album:${albumValue}">
        </div>
        <div class="message-content">
          <div class="chat-bubble file-card image-album-card" data-filename="${albumValue}">
            ${gridHtml}
          </div>
          <div class="chat-meta">${metaHtml}</div>
        </div>
      </div>
    `;

    const images = div.querySelectorAll('.image-preview, .more-overlay');
    const albumImages = msg.images;
    images.forEach((img, idx) => {
      let realImg = img.classList.contains('image-preview') ? img : img.parentElement.querySelector('.image-preview');
      if(!realImg) return;
      img.onclick = (e) => {
        if(isBatchMode()) return;
        e.stopPropagation();
        let clickedIdx = idx > 8 ? 8 : idx;
        if (onGalleryOpen) {
           onGalleryOpen(albumImages, clickedIdx);
        }
      };
    });

  } else if (msg.type === 'file') {
    const sizeStr = formatBytes(msg.fileSize);
    const isVid = isVideo(msg.content);

    if (isVid) {
      div.innerHTML = `
        <div class="message-row">
          <div class="batch-checkbox-wrapper">
            <input type="checkbox" class="batch-checkbox" value="file:${encodeURIComponent(msg.content)}">
          </div>
          <div class="message-content">
            <div class="chat-bubble file-card video-card" data-filename="${encodeURIComponent(msg.content)}">
              <div class="video-bubble">
                <div class="video-play-overlay">
                  <div class="video-play-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" style="margin-left: 2px;">
                      <path fill="currentColor" d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
                <div class="video-meta-bar">
                  <span class="video-meta-name">${escapeHtml(msg.content)}</span>
                  <span class="video-meta-size">${sizeStr}</span>
                </div>
              </div>
            </div>
            <div class="chat-meta">${metaHtml}</div>
          </div>
        </div>
      `;
    } else {
      const icon = getFileIcon(msg.content);
      div.innerHTML = `
        <div class="message-row">
          <div class="batch-checkbox-wrapper">
            <input type="checkbox" class="batch-checkbox" value="file:${encodeURIComponent(msg.content)}">
          </div>
          <div class="message-content">
            <div class="chat-bubble file-card" data-filename="${encodeURIComponent(msg.content)}">
              <a href="${msg.fileUrl}" class="file-bubble" download style="display: flex; text-decoration: none; color: inherit; padding: 12px 16px; align-items: center; gap: 12px;">
                <div class="file-icon-large">${icon}</div>
                <div class="file-details">
                  <span class="file-name">${escapeHtml(msg.content)}</span>
                  <span class="file-size">${sizeStr}</span>
                </div>
              </a>
            </div>
            <div class="chat-meta">${metaHtml}</div>
          </div>
        </div>
      `;
    }
    
    if (isVid) {
      const videoBubble = div.querySelector('.video-bubble');
      if (videoBubble) {
        videoBubble.onclick = (e) => {
          if (isBatchMode()) return;
          e.stopPropagation();
          showVideoLightbox(msg.fileUrl, msg.content);
        };
      }
    } else {
      const aLink = div.querySelector('a');
      if (aLink) aLink.onclick = (e) => { if(isBatchMode()) e.preventDefault(); };
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
    
    const cancelBtn = div.querySelector('.btn-cancel-upload');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        const id = cancelBtn.dataset.id;
        if (onCancelUpload) {
          onCancelUpload(id);
        }
      };
    }
  }
  return div;
}

export function renderChatHistory(chatMessages, history, context) {
  const { forceNextScrollBottom, updateBatchUI } = context;
  if (!history || history.length === 0) return { domChanged: false };
  
  const oldScrollTop = chatMessages.scrollTop;
  const oldScrollHeight = chatMessages.scrollHeight;
  let isAtBottom = oldScrollHeight - chatMessages.clientHeight <= oldScrollTop + 10;
  
  if (forceNextScrollBottom()) {
    isAtBottom = true;
  }

  const empty = chatMessages.querySelector('.empty-state');
  if (empty) empty.remove();
  
  // 1. Pre-process history into groupedHistory
  const groupedHistory = [];
  let currentGroup = null;

  history.forEach(msg => {
    const isImg = msg.type === 'file' && isImage(msg.content);

    if (isImg) {
      if (currentGroup && currentGroup.type === 'image_album' && currentGroup.clientId === msg.clientId && (new Date(msg.timestamp).getTime() - new Date(currentGroup.timestamp).getTime() <= 120000)) {
        currentGroup.images.push(msg);
      } else {
        currentGroup = {
          type: 'image_album',
          id: 'album_' + msg.id,
          clientId: msg.clientId,
          deviceName: msg.deviceName,
          timestamp: msg.timestamp,
          images: [msg]
        };
        groupedHistory.push(currentGroup);
      }
    } else {
      currentGroup = null;
      groupedHistory.push(msg);
    }
  });

  // 2. Incremental DOM update
  const existingNodesMap = new Map();
  Array.from(chatMessages.children).forEach(child => {
    if (child.dataset.groupId) {
      existingNodesMap.set(child.dataset.groupId, child);
    }
  });

  const newContainer = document.createDocumentFragment();
  let domChanged = false;

  groupedHistory.forEach(item => {
    const groupId = item.id;
    let existingNode = existingNodesMap.get(groupId);
    let needsRender = true;

    if (existingNode) {
      if (item.type === 'image_album') {
        if (parseInt(existingNode.dataset.imgCount) === item.images.length) {
          needsRender = false;
        }
      } else if (item.type === 'upload') {
        needsRender = true; 
      } else {
        needsRender = false;
      }
    }

    if (!needsRender) {
      newContainer.appendChild(existingNode);
      existingNodesMap.delete(groupId);
    } else {
      domChanged = true;
      const div = createMessageNode(item, context);
      newContainer.appendChild(div);
    }
  });

  if (existingNodesMap.size > 0 || domChanged) {
    chatMessages.innerHTML = '';
    chatMessages.appendChild(newContainer);
    if (updateBatchUI) updateBatchUI();
  }
  
  if (isAtBottom && domChanged) {
    setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 50);
  }

  return { domChanged };
}

export function showVideoLightbox(fileUrl, filename) {
  const lightbox = document.createElement('div');
  lightbox.className = 'video-lightbox';
  lightbox.id = 'video-lightbox-modal';

  lightbox.innerHTML = `
    <div class="lightbox-header">
      <span class="lightbox-title">${escapeHtml(filename)}</span>
      <div class="lightbox-actions">
        <a href="${fileUrl}" class="video-lightbox-btn download" download title="下载视频">
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
        </a>
        <button class="video-lightbox-btn close" title="关闭">✖</button>
      </div>
    </div>
    <div class="lightbox-content">
      <video controls autoplay playsinline>
        <source src="${fileUrl}?inline=true">
        您的浏览器不支持 video 标签播放该视频。
      </video>
    </div>
  `;

  document.body.appendChild(lightbox);

  const video = lightbox.querySelector('video');

  const closeLightbox = () => {
    if (video) {
      video.pause();
      video.src = '';
      video.load();
    }
    lightbox.remove();
    document.removeEventListener('keydown', handleEsc);
  };

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  };

  document.addEventListener('keydown', handleEsc);

  const closeBtn = lightbox.querySelector('.video-lightbox-btn.close');
  if (closeBtn) {
    closeBtn.onclick = closeLightbox;
  }

  lightbox.onclick = (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
      closeLightbox();
    }
  };
}

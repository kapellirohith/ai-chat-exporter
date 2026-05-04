document.addEventListener('DOMContentLoaded', () => {
  loadCapsules();

  const handleCapture = async (mode, btnId) => {
    const btn = document.getElementById(btnId);
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="icon">⏳</span> Wait...';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractContext,
      args: [mode]
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
        btn.innerHTML = '<span class="icon">❌</span> Error';
        console.error('Capture failed:', chrome.runtime.lastError);
        setTimeout(() => btn.innerHTML = originalText, 2000);
        return;
      }
      saveCapsule(results[0].result);
      btn.innerHTML = '<span class="icon">✅</span> Done!';
      setTimeout(() => btn.innerHTML = originalText, 2000);
    });
  };

  document.getElementById('capture-chat-btn').addEventListener('click', () => handleCapture('chat', 'capture-chat-btn'));
  document.getElementById('capture-full-btn').addEventListener('click', () => handleCapture('full', 'capture-full-btn'));
});

// ─────────────────────────────────────────────────────────────────────────────
// extractContext — runs INSIDE the target page via chrome.scripting
// ─────────────────────────────────────────────────────────────────────────────
function extractContext(mode) {
  try {
    let textContent = '';

    if (mode === 'chat') {
      // Hide sidebars
      const hideables = document.querySelectorAll(
        'nav, aside, [role="navigation"], [class*="sidebar"], [id*="sidebar"], a[class*="skip"]'
      );
      const restored = [];
      hideables.forEach(n => {
        restored.push({ el: n, display: n.style.display });
        n.style.display = 'none';
      });

      // Chat-specific selectors (ChatGPT, Claude, Gemini)
      const chatSelectors = [
        '[data-message-author-role]',
        '[data-testid*="conversation-turn"]',
        '.font-claude-message',
        '.message-content',
        '[class*="response-text"]',
        '[class*="model-response"]'
      ];

      let foundBubbles = false;
      for (const selector of chatSelectors) {
        const bubbles = document.querySelectorAll(selector);
        if (bubbles.length > 0) {
          bubbles.forEach(el => {
            const text = el.innerText || el.textContent;
            if (text && text.trim()) textContent += text.trim() + '\n\n';
          });
          foundBubbles = true;
          break;
        }
      }

      if (!foundBubbles) {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        textContent = main.innerText || main.textContent;
      }

      restored.forEach(item => { item.el.style.display = item.display; });

    } else {
      textContent = document.body.innerText;
    }

    // ── Images ──
    const images = [];
    document.body.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:image/svg') && img.width > 30 && img.height > 30) {
        if (!images.includes(img.src)) images.push(img.src);
      }
    });

    // ════════════════════════════════════════════════════════════
    // UNIVERSAL FILE ATTACHMENT DETECTOR — 3 strategies
    // Works on ChatGPT, Gemini, Claude and any website
    // ════════════════════════════════════════════════════════════
    const EXT = 'pdf|csv|docx?|xlsx?|pptx?|txt|json|xml|zip|mp3|mp4|mov|wav|py|js|ts|html|md|rtf';
    const FULL_RE = new RegExp(`\\b([\\w\\-. ]+\\.(${EXT}))\\b`, 'gi');
    const TYPE_RE = new RegExp(`^(PDF|CSV|DOCX?|XLSX?|PPTX?|TXT|JSON|XML|ZIP|MP3|MP4|MOV|WAV|PY|JS|TS|HTML|MD|RTF)$`, 'i');
    const HAS_EXT = new RegExp(`\\.(${EXT})$`, 'i');

    const attachments = [];
    const seen = new Set();

    function addFile(name, url) {
      const key = (name || '').trim().toLowerCase();
      if (key.length > 2 && key.length < 200 && !seen.has(key)) {
        seen.add(key);
        attachments.push({ name: name.trim(), url: url || '' });
      }
    }

    // ── Strategy 1: aria-label, title, alt attributes ──
    document.querySelectorAll('[aria-label],[title],[alt]').forEach(el => {
      ['aria-label', 'title', 'alt'].forEach(attr => {
        const val = el.getAttribute(attr) || '';
        if (!val) return;
        let m; FULL_RE.lastIndex = 0;
        while ((m = FULL_RE.exec(val)) !== null) addFile(m[1], '');
      });
    });

    // ── Strategy 2: File-type badge pairing (Gemini/ChatGPT split rendering) ──
    // Use TreeWalker to find text nodes whose content is ONLY a file type name
    // ("PDF", "CSV" etc.) then walk up to find the filename in the same container.
    // This is O(n) not O(n²) — safe and fast.
    const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let n2;
    while ((n2 = tw2.nextNode())) {
      const t = (n2.textContent || '').trim();
      if (!TYPE_RE.test(t)) continue;          // Not a pure file-type badge text node
      const ext = t.toLowerCase();
      const badgeEl = n2.parentElement;
      if (!badgeEl) continue;

      // Walk up max 6 levels to find the card container
      let container = badgeEl.parentElement;
      for (let d = 0; d < 6 && container && container !== document.body; d++) {
        const raw = (container.innerText || '').trim();
        if (raw.length < 3 || raw.length > 500) { container = container.parentElement; continue; }
        const withoutBadge = raw.replace(new RegExp(`\\b${t}\\b`, 'gi'), '').trim();
        const firstLine = withoutBadge.split('\n')[0].trim();
        if (firstLine.length > 2 && firstLine.length < 180) {
          const fullName = HAS_EXT.test(firstLine) ? firstLine : (firstLine + '.' + ext);
          addFile(fullName, '');
          break;
        }
        container = container.parentElement;
      }
    }

    // ── Strategy 3: Full filename text scan (fallback) ──
    const tw3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let n3;
    while ((n3 = tw3.nextNode())) {
      let m; FULL_RE.lastIndex = 0;
      while ((m = FULL_RE.exec(n3.textContent || '')) !== null) {
        const link = n3.parentElement && n3.parentElement.closest('a');
        addFile(m[1], link ? link.href : '');
      }
    }

    // ── Strategy 4: Explicit <a download> / <a href> links ──
    document.body.querySelectorAll('a[download],a[href]').forEach(a => {
      const href = a.href || '';
      const fname = (a.getAttribute('download') || href.split('/').pop().split('?')[0] || '').trim();
      FULL_RE.lastIndex = 0;
      if (fname && FULL_RE.test(fname)) addFile(fname, href);
    });

    // Build attachment text block
    let attachmentText = '';
    if (attachments.length > 0) {
      attachmentText = '\n\n--- ATTACHED / REFERENCED FILES ---\n';
      attachments.forEach((f, i) => {
        attachmentText += `[File ${i + 1}] ${f.name}${f.url ? ' — ' + f.url : ''}\n`;
      });
      attachmentText += '--- END FILES ---\n';
    }

    return {
      id: Date.now().toString(),
      title: document.title,
      url: window.location.href,
      text: textContent + attachmentText,
      images: images,
      attachments: attachments,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    // Never crash — always return a safe object
    return {
      id: Date.now().toString(),
      title: document.title,
      url: window.location.href,
      text: document.body.innerText || '',
      images: [],
      attachments: [],
      timestamp: new Date().toISOString(),
      error: err.message
    };
  }
}

function saveCapsule(data) {
  if (!data) return; // Never save null/undefined
  chrome.storage.local.get(['capsules'], (result) => {
    // Filter out any corrupted null/undefined entries from previous bugs
    const capsules = (result.capsules || []).filter(c => c && c.id && c.text);
    capsules.unshift(data);
    if (capsules.length > 10) capsules.pop();
    chrome.storage.local.set({ capsules }, () => loadCapsules());
  });
}

function loadCapsules() {
  chrome.storage.local.get(['capsules'], (result) => {
    // Filter out corrupted entries
    const capsules = (result.capsules || []).filter(c => c && c.id && c.text);
    const list = document.getElementById('capsules-list');
    const count = document.getElementById('capsule-count');

    count.textContent = capsules.length;

    if (capsules.length === 0) {
      list.innerHTML = '<div class="empty-state">No capsules saved yet.</div>';
      return;
    }

    list.innerHTML = '';
    capsules.forEach(capsule => {
      // Safe access — never crash on bad data
      const date = capsule.timestamp ? new Date(capsule.timestamp).toLocaleString() : 'Unknown';
      const charCount = capsule.text ? capsule.text.length : 0;
      const card = document.createElement('div');
      card.className = 'capsule-card';

      let imagesHtml = '';
      if (capsule.images && capsule.images.length > 0) {
        imagesHtml = '<div class="image-preview">' +
          capsule.images.map(src => `<img src="${src}" alt="preview">`).join('') +
          '</div>';
      }

      // Show file attachment chips in popup list
      let filesHtml = '';
      if (capsule.attachments && capsule.attachments.length > 0) {
        const FILE_ICONS = { pdf:'📄', csv:'📊', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊',
          ppt:'📊', pptx:'📊', txt:'📋', json:'📋', zip:'🗂', py:'💻', js:'💻',
          ts:'💻', html:'🌐', md:'📋', default:'📁' };
        filesHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;">' +
          capsule.attachments.slice(0, 6).map(f => {
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            const icon = FILE_ICONS[ext] || FILE_ICONS.default;
            return `<span style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);border-radius:6px;padding:2px 8px;font-size:11px;color:#c4b5fd;">${icon} ${f.name}</span>`;
          }).join('') +
          (capsule.attachments.length > 6 ? `<span style="font-size:11px;color:#94a3b8;">+${capsule.attachments.length - 6} more</span>` : '') +
          '</div>';
      }

      card.innerHTML = `
        <div class="capsule-header">
          <div>
            <h3 class="capsule-title">${capsule.title || 'Untitled'}</h3>
            <div class="capsule-meta">${date} • ${charCount} chars</div>
          </div>
        </div>
        ${imagesHtml}
        ${filesHtml}
        <div class="capsule-actions">
          <button class="action-btn" data-action="copy" data-id="${capsule.id}">Copy Text</button>
          <button class="action-btn send" data-action="send" data-id="${capsule.id}">Send to AI</button>
        </div>
      `;
      list.appendChild(card);
    });

    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const action = e.target.getAttribute('data-action');
        const capsule = capsules.find(c => c.id === id);
        if (!capsule) return;

        if (action === 'copy') {
          navigator.clipboard.writeText(capsule.text).then(() => {
            e.target.textContent = 'Copied!';
            setTimeout(() => e.target.textContent = 'Copy Text', 2000);
          });
        } else if (action === 'send') {
          chrome.runtime.sendMessage({ type: 'SEND_TO_AI', capsule: capsule });
        }
      });
    });
  });
}

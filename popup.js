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
      if (chrome.runtime.lastError || !results || !results[0]) {
        btn.innerHTML = '<span class="icon">❌</span> Error';
        console.error(chrome.runtime.lastError);
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

// Function to run in the context of the web page
function extractContext(mode) {
  let textContent = '';
  let rootElement = document.body;

  if (mode === 'chat') {
    // 1. Force hide known sidebars by extremely broad attribute matching
    const hideables = document.querySelectorAll(
      'nav, aside, [role="navigation"], [class*="sidebar"], [id*="sidebar"], a[class*="skip"]'
    );
    const restored = [];
    
    hideables.forEach(n => {
      restored.push({ el: n, display: n.style.display });
      n.style.display = 'none';
    });

    // 2. Try to get highly specific chat bubbles
    const chatSelectors = [
      '[data-message-author-role]', 
      '[data-testid*="conversation-turn"]', 
      '.font-claude-message',
      '.message-content'
    ];
    
    let foundBubbles = false;
    for (const selector of chatSelectors) {
      const bubbles = document.querySelectorAll(selector);
      if (bubbles.length > 0) {
        bubbles.forEach(el => {
          const text = el.innerText || el.textContent;
          if (text && text.trim()) {
            textContent += text.trim() + '\n\n';
          }
        });
        foundBubbles = true;
        break; // Stop looking once we find a valid chat selector
      }
    }

    // 3. Fallback if no specific bubbles found
    if (!foundBubbles) {
      const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      textContent = mainContent.innerText || mainContent.textContent;
    }

    // Restore hidden elements
    restored.forEach(item => {
      item.el.style.display = item.display;
    });

  } else {
    // Full Page mode
    textContent = document.body.innerText;
  }
  
  const images = [];
  const imgElements = document.body.querySelectorAll('img');
  imgElements.forEach(img => {
    // Basic filter to avoid tracking pixels and UI icons
    if (img.src && !img.src.startsWith('data:image/svg') && img.width > 30 && img.height > 30) {
      if (!images.includes(img.src)) {
        images.push(img.src);
      }
    }
  });

  // ── CAPTURE FILE ATTACHMENTS ──
  // Strategy: scan ALL text nodes on page for filename patterns.
  // This works regardless of ChatGPT/Claude/Gemini's dynamic class names.
  const FILE_NAME_PATTERN = /\b([\w\-. ]+\.(pdf|csv|docx?|xlsx?|pptx?|txt|json|xml|zip|mp3|mp4|mov|wav|py|js|ts|html|md|rtf))\b/gi;
  const attachments = [];
  const seenNames = new Set();

  // Walk every text node in the page
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    let match;
    FILE_NAME_PATTERN.lastIndex = 0;
    while ((match = FILE_NAME_PATTERN.exec(text)) !== null) {
      const name = match[1].trim();
      // Skip very short/generic names and duplicates
      if (name.length > 3 && name.length < 120 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        // Try to find a nearby link for this filename
        const parentLink = node.parentElement && node.parentElement.closest('a');
        attachments.push({ name, url: parentLink ? parentLink.href : '' });
      }
    }
  }

  // Also catch any explicit <a download> or <a href> pointing to files
  document.body.querySelectorAll('a[href], a[download]').forEach(a => {
    const href = a.href || '';
    const fname = (a.getAttribute('download') || href.split('/').pop().split('?')[0] || '').trim();
    if (fname && FILE_NAME_PATTERN.test(fname) && !seenNames.has(fname.toLowerCase())) {
      seenNames.add(fname.toLowerCase());
      attachments.push({ name: fname, url: href });
    }
    FILE_NAME_PATTERN.lastIndex = 0;
  });

  // Build attachment text block to append to transcript
  let attachmentText = '';
  if (attachments.length > 0) {
    attachmentText = '\n\n--- ATTACHED / REFERENCED FILES ---\n';
    attachments.forEach((f, i) => {
      attachmentText += `[File ${i + 1}] ${f.name}${f.url ? ' \u2014 ' + f.url : ''}\n`;
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
}

function saveCapsule(data) {
  chrome.storage.local.get(['capsules'], (result) => {
    const capsules = result.capsules || [];
    capsules.unshift(data);
    
    // keep only last 10
    if (capsules.length > 10) capsules.pop();
    
    chrome.storage.local.set({ capsules }, () => {
      loadCapsules();
    });
  });
}

function loadCapsules() {
  chrome.storage.local.get(['capsules'], (result) => {
    const capsules = result.capsules || [];
    const list = document.getElementById('capsules-list');
    const count = document.getElementById('capsule-count');
    
    count.textContent = capsules.length;
    
    if (capsules.length === 0) {
      list.innerHTML = '<div class="empty-state">No capsules saved yet.</div>';
      return;
    }
    
    list.innerHTML = '';
    capsules.forEach(capsule => {
      const date = new Date(capsule.timestamp).toLocaleString();
      const card = document.createElement('div');
      card.className = 'capsule-card';
      
      let imagesHtml = '';
      if (capsule.images && capsule.images.length > 0) {
        imagesHtml = '<div class="image-preview">' + 
          capsule.images.map(src => `<img src="${src}" alt="preview">`).join('') +
          '</div>';
      }
      
      card.innerHTML = `
        <div class="capsule-header">
          <div>
            <h3 class="capsule-title">${capsule.title}</h3>
            <div class="capsule-meta">${date} • ${capsule.text.length} chars</div>
          </div>
        </div>
        ${imagesHtml}
        <div class="capsule-actions">
          <button class="action-btn" data-action="copy" data-id="${capsule.id}">Copy Text</button>
          <button class="action-btn send" data-action="send" data-id="${capsule.id}">Send to AI</button>
        </div>
      `;
      list.appendChild(card);
    });

    // Add event listeners to buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const action = e.target.getAttribute('data-action');
        const capsule = capsules.find(c => c.id === id);
        
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

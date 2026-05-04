document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['active_context'], (result) => {
    if (result.active_context) {
      const ctx = result.active_context;
      
      // format context for better AI understanding
      const formattedText = `===========================================
AI CHAT EXPORT
===========================================
The user is providing you with the context of a previous conversation or a webpage. 
Please read the transcript below to understand the context. 
If images are attached to this prompt or document, they belong to this context.

Source Details:
- Title: ${ctx.title}
- URL: ${ctx.url}
- Captured At: ${new Date(ctx.timestamp || Date.now()).toLocaleString()}

--- BEGIN TRANSCRIPT / PAGE CONTENT ---
${ctx.text}
--- END TRANSCRIPT / PAGE CONTENT ---

Note to AI: Await the user's next instructions based on this context.`;
      
      document.getElementById('preview').textContent = formattedText;
      
      // Load images
      const imgContainer = document.getElementById('image-container');
      if (ctx.images && ctx.images.length > 0) {
        ctx.images.forEach(src => {
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.display = 'inline-block';
          
          const img = document.createElement('img');
          img.src = src;
          img.crossOrigin = 'anonymous';
          
          const copyBtn = document.createElement('button');
          copyBtn.textContent = 'Copy Image';
          copyBtn.style.cssText = 'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:4px 8px;background:var(--primary);color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;opacity:0.8;';
          
          copyBtn.addEventListener('click', async () => {
            try {
              const response = await fetch(src);
              const blob = await response.blob();
              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
              copyBtn.textContent = 'Copied!';
              setTimeout(() => copyBtn.textContent = 'Copy Image', 2000);
            } catch (err) {
              copyBtn.textContent = 'Failed';
              setTimeout(() => copyBtn.textContent = 'Copy Image', 2000);
            }
          });
          
          wrapper.appendChild(img);
          wrapper.appendChild(copyBtn);
          imgContainer.appendChild(wrapper);
        });
      }

      // ── RENDER FILE ATTACHMENTS ──
      const fileSection = document.getElementById('file-section');
      const fileContainer = document.getElementById('file-container');
      const fileSectionLabel = document.getElementById('file-section-label');

      if (ctx.attachments && ctx.attachments.length > 0) {
        const FILE_ICONS = {
          pdf: '📄', csv: '📊', doc: '📝', docx: '📝',
          xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
          txt: '📋', json: '📋', xml: '📋', md: '📋',
          zip: '🗂', py: '💻', js: '💻', ts: '💻',
          mp3: '🎵', mp4: '🎬', mov: '🎬', wav: '🎵',
          html: '🌐', default: '📁'
        };

        fileSectionLabel.textContent = `Attached Files (${ctx.attachments.length})`;
        fileSection.style.display = 'block';
        fileContainer.innerHTML = '';

        ctx.attachments.forEach(f => {
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          const icon = FILE_ICONS[ext] || FILE_ICONS.default;
          const chip = document.createElement('div');
          chip.className = 'file-chip' + (f.url ? ' clickable' : '');
          chip.title = f.name + (f.url ? '\n' + f.url : '');
          chip.textContent = icon + '  ' + f.name;
          if (f.url) chip.addEventListener('click', () => window.open(f.url, '_blank'));
          fileContainer.appendChild(chip);
        });
      } else {
        fileSection.style.display = 'none';
      }
      
      // Try to auto-copy
      navigator.clipboard.writeText(formattedText).catch(err => {
        console.log('Auto-copy needs user interaction first.');
      });

      const pdfBtn = document.getElementById('pdf-btn');
      pdfBtn.addEventListener('click', () => {
        window.print();
      });

      const copyBtn = document.getElementById('copy-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(formattedText).then(() => {
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = 'Copied!';
          setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
        });
      });
    } else {
      document.getElementById('preview').textContent = 'No context found. Please capture a page first.';
    }
  });

  document.querySelectorAll('.ai-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const url = e.currentTarget.getAttribute('data-url');
      
      // Copy to clipboard again just to be sure right before opening
      const textToCopy = document.getElementById('preview').textContent;
      navigator.clipboard.writeText(textToCopy).then(() => {
        window.open(url, '_blank');
      }).catch(() => {
        // Even if copy fails, open the URL
        window.open(url, '_blank');
      });
    });
  });
});

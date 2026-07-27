(function () {
  if (window.__tmiChatLoaded) return;
  window.__tmiChatLoaded = true;

  // Marketing only: never show on the diagnose page, app, admin, or any
  // transactional / document flow (proposals, invoices, certificates, booking,
  // intake, thank-you, etc.).
  if (/\/(diagnose|os|admin|platform|tmi-os|booking|thank-you|disconnect|hd-intake|certificate|intelligent-company-certified|invoice-view|proposal-view|proposal-sign|build-proposal|sales-playbook|city-leads)(\b|\/|$)/.test(location.pathname)) return;

  const OPENING =
    "Hi - I'm TMI's AI assistant, here to help figure out where AI fits in your operation. Tell me what you do, roughly how big you are, and what's the thing eating the most of your time or margin right now.";

  const ROUTES = {
    audit: {
      label: 'Get the Complete Audit - $1,000',
      url: '/complete-audit',
      note: 'A detailed operational audit, then 30 minutes with the founder and a strategist.',
    },
  };

  // ─── CSS ────────────────────────────────────────────────────────────────────
  const css = `
    @keyframes tmiDotBounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-5px); opacity: 1; }
    }
    @keyframes tmiMsgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes tmiPanelIn {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .tmi-trigger {
      position: fixed; bottom: 28px; right: 28px; z-index: 9998;
      display: flex; align-items: center; gap: 10px;
      background: #0a0b14; color: #E4FF97;
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
      padding: 12px 20px; border-radius: 999px; border: none; cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25);
      transition: background 0.15s, transform 0.15s;
    }
    .tmi-trigger:hover { background: #1a1a2e; transform: translateY(-1px); }
    .tmi-trigger svg { flex-shrink: 0; }

    .tmi-panel {
      position: fixed; bottom: 88px; right: 28px; z-index: 9999;
      width: 380px; height: 540px; max-height: calc(100vh - 120px);
      background: #ffffff; border-radius: 20px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(16px) scale(0.98); pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(.2,.8,.2,1);
    }
    .tmi-panel.open {
      opacity: 1; transform: translateY(0) scale(1); pointer-events: all;
    }

    .tmi-panel-header {
      padding: 16px 20px; border-bottom: 1px solid rgba(0,0,0,0.07);
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0; background: #ffffff;
    }
    .tmi-panel-who { display: flex; align-items: center; gap: 12px; }
    .tmi-panel-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: #0a0b14; color: #E4FF97;
      font-family: "Barlow", system-ui, sans-serif;
      font-size: 14px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .tmi-panel-name {
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 14px; font-weight: 600; color: #1a1a1a; line-height: 1.2;
    }
    .tmi-panel-sub {
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 11px; color: #86868b; letter-spacing: 0.04em;
    }
    .tmi-panel-close {
      width: 28px; height: 28px; border: none; background: #f5f5f7;
      border-radius: 50%; cursor: pointer; color: #505060;
      font-size: 16px; line-height: 1; display: flex; align-items: center;
      justify-content: center; transition: background 0.15s;
    }
    .tmi-panel-close:hover { background: #e8e8eb; }

    .tmi-messages {
      flex: 1; overflow-y: auto; padding: 20px 16px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .tmi-messages::-webkit-scrollbar { width: 4px; }
    .tmi-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }

    .tmi-msg {
      display: flex; animation: tmiMsgIn 0.22s ease forwards;
    }
    .tmi-msg--assistant { justify-content: flex-start; }
    .tmi-msg--user { justify-content: flex-end; }

    .tmi-msg-bubble {
      max-width: 82%; padding: 10px 14px; border-radius: 16px;
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 13.5px; line-height: 1.6; white-space: pre-wrap;
    }
    .tmi-msg--assistant .tmi-msg-bubble {
      background: #f5f5f7; color: #1a1a1a; border-bottom-left-radius: 4px;
    }
    .tmi-msg--user .tmi-msg-bubble {
      background: #0a0b14; color: rgba(255,255,255,0.88); border-bottom-right-radius: 4px;
    }

    .tmi-typing .tmi-msg-bubble {
      display: flex; align-items: center; gap: 4px; padding: 12px 16px;
    }
    .tmi-dot {
      width: 6px; height: 6px; background: #86868b; border-radius: 50%;
      animation: tmiDotBounce 1.2s infinite;
    }
    .tmi-dot:nth-child(2) { animation-delay: 0.15s; }
    .tmi-dot:nth-child(3) { animation-delay: 0.3s; }

    .tmi-cta-card {
      background: linear-gradient(135deg, rgba(228,255,151,0.12), rgba(228,255,151,0.06));
      border: 1px solid rgba(228,255,151,0.4); border-radius: 14px;
      padding: 16px; margin-top: 4px;
      animation: tmiMsgIn 0.3s ease forwards;
    }
    .tmi-cta-btn {
      display: block; background: #E4FF97; color: #0a0b14;
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 13px; font-weight: 700; padding: 11px 16px;
      border-radius: 999px; text-align: center; text-decoration: none;
      transition: background 0.15s; margin-bottom: 8px;
    }
    .tmi-cta-btn:hover { background: #D0FF6A; }
    .tmi-cta-note {
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 11px; color: #86868b; text-align: center;
    }

    .tmi-input-area {
      padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.07);
      display: flex; align-items: flex-end; gap: 8px; flex-shrink: 0;
      background: #ffffff;
    }
    .tmi-input {
      flex: 1; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px;
      padding: 9px 14px; resize: none; outline: none;
      font-family: "Neue Haas Grotesk Display", system-ui, sans-serif;
      font-size: 13.5px; color: #1a1a1a; line-height: 1.5;
      max-height: 96px; overflow-y: auto; background: #f5f5f7;
      transition: border-color 0.15s;
    }
    .tmi-input:focus { border-color: rgba(0,0,0,0.25); background: #ffffff; }
    .tmi-input::placeholder { color: #86868b; }
    .tmi-send {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: #0a0b14; color: #E4FF97; font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s; align-self: flex-end;
    }
    .tmi-send:hover { background: #1a1a2e; }
    .tmi-send:disabled { opacity: 0.4; cursor: not-allowed; }

    @media (max-width: 440px) {
      .tmi-panel { width: calc(100vw - 24px); right: 12px; bottom: 80px; }
      .tmi-trigger { right: 16px; bottom: 20px; padding: 10px 16px; font-size: 12px; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ─── HTML ───────────────────────────────────────────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
    <button class="tmi-trigger" id="tmiTrigger" aria-label="Chat with TMI">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M14 1H2C1.45 1 1 1.45 1 2v9c0 .55.45 1 1 1h9l3 3V2c0-.55-.45-1-1-1z" fill="currentColor"/>
      </svg>
      Talk to Us
    </button>

    <div class="tmi-panel" id="tmiPanel" aria-hidden="true" role="dialog" aria-label="Chat with TMI">
      <div class="tmi-panel-header">
        <div class="tmi-panel-who">
          <div class="tmi-panel-avatar">T</div>
          <div>
            <div class="tmi-panel-name">TMI</div>
            <div class="tmi-panel-sub">AI Assistant</div>
          </div>
        </div>
        <button class="tmi-panel-close" id="tmiClose" aria-label="Close chat">×</button>
      </div>
      <div class="tmi-messages" id="tmiMessages"></div>
      <div class="tmi-input-area">
        <textarea class="tmi-input" id="tmiInput" placeholder="Type your message..." rows="1"></textarea>
        <button class="tmi-send" id="tmiSend" aria-label="Send">↑</button>
      </div>
    </div>
  `);

  // ─── State ───────────────────────────────────────────────────────────────────
  const chatHistory = []; // user/assistant pairs after the opening
  let loading = false;
  let opened = false;

  const panel   = document.getElementById('tmiPanel');
  const trigger = document.getElementById('tmiTrigger');
  const closeBtn = document.getElementById('tmiClose');
  const messagesEl = document.getElementById('tmiMessages');
  const inputEl = document.getElementById('tmiInput');
  const sendBtn = document.getElementById('tmiSend');

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function parseRoute(text) {
    const m = text.match(/\[ROUTE:([a-z\-:]+)\]/);
    return m ? m[1].split(':')[0] : null;
  }

  function stripRoute(text) {
    return text.replace(/\[ROUTE:[^\]]+\]\s*/g, '').trim();
  }

  function addMessage(role, rawText) {
    const route = parseRoute(rawText);
    const text = stripRoute(rawText);

    const row = document.createElement('div');
    row.className = `tmi-msg tmi-msg--${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'tmi-msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollBottom();

    if (route) {
      const info = ROUTES[route];
      if (info) setTimeout(() => addCta(info), 350);
    }
  }

  function addCta(route) {
    const card = document.createElement('div');
    card.className = 'tmi-cta-card';
    card.innerHTML = `<a href="${route.url}" class="tmi-cta-btn">${route.label} →</a><div class="tmi-cta-note">${route.note}</div>`;
    messagesEl.appendChild(card);
    scrollBottom();
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'tmi-msg tmi-msg--assistant tmi-typing';
    row.id = 'tmiTyping';
    row.innerHTML = '<div class="tmi-msg-bubble"><span class="tmi-dot"></span><span class="tmi-dot"></span><span class="tmi-dot"></span></div>';
    messagesEl.appendChild(row);
    scrollBottom();
  }

  function removeTyping() {
    const el = document.getElementById('tmiTyping');
    if (el) el.remove();
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────────
  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    trigger.style.opacity = '0';
    trigger.style.pointerEvents = 'none';
    if (!opened) {
      opened = true;
      addMessage('assistant', OPENING);
    }
    setTimeout(() => inputEl.focus(), 200);
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    trigger.style.opacity = '';
    trigger.style.pointerEvents = '';
  }

  trigger.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);

  // ─── Send ─────────────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || loading) return;

    addMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
    loading = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const apiMessages = [
        { role: 'assistant', content: OPENING },
        ...chatHistory,
      ];

      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      removeTyping();

      if (!r.ok) throw new Error('API error');
      const { content } = await r.json();

      chatHistory.push({ role: 'assistant', content });
      addMessage('assistant', content);
    } catch {
      removeTyping();
      addMessage('assistant', 'Something went wrong on my end. Email support@tmitechai.com directly.');
    }

    loading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
  });
})();

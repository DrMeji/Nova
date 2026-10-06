const api = window.tempNova;
const messagesEl = document.getElementById('messages');
const modelList = document.getElementById('modelList');
const brainBadge = document.getElementById('brainBadge');
const modelHint = document.getElementById('modelHint');
const input = document.getElementById('input');
const form = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');
const refreshModels = document.getElementById('refreshModels');

/** @type {{ id: string, name: string } | null} */
let selected = null;
/** @type {{ role: 'user' | 'assistant', content: string }[]} */
const history = [];

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBadge(ok, text) {
  brainBadge.textContent = text;
  brainBadge.className = `badge ${ok ? 'ok' : 'bad'}`;
}

function renderModels(models, activeId) {
  modelList.innerHTML = '';
  if (!models.length) {
    modelHint.textContent = 'No Ready models. Open Nova → Models and make sure a chat model is Ready.';
    return;
  }
  modelHint.textContent = 'Click a model, then chat.';
  for (const m of models) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'model-btn';
    btn.innerHTML = `${escapeHtml(m.name || m.id)}<small>${escapeHtml(m.id)}${m.sizeGb ? ` · ${m.sizeGb} GB` : ''}</small>`;
    const pick = () => {
      selected = { id: m.id, name: m.name || m.id };
      for (const el of modelList.querySelectorAll('.model-btn')) el.classList.remove('active');
      btn.classList.add('active');
    };
    btn.onclick = pick;
    modelList.appendChild(btn);
    if ((activeId && m.id === activeId) || (!selected && /qwen25|instruct/i.test(m.id))) {
      pick();
    }
  }
  if (!selected && models[0]) {
    selected = { id: models[0].id, name: models[0].name || models[0].id };
    modelList.querySelector('.model-btn')?.classList.add('active');
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadModels() {
  const st = await api.brainStatus();
  if (!st.ok) {
    setBadge(false, 'Nova offline');
    modelHint.textContent = 'Open full Nova first, wait until it finishes starting, then press Refresh.';
    modelList.innerHTML = '';
    selected = null;
    return;
  }
  setBadge(true, 'Connected to Nova');
  const res = await api.listModels();
  if (!res.ok) {
    setBadge(false, 'Nova offline');
    modelHint.textContent = res.error || 'Could not load models.';
    modelList.innerHTML = '';
    selected = null;
    return;
  }
  renderModels(res.models || [], res.activeModelId);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!selected?.id) {
    addBubble('error', 'Pick a model first.');
    return;
  }
  addBubble('user', text);
  input.value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  try {
    const res = await api.chat({
      message: text,
      modelId: selected.id,
      history,
    });
    if (!res.ok) {
      addBubble('error', res.error || 'Chat failed');
      if (res.offline) await loadModels();
      return;
    }
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: res.reply });
    if (history.length > 24) history.splice(0, history.length - 24);
    addBubble('assistant', res.reply);
  } catch (err) {
    const msg = String(err?.message || err);
    addBubble(
      'error',
      /ECONNREFUSED|8787/i.test(msg)
        ? 'Nova Brain offline. Open full Nova, then press Refresh.'
        : msg,
    );
    await loadModels();
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
});

refreshModels.addEventListener('click', () => loadModels());
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

loadModels();

// ============================================================
// ui.js — 汎用UIヘルパー（モーダル開閉／トースト／タブ切替）
// ゲーム固有のロジックは持たない。DOM操作だけに責務を絞っている。
// ============================================================

export function openModal(id){
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
}

export function closeModal(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
}

export function toggleModal(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('active');
}

/** シンプルなトースト通知（実績解除・あいことば結果などに使用） */
export function showToast(message, opts={}){
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast-item' + (opts.variant ? ' toast-' + opts.variant : '');
  toast.innerHTML = `
    ${opts.title ? `<div class="toast-title">${escapeHtml(opts.title)}</div>` : ''}
    <div class="toast-body">${escapeHtml(message)}</div>
  `;
  container.appendChild(toast);
  requestAnimationFrame(()=> toast.classList.add('show'));
  setTimeout(()=>{
    toast.classList.remove('show');
    setTimeout(()=>toast.remove(), 400);
  }, opts.duration || 3200);
}

function getToastContainer(){
  let c = document.getElementById('toastContainer');
  if(!c){
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

export function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** タブ切替（管理画面などで使用） */
export function setupTabs(tabButtonSelector, panelAttr='data-tab'){
  const buttons = document.querySelectorAll(tabButtonSelector);
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.getAttribute(panelAttr);
      buttons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('[data-tab-panel]').forEach(p=>{
        p.style.display = (p.getAttribute('data-tab-panel') === target) ? '' : 'none';
      });
    });
  });
}

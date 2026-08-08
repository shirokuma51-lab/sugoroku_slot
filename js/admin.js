// ============================================================
// admin.js — 管理画面（admin.html専用）
//
// ・Firebase Authenticationのメール/パスワードでログイン
// ・ログイン後、Firestoreの admins/{uid} ドキュメントが存在するUIDのみ
//   管理画面を表示する（存在チェックはfirestore.rulesでも二重に保護すること）
// ・あいことば管理／ランキング閲覧／プレイヤー数・総プレイ数などの統計を表示
//
// 管理者を追加する方法：
//   Firebaseコンソール → Authentication でユーザーを作成し、
//   そのUIDをコピーして Firestore に admins/{そのUID} ドキュメントを作成する
//   （フィールドは空でも可）。
// ============================================================
import { auth, db, doc, getDoc } from './firebase.js';
import { adminSignIn, adminSignOut, watchAuth } from './auth.js';
import { subscribeRanking } from './ranking.js';
import { subscribeGlobalStats } from './statistics.js';
import {
  subscribePasswordList, createPassword, updatePassword, deletePassword,
} from './password.js';
import {
  subscribeShopCatalog, createShopItem, updateShopItem, deleteShopItem,
  seedDefaultShopItemsIfEmpty, CATEGORIES,
} from './shop.js';
import {
  subscribeMonsterCatalog, createMonster, updateMonster, deleteMonster,
  seedDefaultMonstersIfEmpty,
} from './monsters.js';
import { subscribeCharacterImages, updateCharacterImage } from './characters.js';
import { setupTabs, showToast, escapeHtml } from './ui.js';
import { getTitleName, subscribeTitles } from './title.js';

let unsubscribers = [];

function clearSubscriptions(){
  unsubscribers.forEach(u=>{ try{ u(); }catch(e){} });
  unsubscribers = [];
}

async function isAdmin(uid){
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

function showLoginView(message){
  document.getElementById('adminLoginView').style.display = '';
  document.getElementById('adminDashboardView').style.display = 'none';
  if(message) document.getElementById('adminLoginError').textContent = message;
}

function showDashboardView(){
  document.getElementById('adminLoginView').style.display = 'none';
  document.getElementById('adminDashboardView').style.display = '';
}

function wireLoginForm(){
  const form = document.getElementById('adminLoginForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPassword').value;
    document.getElementById('adminLoginError').textContent = '';
    try{
      await adminSignIn(email, pass);
      // watchAuth のコールバックで以降の処理を行う
    }catch(err){
      showLoginView('ログインに失敗しました: ' + err.message);
    }
  });
}

function wireLogout(){
  document.getElementById('adminLogoutBtn').addEventListener('click', async ()=>{
    clearSubscriptions();
    await adminSignOut();
  });
}

/* ============================================================
   ダッシュボード：統計
============================================================ */
function initStatsPanel(){
  const unsub = subscribeGlobalStats((stats)=>{
    document.getElementById('statPlayerCount').textContent = stats.playerCount ?? 0;
    document.getElementById('statTotalPlays').textContent = stats.totalPlays ?? 0;
    document.getElementById('statTotalSpins').textContent = stats.totalSpins ?? 0;
    document.getElementById('statBonusCount').textContent = stats.bonusCount ?? 0;
    document.getElementById('statSixCount').textContent = stats.sixCount ?? 0;
    document.getElementById('statTotalCoins').textContent = stats.totalCoinsEarned ?? 0;
  });
  unsubscribers.push(unsub);
}

/* ============================================================
   ダッシュボード：ランキング閲覧
============================================================ */
function initRankingPanel(){
  const unsub = subscribeRanking((list)=>{
    const container = document.getElementById('adminRankingList');
    container.innerHTML = list.map((p, idx)=>`
      <div class="ranking-row">
        <span class="rank-idx">${idx+1}</span>
        <span class="rank-title">${escapeHtml(getTitleName(p.currentTitle))}</span>
        <span class="rank-name">${escapeHtml(p.username || '')}</span>
        <span class="rank-score">${p.bestScore ?? 0}</span>
      </div>
    `).join('') || '<div class="ranking-empty">記録なし</div>';
    document.getElementById('statAchievedCount').textContent =
      list.reduce((sum,p)=> sum + ((p.achievements||[]).length), 0);
  });
  unsubscribers.push(unsub);
}

/* ============================================================
   ダッシュボード：あいことば管理
============================================================ */
function toDatetimeLocalValue(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initPasswordPanel(){
  const unsub = subscribePasswordList((list)=>{
    lastPasswordList = list;
    renderPasswordList(list);
  });
  unsubscribers.push(unsub);

  document.getElementById('pwAddBtn').addEventListener('click', ()=> openPasswordForm(null));
  document.getElementById('pwFormCancelBtn').addEventListener('click', closePasswordForm);
  document.getElementById('pwForm').addEventListener('submit', onPasswordFormSubmit);
}

let lastPasswordList = [];

function renderPasswordList(list){
  const container = document.getElementById('passwordList');
  container.innerHTML = list.map(p=>`
    <div class="password-row" data-id="${p.id}">
      <div class="password-row-main">
        <strong>${escapeHtml(p.code)}</strong>
        <span>+${p.coinAmount}コイン</span>
        ${p.titleReward ? `<span class="badge-active">🏅${escapeHtml(getTitleName(p.titleReward))}</span>` : ''}
        <span>${p.currentUses||0}/${p.maxUses||'∞'}回</span>
        <span class="${p.active ? 'badge-active':'badge-inactive'}">${p.active ? '有効':'無効'}</span>
      </div>
      <div class="password-row-actions">
        <button class="pw-edit-btn">編集</button>
        <button class="pw-delete-btn">削除</button>
      </div>
    </div>
  `).join('') || '<div class="ranking-empty">登録されたあいことばはありません</div>';

  container.querySelectorAll('.password-row').forEach(row=>{
    const id = row.dataset.id;
    const item = list.find(p=>p.id===id);
    row.querySelector('.pw-edit-btn').addEventListener('click', ()=> openPasswordForm(item));
    row.querySelector('.pw-delete-btn').addEventListener('click', async ()=>{
      if(!confirm(`「${item.code}」を削除しますか？`)) return;
      await deletePassword(id);
      showToast('削除しました');
    });
  });
}

let editingPasswordId = null;

function openPasswordForm(item){
  editingPasswordId = item ? item.id : null;
  document.getElementById('pwFormTitle').textContent = item ? 'あいことば編集' : 'あいことば追加';
  document.getElementById('pwCode').value = item ? item.code : '';
  document.getElementById('pwCoinAmount').value = item ? item.coinAmount : 100;
  document.getElementById('pwTitleName').value = item && item.titleReward ? getTitleName(item.titleReward) : '';
  document.getElementById('pwMaxUses').value = item ? (item.maxUses||0) : 0;
  document.getElementById('pwActive').checked = item ? !!item.active : true;
  document.getElementById('pwStartAt').value = item ? toDatetimeLocalValue(item.startAt) : '';
  document.getElementById('pwEndAt').value = item ? toDatetimeLocalValue(item.endAt) : '';
  document.getElementById('pwFormPanel').style.display = '';
}

function closePasswordForm(){
  document.getElementById('pwFormPanel').style.display = 'none';
  editingPasswordId = null;
}

async function onPasswordFormSubmit(e){
  e.preventDefault();
  const code = document.getElementById('pwCode').value;
  const coinAmount = document.getElementById('pwCoinAmount').value;
  const titleName = document.getElementById('pwTitleName').value;
  const maxUses = document.getElementById('pwMaxUses').value;
  const active = document.getElementById('pwActive').checked;
  const startVal = document.getElementById('pwStartAt').value;
  const endVal = document.getElementById('pwEndAt').value;

  const { Timestamp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const payload = {
    code, coinAmount, maxUses, active, titleName,
    startAt: startVal ? Timestamp.fromDate(new Date(startVal)) : null,
    endAt: endVal ? Timestamp.fromDate(new Date(endVal)) : null,
  };

  try{
    if(editingPasswordId){
      await updatePassword(editingPasswordId, payload);
      showToast('更新しました');
    } else {
      await createPassword(payload);
      showToast('追加しました');
    }
    closePasswordForm();
  }catch(err){
    showToast('保存に失敗しました: ' + err.message, { variant:'error' });
  }
}

/* ============================================================
   ダッシュボード：ショップ管理
   （価格・アイテム名・説明・持続スピン数・有効/無効・表示順を管理者が編集できる。
    「効果の種類」だけはゲームロジック側に実装済みの2種類から選ぶ形式。）
============================================================ */
let lastShopList = [];
let editingShopId = null;
let iconMode = 'emoji';       // 'emoji' | 'image'
let currentIconImageDataUrl = null; // 画像モード時に選択中のdataURL（未選択ならnull）
let multiplierMode = 'fixed'; // 'fixed' | 'random'

function initShopPanel(){
  const unsub = subscribeShopCatalog((list)=>{
    lastShopList = list;
    renderShopAdminList(list);
  });
  unsubscribers.push(unsub);

  document.getElementById('shopAddBtn').addEventListener('click', ()=> openShopForm(null));
  document.getElementById('shopFormCancelBtn').addEventListener('click', closeShopForm);
  document.getElementById('shopForm').addEventListener('submit', onShopFormSubmit);
  document.getElementById('shopCategory').addEventListener('change', updateCategoryFieldsVisibility);
  document.getElementById('multiplierModeFixedBtn').addEventListener('click', ()=> setMultiplierMode('fixed'));
  document.getElementById('multiplierModeRandomBtn').addEventListener('click', ()=> setMultiplierMode('random'));
  document.getElementById('shopSeedBtn').addEventListener('click', async ()=>{
    const created = await seedDefaultShopItemsIfEmpty();
    showToast(created ? '初期アイテムを追加しました' : 'すでにアイテムが登録されているためスキップしました');
  });

  initIconModeTabs();
  initIconDropzone();
}

/** アイテムの種類（スコア倍率/コイン倍率/ドクロよけ）に応じて、倍率欄・成功率欄の表示を切り替える。 */
function updateCategoryFieldsVisibility(){
  const category = document.getElementById('shopCategory').value;
  const usesMultiplier = CATEGORIES[category]?.usesMultiplier;
  document.getElementById('shopMultiplierGroup').style.display = usesMultiplier ? '' : 'none';
  document.getElementById('shopGuardChanceGroup').style.display = usesMultiplier ? 'none' : '';
  document.getElementById('spinsZeroHint').textContent = category === 'skullGuard'
    ? '0にすると：次にルーレットが1回発動した時点で消費・失効します。'
    : '0にすると：このゲーム中（リセットまで）ずっと有効になります。';
}

function setMultiplierMode(mode){
  multiplierMode = mode;
  document.getElementById('multiplierModeFixedBtn').classList.toggle('active', mode==='fixed');
  document.getElementById('multiplierModeRandomBtn').classList.toggle('active', mode==='random');
  document.getElementById('multiplierFixedPanel').style.display = mode==='fixed' ? '' : 'none';
  document.getElementById('multiplierRandomPanel').style.display = mode==='random' ? '' : 'none';
}

/* ---------- アイコン：絵文字/画像の切り替えタブ ---------- */
function initIconModeTabs(){
  const emojiBtn = document.getElementById('iconModeEmojiBtn');
  const imageBtn = document.getElementById('iconModeImageBtn');
  emojiBtn.addEventListener('click', ()=> setIconMode('emoji'));
  imageBtn.addEventListener('click', ()=> setIconMode('image'));
}

function setIconMode(mode){
  iconMode = mode;
  document.getElementById('iconModeEmojiBtn').classList.toggle('active', mode==='emoji');
  document.getElementById('iconModeImageBtn').classList.toggle('active', mode==='image');
  document.getElementById('iconEmojiPanel').style.display = mode==='emoji' ? '' : 'none';
  document.getElementById('iconImagePanel').style.display = mode==='image' ? '' : 'none';
}

/* ---------- アイコン：画像のドラッグ&ドロップ／ファイル選択 ---------- */
const ACCEPTED_ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ICON_MAX_DIM = 128; // 保存前に縮小する最大辺(px)。Firestoreドキュメントを軽量に保つため

function initIconDropzone(){
  const dropzone = document.getElementById('iconDropzone');
  const fileInput = document.getElementById('shopIconFile');

  // タップ/クリックでファイル選択ダイアログを開く（スマホでも写真選択ができる）
  dropzone.addEventListener('click', ()=> fileInput.click());

  fileInput.addEventListener('change', ()=>{
    if(fileInput.files && fileInput.files[0]) handleIconFile(fileInput.files[0]);
  });

  ['dragenter','dragover'].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave','drop'].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e)=>{
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) handleIconFile(file);
  });
}

function showIconImageError(msg){
  const errEl = document.getElementById('iconImageError');
  errEl.textContent = msg;
  errEl.style.display = msg ? '' : 'none';
}

function handleIconFile(file){
  showIconImageError('');
  if(!ACCEPTED_ICON_TYPES.includes(file.type)){
    showIconImageError('対応していないファイル形式です（PNG / JPG / WebPのみ）');
    return;
  }
  const reader = new FileReader();
  reader.onerror = ()=> showIconImageError('画像の読み込みに失敗しました');
  reader.onload = ()=>{
    resizeImageDataUrl(reader.result, ICON_MAX_DIM).then(dataUrl=>{
      currentIconImageDataUrl = dataUrl;
      const preview = document.getElementById('iconImagePreview');
      preview.src = dataUrl;
      preview.style.display = '';
      document.getElementById('iconDropzoneHint').style.display = 'none';
    }).catch(()=> showIconImageError('画像の処理に失敗しました'));
  };
  reader.readAsDataURL(file);
}

/** 画像を正方形の枠に収まるよう縮小し、JPEGのdataURLとして返す（Firestoreに軽量に保存するため）。 */
function resizeImageDataUrl(srcDataUrl, maxDim){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
}

function resetIconImagePanel(){
  currentIconImageDataUrl = null;
  const preview = document.getElementById('iconImagePreview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('iconDropzoneHint').style.display = '';
  document.getElementById('shopIconFile').value = '';
  showIconImageError('');
}

function renderShopAdminList(list){
  const container = document.getElementById('shopAdminList');
  container.innerHTML = list.map(item=>{
    const category = item.category || item.effectType;
    let detail = `${item.cost}コイン / 持続${item.spins}スピン`;
    if(category === 'skullGuard'){
      detail += item.guardChance!=null ? ` / 成功率${item.guardChance}%` : '';
    } else if(item.multiplierMode === 'random'){
      detail += ` / ${item.multiplierMin}〜${item.multiplierMax}倍(ランダム)`;
    } else {
      detail += ` / ${item.multiplier}倍`;
    }
    return `
    <div class="password-row" data-id="${item.id}">
      <div class="password-row-main">
        <strong>${item.iconType==='image' && item.iconImage ? `<img src="${item.iconImage}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;border-radius:4px;">` : escapeHtml(item.icon||'')} ${escapeHtml(item.name||'')}</strong>
        <span>${detail}</span>
        <span class="badge-active">${escapeHtml(CATEGORIES[category]?.label.split('（')[0] || category)}</span>
        <span class="${item.enabled ? 'badge-active':'badge-inactive'}">${item.enabled ? '有効':'無効'}</span>
      </div>
      <div class="password-row-actions">
        <button class="shop-edit-btn">編集</button>
        <button class="shop-delete-btn">削除</button>
      </div>
    </div>
  `;
  }).join('') || '<div class="ranking-empty">登録されたアイテムはありません</div>';

  container.querySelectorAll('.password-row').forEach(row=>{
    const id = row.dataset.id;
    const item = list.find(i=>i.id===id);
    row.querySelector('.shop-edit-btn').addEventListener('click', ()=> openShopForm(item));
    row.querySelector('.shop-delete-btn').addEventListener('click', async ()=>{
      if(!confirm(`「${item.name}」を削除しますか？`)) return;
      await deleteShopItem(id);
      showToast('削除しました');
    });
  });
}

function openShopForm(item){
  editingShopId = item ? item.id : null;
  const category = item ? (item.category || item.effectType) : 'scoreBoost';
  document.getElementById('shopFormTitle').textContent = item ? 'アイテム編集' : 'アイテム追加';
  document.getElementById('shopName').value = item ? item.name : '';
  document.getElementById('shopDesc').value = item ? item.desc : '';
  document.getElementById('shopCategory').value = category;
  document.getElementById('shopCost').value = item ? item.cost : 30;
  document.getElementById('shopSpins').value = item ? item.spins : 5;
  document.getElementById('shopGuardChance').value = item && item.guardChance != null ? item.guardChance : 70;
  document.getElementById('shopMultiplier').value = item && item.multiplier != null ? item.multiplier : 2.0;
  document.getElementById('shopMultiplierMin').value = item && item.multiplierMin != null ? item.multiplierMin : 1.5;
  document.getElementById('shopMultiplierMax').value = item && item.multiplierMax != null ? item.multiplierMax : 3.0;
  document.getElementById('shopOrder').value = item ? (item.order||0) : (lastShopList.length);
  document.getElementById('shopEnabled').checked = item ? !!item.enabled : true;

  setMultiplierMode(item && item.multiplierMode === 'random' ? 'random' : 'fixed');

  resetIconImagePanel();
  if(item && item.iconType === 'image' && item.iconImage){
    setIconMode('image');
    currentIconImageDataUrl = item.iconImage;
    const preview = document.getElementById('iconImagePreview');
    preview.src = item.iconImage;
    preview.style.display = '';
    document.getElementById('iconDropzoneHint').style.display = 'none';
  } else {
    setIconMode('emoji');
    document.getElementById('shopIcon').value = item ? (item.icon || '✨') : '✨';
  }

  document.getElementById('shopFormPanel').style.display = '';
  updateCategoryFieldsVisibility();
}

function closeShopForm(){
  document.getElementById('shopFormPanel').style.display = 'none';
  editingShopId = null;
  resetIconImagePanel();
}

async function onShopFormSubmit(e){
  e.preventDefault();

  if(iconMode === 'image' && !currentIconImageDataUrl){
    showIconImageError('画像を選択してください（またはタブを「絵文字」に切り替えてください）');
    return;
  }

  const category = document.getElementById('shopCategory').value;
  const payload = {
    name: document.getElementById('shopName').value,
    desc: document.getElementById('shopDesc').value,
    category,
    cost: document.getElementById('shopCost').value,
    spins: document.getElementById('shopSpins').value,
    guardChance: document.getElementById('shopGuardChance').value,
    multiplierMode,
    multiplier: document.getElementById('shopMultiplier').value,
    multiplierMin: document.getElementById('shopMultiplierMin').value,
    multiplierMax: document.getElementById('shopMultiplierMax').value,
    order: document.getElementById('shopOrder').value,
    enabled: document.getElementById('shopEnabled').checked,
    iconType: iconMode,
    icon: iconMode === 'emoji' ? document.getElementById('shopIcon').value : '',
    iconImage: iconMode === 'image' ? currentIconImageDataUrl : null,
  };

  try{
    if(editingShopId){
      await updateShopItem(editingShopId, payload);
      showToast('更新しました');
    } else {
      await createShopItem(payload);
      showToast('追加しました');
    }
    closeShopForm();
  }catch(err){
    showToast('保存に失敗しました: ' + err.message, { variant:'error' });
  }
}

/* ============================================================
   汎用：画像ドロップゾーン（モンスター画像・キャラクター画像で共用）
============================================================ */
function wireImageDropzone({ dropzoneId, fileInputId, onFile }){
  const dropzone = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(fileInputId);
  dropzone.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', ()=>{
    if(fileInput.files && fileInput.files[0]) onFile(fileInput.files[0]);
  });
  ['dragenter','dragover'].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', (e)=>{
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) onFile(file);
  });
}

function readAndResizeImage(file, maxDim, { onError } = {}){
  return new Promise((resolve)=>{
    if(!ACCEPTED_ICON_TYPES.includes(file.type)){
      if(onError) onError('対応していないファイル形式です（PNG / JPG / WebPのみ）');
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = ()=>{ if(onError) onError('画像の読み込みに失敗しました'); resolve(null); };
    reader.onload = ()=>{
      resizeImageDataUrl(reader.result, maxDim)
        .then(resolve)
        .catch(()=>{ if(onError) onError('画像の処理に失敗しました'); resolve(null); });
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ダッシュボード：モンスター管理
============================================================ */
let lastMonsterList = [];
let editingMonsterId = null;
let monsterIconMode = 'emoji'; // 'emoji' | 'image'
let currentMonsterIconImageDataUrl = null;
const MONSTER_ICON_MAX_DIM = 160;

function initMonsterPanel(){
  const unsub = subscribeMonsterCatalog((list)=>{
    lastMonsterList = list;
    renderMonsterAdminList(list);
  });
  unsubscribers.push(unsub);

  document.getElementById('monsterAddBtn').addEventListener('click', ()=> openMonsterForm(null));
  document.getElementById('monsterFormCancelBtn').addEventListener('click', closeMonsterForm);
  document.getElementById('monsterForm').addEventListener('submit', onMonsterFormSubmit);
  document.getElementById('monsterSeedBtn').addEventListener('click', async ()=>{
    const created = await seedDefaultMonstersIfEmpty();
    showToast(created ? '初期モンスターを追加しました' : 'すでにモンスターが登録されているためスキップしました');
  });

  document.getElementById('monsterIconModeEmojiBtn').addEventListener('click', ()=> setMonsterIconMode('emoji'));
  document.getElementById('monsterIconModeImageBtn').addEventListener('click', ()=> setMonsterIconMode('image'));

  wireImageDropzone({
    dropzoneId: 'monsterIconDropzone', fileInputId: 'monsterIconFile',
    onFile: async (file)=>{
      showMonsterIconError('');
      const dataUrl = await readAndResizeImage(file, MONSTER_ICON_MAX_DIM, { onError: showMonsterIconError });
      if(!dataUrl) return;
      currentMonsterIconImageDataUrl = dataUrl;
      const preview = document.getElementById('monsterIconImagePreview');
      preview.src = dataUrl;
      preview.style.display = '';
      document.getElementById('monsterIconDropzoneHint').style.display = 'none';
    },
  });
}

function setMonsterIconMode(mode){
  monsterIconMode = mode;
  document.getElementById('monsterIconModeEmojiBtn').classList.toggle('active', mode==='emoji');
  document.getElementById('monsterIconModeImageBtn').classList.toggle('active', mode==='image');
  document.getElementById('monsterIconEmojiPanel').style.display = mode==='emoji' ? '' : 'none';
  document.getElementById('monsterIconImagePanel').style.display = mode==='image' ? '' : 'none';
}

function showMonsterIconError(msg){
  const el = document.getElementById('monsterIconImageError');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

function resetMonsterIconImagePanel(){
  currentMonsterIconImageDataUrl = null;
  const preview = document.getElementById('monsterIconImagePreview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('monsterIconDropzoneHint').style.display = '';
  document.getElementById('monsterIconFile').value = '';
  showMonsterIconError('');
}

function renderMonsterAdminList(list){
  const container = document.getElementById('monsterAdminList');
  container.innerHTML = list.map(m=>{
    const iconHtml = m.iconType==='image' && m.iconImage
      ? `<img src="${m.iconImage}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;border-radius:4px;">`
      : escapeHtml(m.icon||'');
    return `
    <div class="password-row" data-id="${m.id}">
      <div class="password-row-main">
        <strong>${iconHtml} ${escapeHtml(m.name||'')}</strong>
        <span>HP${m.hp} / 討伐+${m.bonusMin}〜${m.bonusMax}コイン</span>
        <span class="${m.enabled ? 'badge-active':'badge-inactive'}">${m.enabled ? '有効':'無効'}</span>
      </div>
      <div class="password-row-actions">
        <button class="monster-edit-btn">編集</button>
        <button class="monster-delete-btn">削除</button>
      </div>
    </div>
  `;
  }).join('') || '<div class="ranking-empty">登録されたモンスターはありません</div>';

  container.querySelectorAll('.password-row').forEach(row=>{
    const id = row.dataset.id;
    const item = list.find(i=>i.id===id);
    row.querySelector('.monster-edit-btn').addEventListener('click', ()=> openMonsterForm(item));
    row.querySelector('.monster-delete-btn').addEventListener('click', async ()=>{
      if(!confirm(`「${item.name}」を削除しますか？`)) return;
      await deleteMonster(id);
      showToast('削除しました');
    });
  });
}

function openMonsterForm(item){
  editingMonsterId = item ? item.id : null;
  document.getElementById('monsterFormTitle').textContent = item ? 'モンスター編集' : 'モンスター追加';
  document.getElementById('monsterName').value = item ? item.name : '';
  document.getElementById('monsterDesc').value = item ? item.desc : '';
  document.getElementById('monsterHp').value = item ? item.hp : 50;
  document.getElementById('monsterBonusMin').value = item ? item.bonusMin : 20;
  document.getElementById('monsterBonusMax').value = item ? item.bonusMax : 40;
  document.getElementById('monsterHueRotate').value = item ? (item.hueRotate||0) : 0;
  document.getElementById('monsterOrder').value = item ? (item.order||0) : lastMonsterList.length;
  document.getElementById('monsterEnabled').checked = item ? !!item.enabled : true;

  resetMonsterIconImagePanel();
  if(item && item.iconType === 'image' && item.iconImage){
    setMonsterIconMode('image');
    currentMonsterIconImageDataUrl = item.iconImage;
    const preview = document.getElementById('monsterIconImagePreview');
    preview.src = item.iconImage;
    preview.style.display = '';
    document.getElementById('monsterIconDropzoneHint').style.display = 'none';
  } else {
    setMonsterIconMode('emoji');
    document.getElementById('monsterIcon').value = item ? (item.icon || '👾') : '👾';
  }

  document.getElementById('monsterFormPanel').style.display = '';
}

function closeMonsterForm(){
  document.getElementById('monsterFormPanel').style.display = 'none';
  editingMonsterId = null;
  resetMonsterIconImagePanel();
}

async function onMonsterFormSubmit(e){
  e.preventDefault();

  if(monsterIconMode === 'image' && !currentMonsterIconImageDataUrl){
    showMonsterIconError('画像を選択してください（または「絵文字」タブに切り替えてください）');
    return;
  }

  const payload = {
    name: document.getElementById('monsterName').value,
    desc: document.getElementById('monsterDesc').value,
    hp: document.getElementById('monsterHp').value,
    bonusMin: document.getElementById('monsterBonusMin').value,
    bonusMax: document.getElementById('monsterBonusMax').value,
    hueRotate: document.getElementById('monsterHueRotate').value,
    order: document.getElementById('monsterOrder').value,
    enabled: document.getElementById('monsterEnabled').checked,
    iconType: monsterIconMode,
    icon: monsterIconMode === 'emoji' ? document.getElementById('monsterIcon').value : '',
    iconImage: monsterIconMode === 'image' ? currentMonsterIconImageDataUrl : null,
  };

  try{
    if(editingMonsterId){
      await updateMonster(editingMonsterId, payload);
      showToast('更新しました');
    } else {
      await createMonster(payload);
      showToast('追加しました');
    }
    closeMonsterForm();
  }catch(err){
    showToast('保存に失敗しました: ' + err.message, { variant:'error' });
  }
}

/* ============================================================
   ダッシュボード：キャラクター画像管理
============================================================ */
const CHARACTER_IMAGE_MAX_DIM = 480;
let lastCharacterImages = { boyImage:null, girlImage:null };

function initCharacterPanel(){
  const unsub = subscribeCharacterImages((data)=>{
    lastCharacterImages = data;
    renderCharacterPreview('boy', data.boyImage);
    renderCharacterPreview('girl', data.girlImage);
  });
  unsubscribers.push(unsub);

  wireImageDropzone({
    dropzoneId: 'charBoyDropzone', fileInputId: 'charBoyFile',
    onFile: (file)=> handleCharacterFile('boy', file),
  });
  wireImageDropzone({
    dropzoneId: 'charGirlDropzone', fileInputId: 'charGirlFile',
    onFile: (file)=> handleCharacterFile('girl', file),
  });
  document.getElementById('charBoyResetBtn').addEventListener('click', async ()=>{
    await updateCharacterImage('boy', null);
    showToast('男の子キャラクターを標準画像に戻しました');
  });
  document.getElementById('charGirlResetBtn').addEventListener('click', async ()=>{
    await updateCharacterImage('girl', null);
    showToast('女の子キャラクターを標準画像に戻しました');
  });
}

function charErrorEl(key){ return document.getElementById(key==='boy' ? 'charBoyError' : 'charGirlError'); }

async function handleCharacterFile(key, file){
  const errEl = charErrorEl(key);
  errEl.style.display = 'none';
  const dataUrl = await readAndResizeImage(file, CHARACTER_IMAGE_MAX_DIM, {
    onError: (msg)=>{ errEl.textContent = msg; errEl.style.display = ''; },
  });
  if(!dataUrl) return;
  try{
    await updateCharacterImage(key, dataUrl);
    showToast((key==='boy' ? '男の子':'女の子') + 'キャラクターを更新しました');
  }catch(err){
    errEl.textContent = '保存に失敗しました: ' + err.message;
    errEl.style.display = '';
  }
}

function renderCharacterPreview(key, dataUrl){
  const preview = document.getElementById(key==='boy' ? 'charBoyPreview' : 'charGirlPreview');
  const hint = document.getElementById(key==='boy' ? 'charBoyDropzoneHint' : 'charGirlDropzoneHint');
  if(dataUrl){
    preview.src = dataUrl;
    preview.style.display = '';
    hint.style.display = 'none';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    hint.style.display = '';
  }
}

/* ============================================================ */
function initDashboard(){
  setupTabs('.admin-tab-btn');
  const titlesUnsub = subscribeTitles(()=>{
    if(lastPasswordList.length) renderPasswordList(lastPasswordList);
  });
  unsubscribers.push(titlesUnsub);
  initStatsPanel();
  initRankingPanel();
  initPasswordPanel();
  initShopPanel();
  initMonsterPanel();
  initCharacterPanel();
}

document.addEventListener('DOMContentLoaded', ()=>{
  wireLoginForm();
  wireLogout();

  watchAuth(async (user)=>{
    clearSubscriptions();
    if(!user || user.isAnonymous){
      showLoginView();
      return;
    }
    const admin = await isAdmin(user.uid);
    if(!admin){
      showLoginView('このアカウントには管理者権限がありません');
      await adminSignOut();
      return;
    }
    showDashboardView();
    initDashboard();
  });
});

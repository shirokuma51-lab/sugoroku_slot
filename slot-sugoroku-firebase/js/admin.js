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
  seedDefaultShopItemsIfEmpty, EFFECT_TYPES,
} from './shop.js';
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

function initShopPanel(){
  const unsub = subscribeShopCatalog((list)=>{
    lastShopList = list;
    renderShopAdminList(list);
  });
  unsubscribers.push(unsub);

  document.getElementById('shopAddBtn').addEventListener('click', ()=> openShopForm(null));
  document.getElementById('shopFormCancelBtn').addEventListener('click', closeShopForm);
  document.getElementById('shopForm').addEventListener('submit', onShopFormSubmit);
  document.getElementById('shopEffectType').addEventListener('change', updateGuardChanceVisibility);
  document.getElementById('shopSeedBtn').addEventListener('click', async ()=>{
    const created = await seedDefaultShopItemsIfEmpty();
    showToast(created ? '初期アイテムを追加しました' : 'すでにアイテムが登録されているためスキップしました');
  });
}

function updateGuardChanceVisibility(){
  const isSkullGuard = document.getElementById('shopEffectType').value === 'skullGuard';
  document.getElementById('shopGuardChanceGroup').style.display = isSkullGuard ? '' : 'none';
}

function renderShopAdminList(list){
  const container = document.getElementById('shopAdminList');
  container.innerHTML = list.map(item=>`
    <div class="password-row" data-id="${item.id}">
      <div class="password-row-main">
        <strong>${escapeHtml(item.icon||'')} ${escapeHtml(item.name||'')}</strong>
        <span>${item.cost}コイン / ${item.spins}スピン${item.effectType==='skullGuard' && item.guardChance!=null ? ` / 成功率${item.guardChance}%` : ''}</span>
        <span class="badge-active">${escapeHtml(EFFECT_TYPES[item.effectType]?.label.split('（')[0] || item.effectType)}</span>
        <span class="${item.enabled ? 'badge-active':'badge-inactive'}">${item.enabled ? '有効':'無効'}</span>
      </div>
      <div class="password-row-actions">
        <button class="shop-edit-btn">編集</button>
        <button class="shop-delete-btn">削除</button>
      </div>
    </div>
  `).join('') || '<div class="ranking-empty">登録されたアイテムはありません</div>';

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
  document.getElementById('shopFormTitle').textContent = item ? 'アイテム編集' : 'アイテム追加';
  document.getElementById('shopIcon').value = item ? item.icon : '✨';
  document.getElementById('shopName').value = item ? item.name : '';
  document.getElementById('shopDesc').value = item ? item.desc : '';
  document.getElementById('shopEffectType').value = item ? item.effectType : 'scoreBoost';
  document.getElementById('shopCost').value = item ? item.cost : 30;
  document.getElementById('shopSpins').value = item ? item.spins : 5;
  document.getElementById('shopGuardChance').value = item && item.guardChance != null ? item.guardChance : 70;
  document.getElementById('shopOrder').value = item ? (item.order||0) : (lastShopList.length);
  document.getElementById('shopEnabled').checked = item ? !!item.enabled : true;
  document.getElementById('shopFormPanel').style.display = '';
  updateGuardChanceVisibility();
}

function closeShopForm(){
  document.getElementById('shopFormPanel').style.display = 'none';
  editingShopId = null;
}

async function onShopFormSubmit(e){
  e.preventDefault();
  const payload = {
    icon: document.getElementById('shopIcon').value,
    name: document.getElementById('shopName').value,
    desc: document.getElementById('shopDesc').value,
    effectType: document.getElementById('shopEffectType').value,
    cost: document.getElementById('shopCost').value,
    spins: document.getElementById('shopSpins').value,
    guardChance: document.getElementById('shopGuardChance').value,
    order: document.getElementById('shopOrder').value,
    enabled: document.getElementById('shopEnabled').checked,
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

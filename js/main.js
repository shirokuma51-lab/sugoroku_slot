// ============================================================
// main.js — アプリのエントリーポイント
// 各モジュールを組み立てるだけの「配線役」。ロジック本体は各モジュールに委譲する。
// ============================================================
import { ensurePlayerAuth } from './auth.js';
import {
  ensureProfile, subscribeProfile, updateUsername, updateCurrentTitle,
  updateBestScoreIfHigher, claimPendingCoins, USERNAME_MAX_LENGTH,
} from './profile.js';
import { TITLES, subscribeTitles, getTitleListForDisplay, getTitleName } from './title.js';
import { ACHIEVEMENTS, checkAndUnlockAchievements } from './achievement.js';
import { subscribeRanking, subscribeTopScore } from './ranking.js';
import { redeemPassword } from './password.js';
import {
  ensureGlobalStats, recordNewPlayer, recordPlayStart, recordSpinResult,
} from './statistics.js';
import { Game } from './game.js';
import { openModal, closeModal, showToast, escapeHtml } from './ui.js';
import { showAchievementEffect } from './effects.js';
import { Sound } from './sound.js';

let currentUid = null;
let currentProfile = null;
let lastTopPlayer = null;
let lastRankingList = null;

/* ============================================================
   起動シーケンス
============================================================ */
async function bootstrap(){
  await ensureGlobalStats();

  const user = await ensurePlayerAuth();
  currentUid = user.uid;

  const { data, isNew } = await ensureProfile(currentUid);
  currentProfile = data;
  if(isNew) await recordNewPlayer();
  await recordPlayStart(currentUid);

  wireHud();
  wireProfileModal();
  wireRankingModal();
  wireAikotobaModal();
  wireResetButton();

  Game.init({
    onScoreChange: onGameScoreChange,
    onSpinResolved: onGameSpinResolved,
    onGameOver(){ /* 現状追加処理なし（拡張ポイント） */ },
    onReset(){ recordPlayStart(currentUid); },
  });
  gameReady = true;

  // あいことば由来の称号(titles/{id})を含む「称号名の解決」を常に最新に保つ。
  // 更新が来るたびに、称号名を表示している箇所を再描画する。
  subscribeTitles(()=>{
    renderBestScoreBar(lastTopPlayer);
    if(lastRankingList) renderRankingList(lastRankingList);
    refreshProfileModalIfOpen();
  });

  subscribeProfile(currentUid, onProfileSnapshot);
  subscribeTopScore((topPlayer)=>{ lastTopPlayer = topPlayer; renderBestScoreBar(topPlayer); });

  // 別ページ（あいことば専用リンク等）で獲得済みだった未受取コインがあれば、
  // ゲーム画面を開いたこのタイミングで回収する。
  await claimAndApplyPendingCoins();
}

/* ============================================================
   未受取コイン（別ページで引き換えたあいことば分など）の回収
============================================================ */
let gameReady = false;
let claimInFlight = false;

async function claimAndApplyPendingCoins(){
  if(!gameReady || claimInFlight) return;
  claimInFlight = true;
  try{
    const amount = await claimPendingCoins(currentUid);
    if(amount > 0){
      Game.addCoins(amount);
      Sound.passwordSuccess();
      showToast(`あいことばで獲得した ${amount}コイン を受け取りました！`, { title:'コイン受取', variant:'success' });
    }
  }catch(e){
    console.error('[pendingCoins] claim failed', e);
  }finally{
    claimInFlight = false;
  }
}

/* ============================================================
   ゲームイベント → Firestore反映
============================================================ */
async function onGameScoreChange(score){
  const updated = await updateBestScoreIfHigher(currentUid, score);
  if(updated){
    // ranking/bestscoreはリアルタイム監視で自動反映されるので追加処理不要
  }
}

async function onGameSpinResolved(result){
  try{
    // stats更新はここでFirestoreへ書き込むのみ。実績チェックはプロフィールの
    // リアルタイム監視(onProfileSnapshot)側で行うことで、余計な読み取りを増やさない。
    await recordSpinResult(currentUid, result);
  }catch(e){
    console.error('[statistics] update failed', e);
  }
}

let achievementCheckInFlight = false;
async function onProfileSnapshot(profile){
  currentProfile = profile;
  refreshProfileModalIfOpen();

  // 別タブ/別ページでの引き換え等、ゲーム起動中にpendingCoinsが増えた場合も回収する
  if(profile.pendingCoins > 0) claimAndApplyPendingCoins();

  if(achievementCheckInFlight) return;
  achievementCheckInFlight = true;
  try{
    await checkAndUnlockAchievements(currentUid, profile.stats || {}, profile.achievements || [], (achievement)=>{
      Sound.achievementUnlock();
      showAchievementEffect();
      showToast(achievement.name + (achievement.titleReward ? `（称号「${getTitleName(achievement.titleReward)}」を獲得）` : ''), {
        title: 'Achievement Unlock!!',
        variant: 'achievement',
        duration: 4200,
      });
    });
  }catch(e){
    console.error('[achievement] check failed', e);
  }finally{
    achievementCheckInFlight = false;
  }
}

/* ============================================================
   HUD（BEST SCORE バー）
============================================================ */
function wireHud(){
  renderBestScoreBar(null);
}

function renderBestScoreBar(topPlayer){
  const bar = document.getElementById('bestScoreBar');
  if(!bar) return;
  if(!topPlayer){
    bar.innerHTML = `<span class="best-score-label">BEST SCORE</span><span class="best-score-empty">記録なし</span>`;
    return;
  }
  bar.innerHTML = `
    <span class="best-score-label">BEST SCORE</span>
    <span class="best-score-title">${escapeHtml(getTitleName(topPlayer.currentTitle))}</span>
    <span class="best-score-name">${escapeHtml(topPlayer.username)}</span>
    <span class="best-score-value">${topPlayer.bestScore ?? 0}</span>
  `;
}

/* ============================================================
   プロフィール画面
============================================================ */
function wireProfileModal(){
  const openBtn = document.getElementById('profileBtn');
  const closeBtn = document.getElementById('profileCloseBtn');
  const saveBtn = document.getElementById('profileSaveBtn');
  const aikotobaBtn = document.getElementById('profileAikotobaBtn');
  if(openBtn) openBtn.addEventListener('click', ()=>{ Sound.click(); renderProfileModal(); openModal('profileModal'); });
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ Sound.click(); closeModal('profileModal'); });
  if(saveBtn) saveBtn.addEventListener('click', onProfileSave);
  if(aikotobaBtn) aikotobaBtn.addEventListener('click', ()=>{
    Sound.click();
    closeModal('profileModal');
    openModal('aikotobaModal');
  });
}

function refreshProfileModalIfOpen(){
  const modal = document.getElementById('profileModal');
  if(modal && modal.classList.contains('active')) renderProfileModal();
}

function renderProfileModal(){
  if(!currentProfile) return;
  const nameInput = document.getElementById('profileNameInput');
  if(nameInput && document.activeElement !== nameInput){
    nameInput.value = currentProfile.username || '';
    nameInput.maxLength = USERNAME_MAX_LENGTH;
  }

  const titleList = document.getElementById('profileTitleList');
  if(titleList){
    const unlocked = currentProfile.unlockedTitles || ['none'];
    const items = getTitleListForDisplay(unlocked);
    titleList.innerHTML = items.map(t=>`
      <button class="title-option ${t.id===currentProfile.currentTitle ? 'selected':''} ${!t.unlocked ? 'locked':''}"
              data-title-id="${t.id}" ${!t.unlocked ? 'disabled':''}>
        ${escapeHtml(t.name)}
      </button>
    `).join('');
    titleList.querySelectorAll('.title-option:not(.locked)').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        Sound.click();
        try{
          await updateCurrentTitle(currentUid, btn.dataset.titleId, currentProfile.unlockedTitles || ['none']);
        }catch(e){ showToast(e.message, { variant:'error' }); }
      });
    });
  }

  const achList = document.getElementById('profileAchievementList');
  if(achList){
    const unlockedIds = currentProfile.achievements || [];
    achList.innerHTML = ACHIEVEMENTS.map(a=>`
      <li class="${unlockedIds.includes(a.id) ? 'ach-unlocked':'ach-locked'}">
        ${unlockedIds.includes(a.id) ? escapeHtml(a.name) : '？？？'}
      </li>
    `).join('');
  }
}

async function onProfileSave(){
  const nameInput = document.getElementById('profileNameInput');
  if(!nameInput) return;
  try{
    await updateUsername(currentUid, nameInput.value);
    Sound.click();
    showToast('プロフィールを更新しました');
  }catch(e){
    showToast(e.message, { variant:'error' });
  }
}

/* ============================================================
   ランキング画面
============================================================ */
let rankingUnsub = null;

function wireRankingModal(){
  const openBtn = document.getElementById('rankingBtn');
  const closeBtn = document.getElementById('rankingCloseBtn');
  if(openBtn) openBtn.addEventListener('click', ()=>{
    Sound.click();
    openModal('rankingModal');
    if(!rankingUnsub) rankingUnsub = subscribeRanking((list)=>{ lastRankingList = list; renderRankingList(list); });
  });
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ Sound.click(); closeModal('rankingModal'); });
}

function renderRankingList(list){
  const container = document.getElementById('rankingList');
  if(!container) return;
  container.innerHTML = list.map((p, idx)=>{
    const isMe = p.uid === currentUid;
    const updatedAt = p.bestScoreUpdatedAt && p.bestScoreUpdatedAt.toDate
      ? p.bestScoreUpdatedAt.toDate().toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
      : '-';
    return `
      <div class="ranking-row ${isMe ? 'is-me':''}">
        <span class="rank-idx">${idx+1}</span>
        <span class="rank-title">${escapeHtml(getTitleName(p.currentTitle))}</span>
        <span class="rank-name">${escapeHtml(p.username || '')}</span>
        <span class="rank-score">${p.bestScore ?? 0}</span>
        <span class="rank-updated">${updatedAt}</span>
      </div>
    `;
  }).join('') || '<div class="ranking-empty">まだ記録がありません</div>';
}

/* ============================================================
   あいことば（ゲーム画面内のモーダルから入力）
============================================================ */
function wireAikotobaModal(){
  const closeBtn = document.getElementById('aikotobaCloseBtn');
  const submitBtn = document.getElementById('aikotobaSubmitBtn');
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ Sound.click(); closeModal('aikotobaModal'); });
  if(submitBtn) submitBtn.addEventListener('click', onAikotobaSubmit);
}

async function onAikotobaSubmit(){
  const input = document.getElementById('aikotobaInput');
  if(!input) return;
  const result = await redeemPassword(currentUid, input.value);
  if(result.success){
    Sound.passwordSuccess();
    input.value = '';
    closeModal('aikotobaModal');
    // 「◯◯コインを受け取りました」の通知は、直後に発火する pendingCoins の
    // 自動回収(claimAndApplyPendingCoins)側で1回だけ表示する（ここでは重複させない）。
    if(result.titleId){
      showToast(`称号「${getTitleName(result.titleId)}」を獲得しました！`, { title:'新しい称号！', variant:'achievement', duration:4200 });
    }
  } else {
    Sound.passwordFail();
    showToast(result.message, { variant:'error' });
  }
}

/* ============================================================
   リセット（既存仕様：確認ダイアログ→初期化）
============================================================ */
function wireResetButton(){
  const btn = document.getElementById('resetBtn');
  const btnGO = document.getElementById('resetBtnGO');
  const handler = ()=>{
    const ok = window.confirm('ゲームをリセットしますか？');
    if(!ok) return;
    Game.reset();
  };
  if(btn) btn.addEventListener('click', handler);
  if(btnGO) btnGO.addEventListener('click', handler);
}

/* ============================================================ */
document.addEventListener('DOMContentLoaded', ()=>{
  bootstrap().catch(err=>{
    console.error('起動に失敗しました', err);
    showToast('起動に失敗しました。通信環境をご確認ください。', { variant:'error', duration:6000 });
  });
});

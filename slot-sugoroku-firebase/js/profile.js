// ============================================================
// profile.js — プレイヤープロフィール (Firestore: players/{uid})
//
// 保存内容：
//   uid, username, currentTitle, unlockedTitles[], createdAt, lastLogin,
//   bestScore, bestScoreUpdatedAt,
//   achievements[]（実績ID配列）,
//   usedPasswords[]（あいことば重複使用防止）,
//   stats { totalPlays, totalSpins, bonusCount, sixCount, totalCoinsEarned }
//
// ランキングは本コレクションを直接クエリして表示する設計（ranking.js参照）。
// → ユーザーネーム/称号を変更すれば自動的にランキング表示にも反映される。
// ============================================================
import {
  db, doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, arrayUnion, runTransaction,
} from './firebase.js';

export const USERNAME_MAX_LENGTH = 12;
export const DEFAULT_TITLE = 'none';

function playerRef(uid){
  return doc(db, 'players', uid);
}

function randomDefaultName(){
  return 'プレイヤー' + Math.floor(1000 + Math.random()*9000);
}

/**
 * 初回のみプロフィールを作成。既存なら lastLogin のみ更新して返す。
 * @returns {Promise<{data:object, isNew:boolean}>}
 */
export async function ensureProfile(uid){
  const ref = playerRef(uid);
  const snap = await getDoc(ref);

  if(!snap.exists()){
    const initial = {
      uid,
      username: randomDefaultName(),
      currentTitle: DEFAULT_TITLE,
      unlockedTitles: [DEFAULT_TITLE],
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      bestScore: 0,
      bestScoreUpdatedAt: serverTimestamp(),
      achievements: [],
      usedPasswords: [],
      pendingCoins: 0, // 別ページ(あいことば等)で獲得し、まだゲーム画面で受け取っていないコイン
      stats: {
        totalPlays: 0,
        totalSpins: 0,
        bonusCount: 0,
        sixCount: 0,
        totalCoinsEarned: 0,
      },
    };
    await setDoc(ref, initial);
    return { data: initial, isNew: true };
  } else {
    await updateDoc(ref, { lastLogin: serverTimestamp() });
    return { data: snap.data(), isNew: false };
  }
}

export async function getProfile(uid){
  const snap = await getDoc(playerRef(uid));
  return snap.exists() ? snap.data() : null;
}

/** プロフィールをリアルタイム監視（自分のプロフィール画面用） */
export function subscribeProfile(uid, callback){
  return onSnapshot(playerRef(uid), (snap)=>{
    if(snap.exists()) callback(snap.data());
  });
}

/** ユーザーネーム変更（12文字以内・何度でも変更可） */
export async function updateUsername(uid, newName){
  const trimmed = (newName || '').trim();
  if(trimmed.length === 0) throw new Error('ユーザーネームを入力してください');
  if(trimmed.length > USERNAME_MAX_LENGTH) throw new Error(`ユーザーネームは${USERNAME_MAX_LENGTH}文字以内にしてください`);
  await updateDoc(playerRef(uid), { username: trimmed });
  return trimmed;
}

/** 称号変更（解除済みの称号のみ選択可） */
export async function updateCurrentTitle(uid, titleId, unlockedTitles){
  if(!unlockedTitles.includes(titleId)){
    throw new Error('この称号はまだ解除されていません');
  }
  await updateDoc(playerRef(uid), { currentTitle: titleId });
}

/** 称号を新たに解除（実績解除時に呼ばれる） */
export async function unlockTitle(uid, titleId){
  await updateDoc(playerRef(uid), { unlockedTitles: arrayUnion(titleId) });
}

/**
 * 未受取コイン(pendingCoins)を原子的に回収する。
 * 別ページ（あいことば専用リンク等）で加算された分を、ゲーム画面側で受け取る際に使う。
 * トランザクションで「読み取った値を0にリセット」まで行うため、
 * 同時に複数タブを開いていても二重受け取りにならない。
 * @returns {Promise<number>} 受け取ったコイン数（0の場合は受け取るものが無かった）
 */
export async function claimPendingCoins(uid){
  const ref = playerRef(uid);
  return runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if(!snap.exists()) return 0;
    const amount = snap.data().pendingCoins || 0;
    if(amount <= 0) return 0;
    tx.update(ref, { pendingCoins: 0 });
    return amount;
  });
}

/** ベストスコア更新（現在値を上回った場合のみ） */
export async function updateBestScoreIfHigher(uid, score){
  const ref = playerRef(uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().bestScore || 0) : 0;
  if(score > current){
    await updateDoc(ref, { bestScore: score, bestScoreUpdatedAt: serverTimestamp() });
    return true;
  }
  return false;
}

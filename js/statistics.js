// ============================================================
// statistics.js — 統計（プレイヤー個別 stats ＋ グローバル statistics/global）
//
// パフォーマンス方針：
//   スピン1回ごとに複数回Firestoreへ書き込むと通信量が増えるため、
//   「1スピンの結果」をまとめて1回のupdateDocでプレイヤー側に反映し、
//   同時にグローバル統計へもう1回のupdateDocで反映する（=1スピンにつき最大2書き込み）。
// ============================================================
import {
  db, doc, updateDoc, increment, getDoc, setDoc, onSnapshot,
} from './firebase.js';

const GLOBAL_STATS_REF = () => doc(db, 'statistics', 'global');

/** グローバル統計ドキュメントが無ければ初期化 */
export async function ensureGlobalStats(){
  const ref = GLOBAL_STATS_REF();
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      totalPlays: 0,
      totalSpins: 0,
      bonusCount: 0,
      sixCount: 0,
      totalCoinsEarned: 0,
      playerCount: 0,
    });
  }
}

/** 新規プレイヤー作成時に呼ぶ（playerCountを1増やす） */
export async function recordNewPlayer(){
  await updateDoc(GLOBAL_STATS_REF(), { playerCount: increment(1) });
}

/** 1プレイ開始（ゲーム読み込み時／リセット時）に呼ぶ */
export async function recordPlayStart(uid){
  await Promise.all([
    updateDoc(doc(db, 'players', uid), { 'stats.totalPlays': increment(1) }),
    updateDoc(GLOBAL_STATS_REF(), { totalPlays: increment(1) }),
  ]);
}

/**
 * 1回のスピン解決結果をまとめて記録する。
 * @param {string} uid
 * @param {{isMatch:boolean, steps:number, coinsEarned:number}} result
 */
export async function recordSpinResult(uid, result){
  const isBonusTile = result.tileType === 'bonus10';
  const isSix = result.isMatch && result.steps === 6;

  const playerUpdate = {
    'stats.totalSpins': increment(1),
  };
  if(result.coinsEarned && result.coinsEarned > 0){
    playerUpdate['stats.totalCoinsEarned'] = increment(result.coinsEarned);
  }
  if(isBonusTile){
    playerUpdate['stats.bonusCount'] = increment(1);
  }
  if(isSix){
    playerUpdate['stats.sixCount'] = increment(1);
  }

  const globalUpdate = { totalSpins: increment(1) };
  if(result.coinsEarned && result.coinsEarned > 0){
    globalUpdate.totalCoinsEarned = increment(result.coinsEarned);
  }
  if(isBonusTile) globalUpdate.bonusCount = increment(1);
  if(isSix) globalUpdate.sixCount = increment(1);

  await Promise.all([
    updateDoc(doc(db, 'players', uid), playerUpdate),
    updateDoc(GLOBAL_STATS_REF(), globalUpdate),
  ]);
}

/** 管理画面用：グローバル統計をリアルタイム監視 */
export function subscribeGlobalStats(callback){
  return onSnapshot(GLOBAL_STATS_REF(), (snap)=>{
    if(snap.exists()) callback(snap.data());
  });
}

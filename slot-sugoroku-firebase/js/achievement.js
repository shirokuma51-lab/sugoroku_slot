// ============================================================
// achievement.js — 実績の定義と解除判定
//
// 実績「定義」はコード側の静的データ（条件ロジックが伴うためFirestoreでの
// 動的編集はスコープ外とした／詳細は導入時の説明を参照）。
// 実績の「解除状況」は Firestore の players/{uid}.achievements に保存する。
//
// 【拡張方法】新しい実績を増やす場合：
//   ACHIEVEMENTS配列に { id, name, statKey, threshold, titleReward } を追加するだけ。
//   statKeyは stats オブジェクトのキー（totalPlays / totalSpins / bonusCount /
//   sixCount / totalCoinsEarned）のいずれか。
// ============================================================
import { db, doc, updateDoc, arrayUnion } from './firebase.js';
import { unlockTitle } from './profile.js';

export const ACHIEVEMENTS = [
  { id:'first_play',  name:'初プレイ',        statKey:'totalPlays',       threshold:1,    titleReward:'beginner' },
  { id:'coin_100',     name:'100コイン獲得',   statKey:'totalCoinsEarned', threshold:100,  titleReward:'adventurer' },
  { id:'coin_500',     name:'500コイン獲得',   statKey:'totalCoinsEarned', threshold:500,  titleReward:'lucky_cat' },
  { id:'coin_1000',    name:'1000コイン獲得',  statKey:'totalCoinsEarned', threshold:1000, titleReward:'lucky_master' },
  { id:'bonus_5',      name:'BONUS5回',        statKey:'bonusCount',       threshold:5,    titleReward:'bonus_king' },
  { id:'bonus_20',     name:'BONUS20回',       statKey:'bonusCount',       threshold:20,   titleReward:'slot_master' },
  { id:'six_5',        name:'666を5回',        statKey:'sixCount',         threshold:5,    titleReward:'legend' },
  { id:'six_20',       name:'666を20回',       statKey:'sixCount',         threshold:20,   titleReward:'god' },
  { id:'spin_100',     name:'100スピン',       statKey:'totalSpins',       threshold:100,  titleReward:null },
  { id:'spin_500',     name:'500スピン',       statKey:'totalSpins',       threshold:500,  titleReward:null },
  { id:'spin_1000',    name:'1000スピン',      statKey:'totalSpins',       threshold:1000, titleReward:null },
];

/**
 * 現在のstatsと解除済みachievementsを見て、新たに条件を満たしたものを解除する。
 * @param {string} uid
 * @param {object} stats 最新のstatsオブジェクト
 * @param {string[]} unlockedAchievements 現在解除済みのID配列
 * @param {(a:object)=>void} onUnlock 新規解除ごとに呼ばれるコールバック（トースト表示用）
 */
export async function checkAndUnlockAchievements(uid, stats, unlockedAchievements, onUnlock){
  const newlyUnlocked = ACHIEVEMENTS.filter(a=>{
    if(unlockedAchievements.includes(a.id)) return false;
    const value = stats[a.statKey] || 0;
    return value >= a.threshold;
  });

  if(newlyUnlocked.length === 0) return [];

  const ref = doc(db, 'players', uid);
  await updateDoc(ref, {
    achievements: arrayUnion(...newlyUnlocked.map(a=>a.id)),
  });

  for(const a of newlyUnlocked){
    if(a.titleReward){
      await unlockTitle(uid, a.titleReward);
    }
    if(onUnlock) onUnlock(a);
  }
  return newlyUnlocked;
}

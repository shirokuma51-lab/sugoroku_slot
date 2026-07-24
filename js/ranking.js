// ============================================================
// ranking.js — ランキング（players コレクションを直接参照）
//
// 仕様上「ランキングはプロフィール情報を参照する」ため、専用コレクションは
// 持たず players を bestScore 降順でクエリするだけにしている。
// → ユーザーネーム/称号を変更すれば、次のスナップショットで自動的に
//    ランキング表示にも反映される（別コレクションへの同期処理が不要になり、
//    データの二重管理・不整合を避けられる）。
// ============================================================
import { db, collection, query, orderBy, limit, onSnapshot } from './firebase.js';

const RANKING_LIMIT = 50;

/**
 * ランキングをリアルタイム監視する。
 * @param {(list: Array<object>) => void} callback bestScore降順の配列
 */
export function subscribeRanking(callback){
  const q = query(collection(db, 'players'), orderBy('bestScore', 'desc'), limit(RANKING_LIMIT));
  return onSnapshot(q, (snap)=>{
    const list = [];
    snap.forEach(docSnap=>{
      list.push({ uid: docSnap.id, ...docSnap.data() });
    });
    callback(list);
  });
}

/** 画面上部の BEST SCORE 表示用：1位のみ監視 */
export function subscribeTopScore(callback){
  const q = query(collection(db, 'players'), orderBy('bestScore', 'desc'), limit(1));
  return onSnapshot(q, (snap)=>{
    if(snap.empty){ callback(null); return; }
    const docSnap = snap.docs[0];
    callback({ uid: docSnap.id, ...docSnap.data() });
  });
}

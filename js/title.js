// ============================================================
// title.js — 称号の定義
//
// 称号には2種類の由来がある：
//   1. 実績由来（静的）… achievement.js の ACHIEVEMENTS 配列から titleReward として
//      参照される。id/nameの対応表は下の TITLES 配列にハードコードしている。
//   2. あいことば由来（動的）… 管理者がadmin.htmlで「称号名」を設定してあいことばを
//      作成すると、Firestoreの titles/{id} コレクションに自動生成される
//      （password.js参照）。アプリ起動時に subscribeTitles() でリアルタイム購読し、
//      静的なTITLESとマージして扱う。
//
// 【拡張方法】実績由来の称号を増やしたい場合：
//   1. ここに { id, name } を追加
//   2. achievement.js の該当実績に titleReward: '<id>' を設定
// あいことば由来の称号は、admin.htmlから称号名を入力するだけで自動的に増える。
// ============================================================
import { db, collection, onSnapshot } from './firebase.js';

export const TITLES = [
  { id: 'none',        name: '称号なし' },
  { id: 'beginner',     name: '初心者' },
  { id: 'adventurer',   name: '冒険者' },
  { id: 'lucky_cat',    name: '幸運の猫' },
  { id: 'lucky_master', name: 'ラッキーマスター' },
  { id: 'bonus_king',   name: 'ボーナス王' },
  { id: 'slot_master',  name: 'スロット名人' },
  { id: 'legend',       name: '伝説の冒険者' },
  { id: 'god',          name: '神' },
];

const TITLE_MAP = Object.fromEntries(TITLES.map(t=>[t.id, t.name]));

// Firestoreから読み込んだ動的な称号（あいことば由来）のキャッシュ
let dynamicTitles = {}; // { [titleId]: name }

/** Firestoreの titles コレクションをリアルタイム購読し、動的称号キャッシュを常に最新に保つ */
export function subscribeTitles(callback){
  return onSnapshot(collection(db, 'titles'), (snap)=>{
    const list = [];
    const map = {};
    snap.forEach(d=>{
      const data = d.data();
      list.push({ id: d.id, name: data.name });
      map[d.id] = data.name;
    });
    dynamicTitles = map;
    if(callback) callback(list);
  });
}

function dynamicTitleList(){
  return Object.entries(dynamicTitles).map(([id, name])=>({ id, name }));
}

export function getTitleName(id){
  if(TITLE_MAP[id]) return TITLE_MAP[id];
  if(dynamicTitles[id]) return dynamicTitles[id];
  return '称号なし';
}

/** プロフィール編集画面用：解除状況込みの一覧を返す（未解除は？？？表示） */
export function getTitleListForDisplay(unlockedTitles){
  const all = [...TITLES, ...dynamicTitleList()];
  return all.map(t=>({
    id: t.id,
    name: (t.id === 'none' || unlockedTitles.includes(t.id)) ? t.name : '？？？',
    unlocked: t.id === 'none' || unlockedTitles.includes(t.id),
  }));
}

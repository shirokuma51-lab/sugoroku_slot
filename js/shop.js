// ============================================================
// shop.js — ショップアイテム（管理者が価格変更・追加できる）
//
// Firestore構成:
//   shopItems/{itemId}
//     name        : string   （表示名。例：「スコア2倍チケット」）
//     desc        : string   （説明文。例：「次の5回のスピンで獲得スコアが2倍になる」）
//     iconType    : 'emoji' | 'image'
//     icon        : string   （iconType==='emoji'の時に使う絵文字1つ。例：「✨」）
//     iconImage   : string|null （iconType==='image'の時に使うdataURL。管理画面で
//                                 ドラッグ&ドロップ/ファイル選択した画像を縮小・base64化したもの）
//     cost        : number   （購入に必要なコイン数）
//     spins       : number   （効果が持続するスピン回数）
//     effectType  : 'scoreBoost' | 'skullGuard'
//         ※効果の"種類"自体はゲームロジック側に実装済みの2種類から選ぶ形。
//           管理者が自由に変更・追加できるのは「名前・説明・アイコン・価格・持続スピン数・有効/無効」。
//     enabled     : boolean  （trueのものだけプレイヤー側ショップに表示される）
//     order       : number   （表示順。小さい順）
//
// プレイヤーの「購入済み・残り効果」自体はこれまで通りブラウザ内メモリのみで保持し
// Firestoreには保存しない（game.js の state.shop を参照）。
// ============================================================
import {
  db, doc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, orderBy, onSnapshot,
} from './firebase.js';

export const EFFECT_TYPES = {
  scoreBoost: { label: 'スコア2倍（指定スピン数の間、獲得スコアが2倍）' },
  skullGuard: { label: 'ドクロよけ（指定スピン数の間、指定確率で💀を防ぐ）' },
};

/** ショップアイテム一覧をリアルタイム購読する（enabled/disabled問わず全件・order昇順）。 */
export function subscribeShopCatalog(callback){
  const q = query(collection(db, 'shopItems'), orderBy('order', 'asc'));
  return onSnapshot(q, (snap)=>{
    const list = [];
    snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
    callback(list);
  });
}

export async function createShopItem(data){
  const iconType = data.iconType === 'image' ? 'image' : 'emoji';
  const docRef = await addDoc(collection(db, 'shopItems'), {
    name: data.name || '',
    desc: data.desc || '',
    iconType,
    icon: iconType === 'emoji' ? (data.icon || '🎁') : '',
    iconImage: iconType === 'image' ? (data.iconImage || null) : null,
    cost: Number(data.cost) || 0,
    spins: Number(data.spins) || 1,
    effectType: data.effectType,
    // guardChance: ドクロよけ(skullGuard)の成功率(%)。0〜100。100なら演出なしで確定ガード。
    // scoreBoost等、確率が関係ないアイテムでは無視される（nullのままでよい）。
    guardChance: data.effectType === 'skullGuard' ? Number(data.guardChance ?? 70) : null,
    enabled: !!data.enabled,
    order: Number(data.order) || 0,
  });
  return docRef.id;
}

export async function updateShopItem(id, data){
  const payload = { ...data };
  if(payload.cost !== undefined) payload.cost = Number(payload.cost);
  if(payload.spins !== undefined) payload.spins = Number(payload.spins);
  if(payload.order !== undefined) payload.order = Number(payload.order);
  if(payload.effectType === 'skullGuard'){
    payload.guardChance = Number(payload.guardChance ?? 70);
  } else if(payload.effectType){
    payload.guardChance = null;
  }
  if(payload.iconType === 'image'){
    payload.icon = '';
    payload.iconImage = payload.iconImage || null;
  } else if(payload.iconType === 'emoji'){
    payload.iconImage = null;
    payload.icon = payload.icon || '🎁';
  }
  await updateDoc(doc(db, 'shopItems', id), payload);
}

export async function deleteShopItem(id){
  await deleteDoc(doc(db, 'shopItems', id));
}

/** 初回セットアップ用：まだ1件もない場合にデフォルト2種類を投入する（admin.js から手動実行）。 */
export async function seedDefaultShopItemsIfEmpty(){
  const snap = await getDocs(collection(db, 'shopItems'));
  if(!snap.empty) return false;

  await createShopItem({
    name: 'スコア2倍チケット', desc: '次の5回のスピンで獲得スコアが2倍になる',
    iconType:'emoji', icon: '✨', cost: 30, spins: 5, effectType: 'scoreBoost', enabled: true, order: 1,
  });
  await createShopItem({
    name: 'ドクロよけのお守り', desc: '次の5回のスピンの間、70%の確率で💀を防ぐ',
    iconType:'emoji', icon: '🛡️', cost: 40, spins: 5, effectType: 'skullGuard', guardChance: 70, enabled: true, order: 2,
  });
  return true;
}

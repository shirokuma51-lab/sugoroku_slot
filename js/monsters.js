// ============================================================
// monsters.js — モンスター定義（管理者がadmin.htmlから追加・編集できる）
//
// Firestore構成:
//   monsters/{monsterId}
//     name       : string   （表示名。例：「スライム」）
//     desc       : string   （説明文）
//     iconType   : 'emoji' | 'image'
//     icon       : string   （iconType==='emoji'の時に使う絵文字1つ）
//     iconImage  : string|null （iconType==='image'の時に使うdataURL。管理画面で
//                                アップロードした画像を縮小・base64化したもの）
//     hueRotate  : number   （絵文字表示時の色相回転。見た目のバリエーション用。画像モードでは未使用）
//     hp         : number   （最大HP）
//     bonusMin/bonusMax : number （討伐時に獲得するボーナスコインの範囲）
//     enabled    : boolean  （trueのものだけ実際にマスへ出現する）
//     order      : number   （管理画面での表示順）
//
// ゲーム側（events.js/game.js）は、game.js が Firestore を購読して受け取った
// カタログ（Game.setMonsterCatalog経由）から、enabled=trueのものだけを対象に
// ランダムで1体選んでタイルへ配置する。カタログが1件も無い場合（初回セットアップ前など）は
// 下記 DEFAULT_MONSTER_DEFS（いただいたリファレンス画像の10種）をフォールバックとして使う。
// ============================================================
import {
  db, doc, getDocs, updateDoc, deleteDoc, addDoc,
  collection, query, orderBy, onSnapshot,
} from './firebase.js';

export const DEFAULT_MONSTER_DEFS = [
  { name:'スライム',         iconType:'emoji', icon:'🔵', hueRotate:0,   hp:30,  bonusMin:20, bonusMax:40,  desc:'もっともよく見かける弱いモンスター。' },
  { name:'ゴブリン',         iconType:'emoji', icon:'👺', hueRotate:70,  hp:50,  bonusMin:30, bonusMax:60,  desc:'素早く動き回るいたずら者。数で襲ってくる。' },
  { name:'オーク',           iconType:'emoji', icon:'👹', hueRotate:70,  hp:80,  bonusMin:50, bonusMax:100, desc:'力自慢の戦士。攻撃力が高い。' },
  { name:'ゴースト',         iconType:'emoji', icon:'👻', hueRotate:200, hp:60,  bonusMin:40, bonusMax:80,  desc:'不気味な霊体。魔法のような攻撃をする。' },
  { name:'ワイバーン',       iconType:'emoji', icon:'🐉', hueRotate:250, hp:120, bonusMin:80, bonusMax:150, desc:'空を飛ぶ凶暴な竜。高いHPを誇る。' },
  { name:'メタルスライム',   iconType:'emoji', icon:'⚪', hueRotate:0,   hp:40,  bonusMin:60, bonusMax:100, desc:'硬い体を持つスライム。物理攻撃が効きにくい。' },
  { name:'スケルトン',       iconType:'emoji', icon:'💀', hueRotate:0,   hp:70,  bonusMin:40, bonusMax:90,  desc:'よみがえった骸骨。守備は低いが数が多い。' },
  { name:'マジックマッシュ', iconType:'emoji', icon:'🍄', hueRotate:280, hp:45,  bonusMin:30, bonusMax:60,  desc:'魔法のキノコ。毒や睡眠を使ってくる。' },
  { name:'ダークウルフ',     iconType:'emoji', icon:'🐺', hueRotate:220, hp:90,  bonusMin:60, bonusMax:120, desc:'暗闇に潜む狼。素早い連続攻撃をしてくる。' },
  { name:'レッドドラゴン',   iconType:'emoji', icon:'🐲', hueRotate:340, hp:200, bonusMin:150, bonusMax:300, desc:'強大な力を持つ伝説の竜。非常に危険。' },
];

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/** モンスター一覧をリアルタイム購読する（enabled/disabled問わず全件・order昇順）。 */
export function subscribeMonsterCatalog(callback){
  const q = query(collection(db, 'monsters'), orderBy('order', 'asc'));
  return onSnapshot(q, (snap)=>{
    const list = [];
    snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
    callback(list);
  });
}

function buildIconFields(data){
  const iconType = data.iconType === 'image' ? 'image' : 'emoji';
  return {
    iconType,
    icon: iconType === 'emoji' ? (data.icon || '👾') : '',
    iconImage: iconType === 'image' ? (data.iconImage || null) : null,
  };
}

export async function createMonster(data){
  const docRef = await addDoc(collection(db, 'monsters'), {
    name: data.name || '',
    desc: data.desc || '',
    ...buildIconFields(data),
    hueRotate: Number(data.hueRotate) || 0,
    hp: Math.max(1, Number(data.hp) || 30),
    bonusMin: Math.max(0, Number(data.bonusMin) || 10),
    bonusMax: Math.max(0, Number(data.bonusMax) || 20),
    enabled: !!data.enabled,
    order: Number(data.order) || 0,
  });
  return docRef.id;
}

export async function updateMonster(id, data){
  const payload = { ...data };
  if(payload.hp !== undefined) payload.hp = Math.max(1, Number(payload.hp));
  if(payload.bonusMin !== undefined) payload.bonusMin = Math.max(0, Number(payload.bonusMin));
  if(payload.bonusMax !== undefined) payload.bonusMax = Math.max(0, Number(payload.bonusMax));
  if(payload.hueRotate !== undefined) payload.hueRotate = Number(payload.hueRotate) || 0;
  if(payload.order !== undefined) payload.order = Number(payload.order);
  if(payload.iconType){
    Object.assign(payload, buildIconFields(payload));
  }
  await updateDoc(doc(db, 'monsters', id), payload);
}

export async function deleteMonster(id){
  await deleteDoc(doc(db, 'monsters', id));
}

/** 初回セットアップ用：まだ1件もない場合にデフォルト10種を投入する（admin.js から手動実行）。 */
export async function seedDefaultMonstersIfEmpty(){
  const snap = await getDocs(collection(db, 'monsters'));
  if(!snap.empty) return false;
  let order = 1;
  for(const def of DEFAULT_MONSTER_DEFS){
    await createMonster({ ...def, enabled:true, order: order++ });
  }
  return true;
}

/**
 * 新しいモンスターインスタンス（HP全回復状態）をカタログからランダムに1体選んで生成する。
 * catalog（Firestoreから購読した一覧）にenabledな項目が無ければ、
 * 組み込みのデフォルト10種からランダムに選ぶ（初回セットアップ前でもゲームが遊べるようにするため）。
 */
export function createMonsterInstance(catalog){
  const pool = (catalog || []).filter(m=>m.enabled);
  const def = pool.length ? randomFrom(pool) : randomFrom(DEFAULT_MONSTER_DEFS);
  return {
    defId: def.id || null,
    name: def.name,
    iconType: def.iconType === 'image' ? 'image' : 'emoji',
    icon: def.icon || '👾',
    iconImage: def.iconType === 'image' ? (def.iconImage || null) : null,
    hueRotate: Number(def.hueRotate) || 0,
    hp: def.hp,
    maxHp: def.hp,
    bonusMin: def.bonusMin,
    bonusMax: def.bonusMax,
    desc: def.desc || '',
  };
}

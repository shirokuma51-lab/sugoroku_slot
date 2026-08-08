// ============================================================
// characters.js — プレイヤーキャラクター画像（管理者がadmin.htmlから差し替えできる）
//
// Firestore構成:
//   gameSettings/characters
//     boyImage  : string|null （dataURL。nullなら標準の assets/img/characters/boy.png を使う）
//     girlImage : string|null （dataURL。nullなら標準の assets/img/characters/girl.png を使う）
//
// 管理画面で画像をアップロードしなければ、これまで通り同梱の標準イラストがそのまま使われる。
// ============================================================
import { db, doc, getDoc, setDoc, onSnapshot } from './firebase.js';

const SETTINGS_DOC = ['gameSettings', 'characters'];

/** キャラクター画像設定をリアルタイム購読する。ドキュメントが無い場合は {boyImage:null, girlImage:null} を渡す。 */
export function subscribeCharacterImages(callback){
  return onSnapshot(doc(db, ...SETTINGS_DOC), (snap)=>{
    const data = snap.exists() ? snap.data() : {};
    callback({ boyImage: data.boyImage || null, girlImage: data.girlImage || null });
  });
}

export async function getCharacterImagesOnce(){
  const snap = await getDoc(doc(db, ...SETTINGS_DOC));
  const data = snap.exists() ? snap.data() : {};
  return { boyImage: data.boyImage || null, girlImage: data.girlImage || null };
}

/** key: 'boy' | 'girl'。dataUrl に null を渡すと標準画像に戻す。 */
export async function updateCharacterImage(key, dataUrl){
  const field = key === 'girl' ? 'girlImage' : 'boyImage';
  await setDoc(doc(db, ...SETTINGS_DOC), { [field]: dataUrl || null }, { merge: true });
}

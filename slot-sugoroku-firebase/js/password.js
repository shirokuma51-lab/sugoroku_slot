// ============================================================
// password.js — あいことば（キャンペーンコード）
//
// Firestore構成:
//   passwords/{passwordId}
//     code            : string（正規化して比較。前後空白トリム＋小文字化）
//     coinAmount      : number
//     titleReward     : string | null（付与する称号のtitles/{id}を指すID。無ければnull）
//     startAt         : Timestamp
//     endAt           : Timestamp
//     active          : boolean
//     maxUses         : number（0 or null = 無制限）
//     currentUses     : number
//   passwords/{passwordId}/redemptions/{uid}
//     redeemedAt      : Timestamp
//     （1ユーザー1回のみ使用可能をこのサブコレクションのドキュメント存在で担保）
//   titles/{titleId}
//     name            : string（称号の表示名）
//     source          : 'password'（あいことば経由で作られた称号であることの印）
//     passwordId      : string（元になったあいことばのID）
//
// あいことばに「称号名」を設定すると、そのあいことばの引き換え時に
// 新しいtitles/{id}ドキュメントが自動生成され、プレイヤーのunlockedTitlesに
// 追加される。title.js側はFirestoreの`titles`コレクションをリアルタイム購読して
// 静的な称号一覧(TITLES)とマージ表示するため、実績由来／あいことば由来の
// 称号を同じ仕組みで扱える。
//
// ★セキュリティ上の注意（README.mdにも記載）:
//   Cloud Functionsを使わないクライアント完結構成のため、あいことばの正誤判定を
//   クライアント側のFirestore読み取りで行っている。Firestoreルールで
//   passwords コレクションの一覧取得(list)は禁止し、コード文字列に完全一致する
//   ドキュメントのみ get できるようにすることを推奨する（詳細はfirestore.rules）。
//   より厳密に守りたい場合はCloud Functions化を推奨。
// ============================================================
import {
  db, doc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, where, onSnapshot, runTransaction,
  serverTimestamp, increment, arrayUnion,
} from './firebase.js';

function normalizeCode(code){
  return (code || '').trim().toLowerCase();
}

/**
 * あいことばを引き換える。
 * @returns {Promise<{success:boolean, coinAmount?:number, message:string}>}
 */
export async function redeemPassword(uid, rawCode){
  const code = normalizeCode(rawCode);
  if(!code) return { success:false, message:'あいことばを入力してください' };

  const q = query(collection(db, 'passwords'), where('code', '==', code));
  const results = await getDocs(q);

  if(results.empty){
    return { success:false, message:'そのあいことばは見つかりませんでした' };
  }

  const passwordDoc = results.docs[0];
  const passwordRef = doc(db, 'passwords', passwordDoc.id);
  const redemptionRef = doc(db, 'passwords', passwordDoc.id, 'redemptions', uid);
  const playerRef = doc(db, 'players', uid);

  try{
    const { coinAmount, titleId } = await runTransaction(db, async (tx)=>{
      // Firestoreトランザクションは「全ての読み取り→全ての書き込み」の順で行う必要がある
      const pSnap = await tx.get(passwordRef);
      const rSnap = await tx.get(redemptionRef);

      if(!pSnap.exists()) throw new Error('あいことばが見つかりません');
      const p = pSnap.data();

      if(!p.active) throw new Error('このあいことばは現在無効です');

      const now = Date.now();
      if(p.startAt && now < p.startAt.toMillis()) throw new Error('まだ利用開始前です');
      if(p.endAt && now > p.endAt.toMillis()) throw new Error('利用期限が終了しています');
      if(p.maxUses && p.maxUses > 0 && (p.currentUses||0) >= p.maxUses){
        throw new Error('利用回数の上限に達しました');
      }
      if(rSnap.exists()) throw new Error('このあいことばは既に使用済みです');

      const amount = p.coinAmount || 0;
      const grantedTitleId = p.titleReward || null;

      tx.set(redemptionRef, { redeemedAt: serverTimestamp() });
      tx.update(passwordRef, { currentUses: increment(1) });

      const playerUpdate = {
        // ここではゲーム画面のコインへ直接触れず、pendingCoinsに積むだけにする。
        // → 別ページ／別タイミングで開いても、後でゲーム画面側が
        //   claimPendingCoins()で自動回収できる（main.js参照）。
        pendingCoins: increment(amount),
      };
      if(grantedTitleId){
        playerUpdate.unlockedTitles = arrayUnion(grantedTitleId);
      }
      tx.update(playerRef, playerUpdate);

      return { coinAmount: amount, titleId: grantedTitleId };
    });

    return { success:true, coinAmount, titleId, message:`${coinAmount}コインを獲得しました！` };
  }catch(err){
    return { success:false, message: err.message || '引き換えに失敗しました' };
  }
}

// ------------------------------------------------------------
// 管理者向け CRUD
// ------------------------------------------------------------

export function subscribePasswordList(callback){
  return onSnapshot(collection(db, 'passwords'), (snap)=>{
    const list = [];
    snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
    callback(list);
  });
}

export async function createPassword(data){
  const docRef = await addDoc(collection(db, 'passwords'), {
    code: normalizeCode(data.code),
    coinAmount: Number(data.coinAmount) || 0,
    startAt: data.startAt,
    endAt: data.endAt,
    active: !!data.active,
    maxUses: Number(data.maxUses) || 0,
    currentUses: 0,
    titleReward: null,
  });

  const titleName = (data.titleName || '').trim();
  if(titleName){
    const titleId = `aikotoba_${docRef.id}`;
    await setDoc(doc(db, 'titles', titleId), {
      name: titleName,
      source: 'password',
      passwordId: docRef.id,
    });
    await updateDoc(docRef, { titleReward: titleId });
  }

  return docRef.id;
}

export async function updatePassword(id, data){
  const payload = { ...data };
  delete payload.titleName;
  if(payload.code) payload.code = normalizeCode(payload.code);
  if(payload.coinAmount !== undefined) payload.coinAmount = Number(payload.coinAmount);
  if(payload.maxUses !== undefined) payload.maxUses = Number(payload.maxUses);
  await updateDoc(doc(db, 'passwords', id), payload);

  if(data.titleName !== undefined){
    const titleId = `aikotoba_${id}`;
    const titleName = (data.titleName || '').trim();
    if(titleName){
      // 称号名が設定されている場合：titles/{id}を作成 or 更新し、passwordsから紐付ける
      await setDoc(doc(db, 'titles', titleId), {
        name: titleName,
        source: 'password',
        passwordId: id,
      }, { merge:true });
      await updateDoc(doc(db, 'passwords', id), { titleReward: titleId });
    } else {
      // 称号名が空にされた場合：以後このあいことばでは称号を付与しないようにする
      // （既に取得済みのプレイヤーの表示が消えないよう、titlesドキュメント自体は残す）
      await updateDoc(doc(db, 'passwords', id), { titleReward: null });
    }
  }
}

export async function deletePassword(id){
  await deleteDoc(doc(db, 'passwords', id));
}

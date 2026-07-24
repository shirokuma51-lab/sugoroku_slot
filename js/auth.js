// ============================================================
// auth.js — 認証まわり
//   ・プレイヤー：初回のみ匿名ログイン（以後はセッション/永続化で自動復元）
//   ・管理者　　：メール/パスワードログイン（admin.html 専用）
// ============================================================
import {
  auth, signInAnonymously, onAuthStateChanged,
  signInWithEmailAndPassword, signOut,
} from './firebase.js';

/**
 * プレイヤーの認証状態を確立する。
 * 既にログイン済みならそのuidを、未ログインなら匿名ログインしてuidを返す。
 * @returns {Promise<import('firebase/auth').User>}
 */
export function ensurePlayerAuth(){
  return new Promise((resolve, reject)=>{
    const unsub = onAuthStateChanged(auth, (user)=>{
      unsub();
      if(user){
        resolve(user);
      } else {
        signInAnonymously(auth).then(cred=>resolve(cred.user)).catch(reject);
      }
    }, reject);
  });
}

/** 現在ログイン中のFirebase Userを監視するリスナーを登録 */
export function watchAuth(callback){
  return onAuthStateChanged(auth, callback);
}

/** 管理者ログイン（メール/パスワード） */
export function adminSignIn(email, password){
  return signInWithEmailAndPassword(auth, email, password);
}

export function adminSignOut(){
  return signOut(auth);
}

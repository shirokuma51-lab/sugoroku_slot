// ============================================================
// firebase.js — Firebase初期化と共通exportをまとめる窓口
// 他のモジュールは全てここから db / auth / Firestore関数を import する。
// SDKバージョンをここだけ変更すれば全体に反映される（保守性のため）。
// ============================================================
import { firebaseConfig } from './firebase-config.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app, auth, db,
  // auth
  signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  // firestore
  doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot,
  collection, query, orderBy, limit, where,
  addDoc, deleteDoc, runTransaction,
  serverTimestamp, increment, arrayUnion,
};

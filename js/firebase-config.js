// ============================================================
// firebase-config.js
// ------------------------------------------------------------
// ★★★ ここをあなた自身のFirebaseプロジェクトの値に置き換えてください ★★★
// Firebaseコンソール → プロジェクトの設定 → 全般 → マイアプリ(ウェブ) から取得できます。
// https://console.firebase.google.com/
//
// また、以下を有効化してください。
//   1. Authentication → Sign-in method → 「匿名」を有効化
//      （管理画面用に「メール/パスワード」も有効化）
//   2. Firestore Database を作成（本番モード推奨。ルールは firestore.rules を使用）
//   3. Firestore に admins/{管理者のUID} ドキュメントを1つ手動作成
//      （フィールドは何でも良い。存在すれば管理者とみなします）
// ============================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

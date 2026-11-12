# 我的鋼琴（PWA）

個人使用的 iPhone 虛擬鋼琴網頁 App。用 Safari 打開網址 →「分享 → 加入主畫面」，即可全螢幕、離線使用，不需 Apple 開發者帳號，也不會過期。

## 功能
- Web Audio API + 真實鋼琴取樣（30 個取樣，每小三度一個，其餘以變速移調補齊），全部預先解碼成 AudioBuffer
- 低延遲：觸控用 touchstart 觸發（非 click）、`latencyHint: 'interactive'`、首次觸碰解鎖 AudioContext；iOS 17+ 設定 `navigator.audioSession.type = 'playback'`（可不受靜音開關影響）
- 多指同時按、滑音（手指滑過琴鍵會彈新音）、放開時短淡出；禁止捲動 / 縮放 / 長按選單 / 選取文字
- 八度切換（◀ ▶）、範圍 1–3 個八度、音名標示（無 / CDE / Do Re Mi）、延音踏板、音量
- 回音（殘響）：無回音 / 短（約 1.2 秒）/ 長（約 3.5 秒），ConvolverNode + 程式產生的脈衝響應，切換時以增益平滑淡入淡出，不會有爆音
- 和弦顯示：同時按住 2 個以上的鍵時顯示和弦名稱（支援轉位 / 分數和弦，如 C/E），兩音時顯示音程（如 大三度）
- 所有設定存在 localStorage；Service Worker 快取全部檔案，第一次載入後可離線使用
- 電腦鍵盤：A W S E D F T G Y H U J K O L P ; ' 彈奏，Z / X 換八度，空白鍵 = 延音

## 檔案
- `index.html`、`style.css`、`app.js`（主程式）、`chord.js`（和弦辨識）、`sw.js`（Service Worker）、`manifest.webmanifest`、`icons/`、`samples/`
- 測試：`node --test tests/chord.test.js`
- 無需建置步驟，任何靜態主機都可放（GitHub Pages、Netlify、Cloudflare Pages…）。必須是 HTTPS 才能註冊 Service Worker。

## 音色來源與授權
鋼琴取樣來自 **Salamander Grand Piano V3**（Alexander Holm 錄製，Yamaha C5），
授權：**Creative Commons Attribution 3.0 (CC BY 3.0)**
<https://creativecommons.org/licenses/by/3.0/>
此處使用的 MP3 子集取自 Tone.js 專案提供的版本：<https://tonejs.github.io/audio/salamander/>
（原始取樣：<https://archive.org/details/SalamanderGrandPianoV3>）

## 更新程式後
修改檔案後請把 `sw.js` 裡的 `CACHE` 版本號加一（例如 `piano-v2`），手機上重新開啟 App 兩次即可拿到新版。

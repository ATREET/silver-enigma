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

## MPC
工具列可切換「鋼琴 / MPC」。MPC 是 4×4 鼓墊加 16 步音軌循環，速度（BPM）與播放都走同一個 AudioContext，所以切回鋼琴時節奏會繼續。工具列上的「鼓聲繼續 / 鼓聲停止」在兩個畫面都看得到，用來讓鼓循環繼續或停掉。

音軌模型：一條音軌 = 一種音色的一行步進（最多 8 條，疊在同一條循環上）。每條有自己的套鼓、音色、靜音與音量。鼓墊用來即時打目前這條音軌的套鼓；點步進格寫入這條音軌。套鼓有三組：原聲、電子、打擊。

存檔：
- 「存到此機」把有名稱的專案放進 localStorage，可再載入或刪除。目前編輯也會自動存成草稿。
- 「匯出 JSON」／「匯入」用檔案帶走專案。iPhone 優先走系統分享（存到「檔案」）；JSON 若不能以檔案分享，會改分享文字。
- 「匯出音檔」做 4 小節 WAV。iOS 的分享必須在點按當下呼叫，所以要點兩次：先製作，再「點一下分享音檔」。

鼓的聲音全部用 Web Audio 在裝置上合成，沒有額外音檔。

電腦鍵盤在 MPC 模式：`1`–`0`、`q` `w` `e` `r` `t` `y` 打 16 個鼓墊，空白鍵 = 鼓聲繼續／停止。

## 檔案
- `index.html`、`style.css`、`app.js`（鋼琴）、`chord.js`（和弦辨識）、`mpc-logic.js`（節拍與存檔）、`mpc-synth.js`（鼓聲合成）、`mpc.js`（MPC 畫面）、`sw.js`（Service Worker）、`manifest.webmanifest`、`icons/`、`samples/`
- 測試：`node --test tests/chord.test.js tests/mpc.test.js`
- 無需建置步驟，任何靜態主機都可放（GitHub Pages、Netlify、Cloudflare Pages…）。必須是 HTTPS 才能註冊 Service Worker。

## 音色來源與授權
鋼琴取樣來自 **Salamander Grand Piano V3**（Alexander Holm 錄製，Yamaha C5），
授權：**Creative Commons Attribution 3.0 (CC BY 3.0)**
<https://creativecommons.org/licenses/by/3.0/>
此處使用的 MP3 子集取自 Tone.js 專案提供的版本：<https://tonejs.github.io/audio/salamander/>
（原始取樣：<https://archive.org/details/SalamanderGrandPianoV3>）

MPC 鼓聲是這個專案自己用 Web Audio 合成的，沒有取用第三方取樣，因此沒有額外授權。鋼琴音量旋鈕只影響鋼琴；鼓有各自音軌音量。

## 更新程式後
修改檔案後請把 `sw.js` 裡的 `CACHE` 版本號加一（目前是 `piano-v3`），手機上重新開啟 App 兩次即可拿到新版。GitHub Pages 由 `main` 分支的根目錄提供，不使用 Actions。

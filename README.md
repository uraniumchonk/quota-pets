# 額度小人（quota-pets）

Windows 桌面最上層的一排 Q 版小人，趴在同一條欄位上，每隻舉著自己家族的額度牌。資料來自 meowhome 的 agentstat（`/api/quota` 每 60 秒、`/api/agents` 每 20 秒）。

## 啟動

- 解壓 `quota-pets-win-x64.zip`，執行 `QuotaPets.exe`。不出現在工作列，系統匣有圖示。
- 第一次啟動時把內建的 `pets` 資料夾複製到 `%APPDATA%\額度小人\pets`。之後改圖、改設定都改這一份；右鍵選單「開啟角色資料夾」直接打開。
- 檔案一存，畫面約 0.3 秒內自動重載，不用重開程式。

## 操作

| 動作 | 效果 |
|---|---|
| 左鍵點小人 | 說一句話；睡著的小人醒來 10 秒並顯示額度 |
| 拖小人 | 整排一起移動；放開時離「上方中間」或「左上角」48 px 內會吸附 |
| 右鍵（小人或系統匣） | 調整位置、鎖定位置、立即刷新、重新載入、開啟角色資料夾、開機自動啟動、結束 |

## 調整模式（右鍵 →「調整位置…」）

點選要調的部分，或按 Tab 依序切換：每隻的「角色圖片」「牌子文字框」，再來是「欄位」「整排」。

| 按鍵 | 角色圖片 | 牌子文字框 | 欄位 | 整排 |
|---|---|---|---|---|
| 方向鍵（Shift ×10） | 移動 1 px | 移動 1 px（圖片像素） | ↑↓ 高度、←→ 左右多出 | ↑↓ 上下、←→ 間距 |
| Alt + 方向鍵 | ↑↓ 大小 | 寬、高 | ↑↓ 厚度 | ↑↓ 整排縮放 |
| + / − | | 字級 | | |
| [ / ] | | 旋轉 0.5°（Shift ×10） | | |

- `P`／`Shift+P`：預覽這隻的下一個／上一個姿勢，每個姿勢的圖都能對位。
- 「切換專用／共用」：讓這個姿勢有自己的文字框位置（例如哭的那張牌子歪了）。
- `Ctrl+S` 存檔繼續調；`Enter`「鎖定」＝存檔、離開調整模式、鎖住拖動；`Esc` 放棄這次的修改。
- 頭要伸出螢幕外：選「整排」按 ↑ 讓「整排上下」變成負數，或單獨調某隻角色圖片的 y 為負數。視窗本身貼在螢幕頂端，超出的部分被切掉。

## 資料夾結構

```
pets/
  config.json                 全域：伺服器、刷新秒數、門檻、角色順序、整排與欄位
  characters/
    claude/
      character.json          這隻的設定
      normal.png warning.png critical.png front.png sleep.gif sleep_front.png
    codex/ grok/ qwen/
```

### 圖層

每隻角色由下到上四層：

1. `img`：角色本體（身體、頭、表情）。
2. 欄位：所有角色共用，可在 `config.json` 的 `rail.ledge.img` 換成圖片。
3. `front`：疊在欄位前面的部分（手、牌子）。不需要可以不給，整張圖都放 `img`。
4. 文字框：程式畫的額度文字，位置由 `textBox` 決定。

圖片格式：png、gif、webp、apng 直接用；`.webm`、`.mp4` 會自動循環、靜音播放。

### character.json

| 欄位 | 說明 |
|---|---|
| `size` | 圖片原始像素，例如 `{"w":360,"h":440}`；同一隻的每張圖都用這個尺寸 |
| `scale`、`offset` | 這隻的大小倍率與位置（螢幕像素） |
| `agent` | agentstat 裡的 agent id，用來判斷工作中／閒置／睡著 |
| `quota` | 牌子上列哪些額度：`provider` 是 agentstat 的 claude／claude2／codex／grok，`window` 是 5h／7d，`label` 是顯示文字。留空陣列就改顯示 agent 狀態 |
| `footer` | `reset` 顯示最緊那項的重置倒數；`state` 不顯示倒數 |
| `textBox` | 文字框位置，用圖片像素：`x y w h rotate fontSize color`，可加 `font` |
| `poses` | 姿勢表。每個姿勢：`img`、`front`、`showQuota`（false＝不顯示額度）、`text`（改顯示固定文字）、`textBox`（此姿勢專用位置）、`anim`（`bob` 上下晃，`none` 不動） |
| `rules` | 由上往下比對，第一條符合的規則決定姿勢 |
| `click` | `say` 點了說話；`pose`＋`ms` 點了暫時換成某姿勢（例如被戳的表情） |
| `lines` | 各姿勢的台詞，點擊與隨機冒泡從這裡挑 |

### 規則條件

一條規則的 `if` 裡所有條件都成立才算符合。

| 條件 | 例子 | 意思 |
|---|---|---|
| `source` | `"offline"` | 連不到 agentstat 超過 3 個刷新週期 |
| `agentState` | `["sleeping","offline"]` | agent 狀態是其中之一 |
| `idleSecAtLeast` | `1800` | 不在工作中，而且最後活動已超過這麼多秒 |
| `severity` | `"warning"` | 牌子上最緊的一項至少到這個等級（門檻在 config 的 `thresholds`，以已用 % 計） |
| `leftBelow` | `20` | 有任一項剩不到 20% |
| `clickedWithinSec` | `10` | 這隻在 10 秒內被點過 |
| `hours` | `[1, 7]` | 現在時間在 1 點到 7 點之間（可跨午夜，如 `[23, 7]`） |
| `not`、`any` | `{"not":{"clickedWithinSec":10}}` | 反向、任一成立 |

例：深夜改成睡覺 gif，不顯示額度：

```json
{ "if": { "hours": [1, 7] }, "pose": "sleep" }
```

### 新增一隻

1. 在 `characters/` 開新資料夾，放圖和 `character.json`（從現有的複製一份改）。
2. 在 `config.json` 的 `characters` 陣列加上資料夾名稱，順序就是左到右。

## 開發

- 程式碼：`app/main.cjs`（視窗、拖動吸附、選單、讀 agentstat、存設定）、`app/renderer/js/` 下的 `quota.js`（整理資料）、`rules.js`（條件與姿勢）、`view.js`（圖層與牌子）、`editor.js`（調整模式）、`app.js`（串起來）。
- 新條件：在 `rules.js` 的 `QP.conditions` 加一個 `(值, ctx) => true/false`。
- 瀏覽器預覽：在 `app/` 開 http 伺服器，打開 `renderer/index.html`，可加 `?state=warning|critical|sleep`、`?edit=1`，用的是假資料。
- 佔位圖：`python3 tools/make_placeholders.py app/pets/characters`。
- Linux 開發：`npm install && npm start`。
- Windows 打包：`tools/package_win.sh`，產生 `dist/quota-pets-win-x64.zip`。

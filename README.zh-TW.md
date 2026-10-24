# 額度小人（quota-pets）

[English](README.md)

Windows 桌面最上層的一排 Q 版小人，每隻抱著一張白紙，紙上寫自己家族（Claude、GPT／Codex、Grok、Qwen）的訂閱額度。

## 資料來源

`config.json` 的 `server`：

- `"demo"`（預設）：不連線，每 15 秒輪流示範平常、快用完、見底、閒置。
- 你的伺服器網址，例如 `"http://localhost:10026"`：每 60 秒讀 `/api/quota`、每 20 秒讀 `/api/agents`。回傳格式見 [docs/API.md](docs/API.md)，任何語言寫個小服務照格式回 JSON 就能接。

## 啟動

- 解壓 `quota-pets-win-x64.zip`，執行 `QuotaPets.exe`。不出現在工作列，系統匣有圖示。
- 第一次啟動時把內建的 `pets` 資料夾複製到 `%APPDATA%\額度小人\pets`。之後改圖、改設定都改這一份；右鍵選單「開啟角色資料夾」直接打開。
- 檔案一存，畫面約 0.3 秒內自動重載，不用重開程式。

## 操作

| 動作 | 效果 |
|---|---|
| 左鍵點小人 | 說一句話；睡著的小人醒來 10 秒並顯示額度 |
| 拖小人 | 整排一起移動；放開時離「上方中間」或「左上角」48 px 內會吸附 |
| 滑鼠在圖片透明處 | 點擊穿過去，點到後面的視窗 |
| Ctrl + 滑鼠滾輪（在小人上） | 整排等比放大縮小，每格 5%；右鍵「大小」也能直接選 50%～150% |
| 右鍵（小人或系統匣） | 調整位置、鎖定位置、立即刷新、重新載入、開啟角色資料夾、開機自動啟動、結束 |

## 綁定視窗（可選，右鍵 →「綁定視窗」）

預設一直顯示。綁定之後只在你選的那幾個視窗時出現，可以綁任意多個。

- **最快的做法**：切到想綁的視窗（例如某一個終端機），按 **Ctrl+Alt+B**。小人會說「已綁定：…」；再按一次就解除。綁第一個時會自動打開「只在綁定的視窗出現」。
- 選單「綁定單一視窗」：列出每個開著的視窗（同一個程式開三個視窗就列三行），勾選要綁的。
- 選單「綁定整個程式」：這個程式的所有視窗都算。
- 「切到綁定的視窗時出現」（預設）：綁定的任一視窗在最前面才出現；切到別的視窗或最小化時約 0.2 秒內隱藏（`hideDelaySec`）。點小人本身不算切走。
- 「綁定的視窗有開著就出現」：任一綁定視窗還開著就顯示。
- 「移除：…」解除單一綁定；關掉的視窗會標「（已關閉）」，「清掉已關閉的視窗」一次清除。
- 調整模式中一律顯示。

限制：

- 單一視窗靠視窗代號（hwnd）辨認。視窗關掉再開，或重開機後，代號會變，要重新綁。
- Windows Terminal 同一個視窗裡的分頁共用一個代號，綁的是整個視窗，分不出分頁。

設定存在 `config.json` 的 `bind`：

```json
"bind": { "enabled": true, "mode": "foreground", "hotkey": "Ctrl+Alt+B", "hideDelaySec": 0.2,
  "match": [ { "hwnd": 1312834, "process": "WindowsTerminal", "title": "claude" }, { "process": "Code" }, { "title": "Codex" } ] }
```

有 `hwnd` 的一筆只認那個視窗（`process`、`title` 只是顯示用）；沒有 `hwnd` 時用 `process`（程式名稱，不分大小寫）和 `title`（標題包含的文字）比對，兩個都寫就要兩個都符合。偵測用一個隱藏的 PowerShell 接 Windows 事件（換前景視窗、最小化、還原），另外每 2 秒對一次帳。

## 升級

新版程式的 `config.json` 帶較大的 `bundleVersion` 時，舊的 `pets` 改名成 `pets.bak-<時間>` 保留，換上新版的角色與圖片，再把你調過的東西搬回來：位置、整排大小（含等比縮放）與間距、鎖定、綁定、伺服器，以及每隻的位置、大小和文字框。文字框只在那個姿勢用的圖檔名沒變時才搬。

## 調整模式（右鍵 →「調整位置…」）

點選要調的部分，或按 Tab 依序切換：每隻的「角色圖片」「牌子文字框」，再來是「欄位」「整排」。

| 按鍵 | 角色圖片 | 牌子文字框 | 欄位 | 整排 |
|---|---|---|---|---|
| 方向鍵（Shift ×10） | 移動 1 px | 移動 1 px（圖片像素） | ↑↓ 高度、←→ 左右多出 | ↑↓ 上下、←→ 間距 |
| Alt + 方向鍵 | ↑↓ 大小 | 寬、高 | ↑↓ 厚度 | ↑↓ 等比大小 1% |
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
      normal.png              平常（抱著白紙）
      01_working.png          agent 工作中（筆電＋白紙）
      02_quota_empty.png      額度見底（哭，白紙）
      03_idle.png             閒置（沒有白紙，不顯示額度）
    codex/ grok/ qwen/
```

對應：claude＝橘髮、codex＝白龍（GPT）、grok＝哥德雙馬尾、qwen＝紫髮。

### 姿勢與規則（預設）

由上往下，第一條符合的生效：

1. 連不到資料伺服器 → `offline`（平常的圖，紙上寫「連不到家裡的貓窩」）
2. agent 不在工作、最後活動超過 30 分鐘、10 秒內沒被點 → `idle`（03_idle，不顯示額度；點一下會醒來 10 秒）
3. 紙上任一項已用 ≥ 90% → `critical`（02_quota_empty）
4. agent 工作中 → `working`（01_working）
5. 任一項已用 ≥ 75% → `warning`（目前用平常的圖）
6. 其他 → `normal`

### 換圖

每個姿勢用一整張圖，換姿勢就是換整張。直接覆蓋同名檔即可；要新增姿勢就放新圖，在 `poses` 加一筆、在 `rules` 加一條。三張有白紙的圖各有自己的文字框（`poses.<姿勢>.textBox`），在調整模式按 P 切到那個姿勢再對位。

圖片格式：png、gif、webp、apng 直接用；`.webm`、`.mp4` 會自動循環、靜音播放。同一隻的每張圖用同一個尺寸（`size`）。

選用功能：姿勢可加 `front`（疊在欄位前的第二張圖），`config.json` 的 `rail.ledge.show` 設 true 會出現一條共用欄位；目前都沒用。

### character.json

| 欄位 | 說明 |
|---|---|
| `size` | 圖片原始像素，例如 `{"w":360,"h":440}`；同一隻的每張圖都用這個尺寸 |
| `scale`、`offset` | 這隻的大小倍率與位置（螢幕像素） |
| `agent` | `/api/agents` 裡的 agent id，用來判斷工作中／閒置／睡著 |
| `quota` | 牌子上列哪些額度：`provider` 是 `/api/quota` 裡的鍵（預設 claude／claude2／codex／grok），`window` 是 5h／7d，`label` 是顯示文字。留空陣列就改顯示 agent 狀態 |
| （config）`display` | `used`（預設）數字和進度條是已用 %；`left` 改成剩餘 % |
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
| `source` | `"offline"` | 連不到資料伺服器超過 3 個刷新週期 |
| `agentState` | `["sleeping","offline"]` | agent 狀態是其中之一 |
| `idleSecAtLeast` | `1800` | 不在工作中，而且最後活動已超過這麼多秒 |
| `severity` | `"warning"` | 牌子上最緊的一項至少到這個等級（門檻在 config 的 `thresholds`，以已用 % 計） |
| `leftBelow` | `20` | 有任一項剩不到 20% |
| `clickedWithinSec` | `10` | 這隻在 10 秒內被點過 |
| `hours` | `[1, 7]` | 現在時間在 1 點到 7 點之間（可跨午夜，如 `[23, 7]`） |
| `not`、`any` | `{"not":{"clickedWithinSec":10}}` | 反向、任一成立 |

例：深夜改成閒置姿勢：

```json
{ "if": { "hours": [1, 7] }, "pose": "idle" }
```

### 新增一隻

1. 在 `characters/` 開新資料夾，放圖和 `character.json`（從現有的複製一份改）。
2. 在 `config.json` 的 `characters` 陣列加上資料夾名稱，順序就是左到右。

## 開發

- 程式碼：`app/main.cjs`（視窗、拖動吸附、選單、讀資料、存設定）、`app/winbind.cjs`（綁定視窗）、`app/renderer/js/` 下的 `quota.js`（整理資料）、`rules.js`（條件與姿勢）、`view.js`（圖層與牌子）、`editor.js`（調整模式）、`app.js`（串起來）。
- 新條件：在 `rules.js` 的 `QP.conditions` 加一個 `(值, ctx) => true/false`。
- 瀏覽器預覽：在 `app/` 開 http 伺服器，打開 `renderer/index.html`，可加 `?state=warning|critical|sleep`、`?edit=1`，用的是假資料。
- Linux 開發：`npm install && npm start`。
- Windows 打包：`tools/package_win.sh`，產生 `dist/quota-pets-win-x64.zip`。

## 授權

- 程式碼：MIT（[LICENSE](LICENSE)）。
- 角色圖片（`app/pets/characters/**` 的 png）：CC BY-NC 4.0（[ART-LICENSE.md](ART-LICENSE.md)）。
- 與 Anthropic、OpenAI、xAI、Alibaba 無關；角色只是以各家模型為主題的同人創作。

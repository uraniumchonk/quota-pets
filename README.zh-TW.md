# 額度小人（quota-pets）

[English](README.md)

Windows 桌面最上方的一排 Q 版小人，每隻抱著一張白紙，紙上寫自己家族（Claude、GPT／Codex、Grok）的訂閱額度；本地跑的 Qwen coder 則寫它的 agent 正在做什麼。agent 工作中、額度見底、閒置一段時間，小人都會換一張圖。

![額度小人](docs/preview.png)

實際放在桌面上（後面是 Windows Terminal）：

![額度小人在桌面上](docs/screenshot.png)

> **狀態**：v0.10.2 預計是最後一版。歡迎 fork 回去隨意改；專案附帶 [AGENTS.md](AGENTS.md)，coding agent 看了就知道資料後端怎麼搭、角色／姿勢／規則／版面怎麼改。

## 功能

- 透明、永遠在最上層、不佔工作列。滑鼠在圖片透明處時，點擊會穿到後面的視窗。
- 內建示範資料，裝好就會動；接上自己的伺服器就顯示真實數字。
- 依規則換姿勢：工作中、額度見底、閒置、離線，也可以自己加。
- 點小人會說話，偶爾也會自己冒一句。
- 拖動整排（會吸附到上方中間或左上角）、Ctrl + 滾輪縮放，還有調整模式可以把每張圖和文字框對齊。
- 可選的視窗綁定：只在指定的視窗在最前面時出現。
- 介面有繁體中文和英文。
- 每隻小人就是一個資料夾：幾張圖加一個 `character.json`。

## 安裝

1. 從 [Releases](https://github.com/uraniumchonk/quota-pets/releases/latest) 下載 `quota-pets-win-x64.zip`，解壓到任何地方。
2. 執行 `QuotaPets.exe`。不會出現在工作列，系統匣有圖示。
3. 程式沒有數位簽章，第一次執行時 SmartScreen 可能會警告（按「其他資訊」→「仍要執行」）。

第一次啟動時，內建的 `pets` 資料夾會複製到 `%APPDATA%\額度小人\pets`。之後改圖、改設定都改這一份（右鍵 →「開啟角色資料夾」）。檔案一存，約 0.3 秒內畫面就會更新，不用重開程式。

## 資料來源

`pets/config.json` 的 `server`：

- `"demo"`（預設）：完全不連網路，每 15 秒輪流示範平常、忙碌、見底、閒置。
- 伺服器網址，例如 `"http://localhost:10026"`：每 60 秒讀 `GET /api/quota`、每 20 秒讀 `GET /api/agents`。選單的「立即刷新額度」還會先送一個 `POST /api/refresh`。

回傳格式見 [docs/API.md](docs/API.md)，任何語言寫個小服務照格式回 JSON 就能接。想先試試看，可以用附的範例伺服器：

```sh
python3 tools/example_server.py 10026            # 只在本機 127.0.0.1 監聽
python3 tools/example_server.py 10026 0.0.0.0    # 開放給其他電腦連，沒有任何驗證
```

它讀的是 `tools/quota.json` 和 `tools/agents.json`，第一次用到時會自動產生範例數字，這兩個檔案也已經排除在 git 之外。可以手動改數字，或把 `load()` 換成呼叫各家官方用量 API。各家的金鑰留在伺服器上就好，程式本身完全用不到。

內建的小人讀這些鍵：

| 資料夾 | 角色 | 牌子 | `/api/quota` 的鍵 | `/api/agents` 的 id |
|---|---|---|---|---|
| `claude` | 橘髮 | 主 5h、主 7d、副 5h、副 7d | `claude`、`claude2` × `5h`、`7d` | `cli:claude` |
| `codex` | 白龍 | 週 | `codex` × `7d` | `cli:codex` |
| `grok` | 哥德雙馬尾 | 週 | `grok` × `7d` | `cli:grok` |
| `qwen` | 紫髮 | agent 狀態和 `doing`（本地模型，沒有額度） | 無 | `cli:qwen` |

`/api/quota` 連續 3 個刷新週期都失敗時，每隻都會換成離線姿勢，紙上留著最後一次的數字。

## 操作

| 動作 | 效果 |
|---|---|
| 左鍵點小人 | 說一句話；閒置的小人會醒來 10 秒並顯示額度 |
| 拖小人 | 整排一起移動；放開時離「上方中間」或「左上角」48 px 內會吸附。預設是鎖定的，要先在右鍵選單取消「鎖定位置」 |
| Ctrl + 滑鼠滾輪（在小人上） | 整排等比放大縮小，每格 5%（右鍵「大小」也能直接選 50%～150%） |
| 右鍵（小人或系統匣） | 調整位置、鎖定位置、大小、綁定視窗、語言、立即刷新、重新載入、開啟角色資料夾、開機自動啟動、開發者工具、結束 |

### 語言

右鍵 →「語言」：跟著系統（預設；系統是中文就用繁中，其他用英文）、繁體中文、English。設定存在 `config.json` 的 `lang`（`auto`／`zh-TW`／`en`）。

### 綁定視窗（可選，右鍵 →「綁定視窗」）

預設一直顯示。綁定之後，只在你選的視窗出現時才顯示，可以綁任意多個。

- **最快的做法**：切到想綁的視窗（例如某一個終端機），按 **Ctrl+Alt+B**。小人會說「已綁定：…」；再按一次就解除。綁第一個時會自動打開「只在綁定的視窗出現」。
- 「綁定單一視窗」列出每個開著的視窗；「綁定整個程式」則是這個程式的所有視窗都算。
- 「切到綁定的視窗時出現」（預設）：切到別的視窗或最小化後約 0.2 秒隱藏（`hideDelaySec`）。點小人本身不算切走。
- 「綁定的視窗有開著就出現」：任一綁定的視窗還開著就顯示。
- 「移除：…」解除單一綁定；關掉的視窗會標「（已關閉）」，「清掉已關閉的視窗」一次清掉。調整模式中一律顯示。

單一視窗靠視窗代號（hwnd）辨認。視窗關掉再開，或重開機之後代號會變，要重新綁。Windows Terminal 同一個視窗裡的分頁共用一個代號，分不出分頁。綁定視窗只支援 Windows。

設定存在 `config.json` 的 `bind`：

```json
"bind": { "enabled": true, "mode": "foreground", "hotkey": "Ctrl+Alt+B", "hideDelaySec": 0.2,
  "match": [ { "hwnd": 1312834, "process": "WindowsTerminal", "title": "claude" }, { "process": "Code" }, { "title": "Codex" } ] }
```

有 `hwnd` 的一筆只認那個視窗（`process`、`title` 只是顯示用）；沒有 `hwnd` 時用 `process`（程式名稱，不分大小寫）和 `title`（標題包含的文字）比對，兩個都寫就要兩個都符合。

### 調整模式（右鍵 →「調整位置…」）

點選要調的部分，或按 Tab（Shift+Tab 反向）依序切換：每隻的「角色圖片」「牌子文字框」，再來是「欄位」「整排」。也可以直接拖動選到的部分。

| 按鍵 | 角色圖片 | 牌子文字框 | 欄位 | 整排 |
|---|---|---|---|---|
| 方向鍵（Shift ×10） | 移動 1 px | 移動 1 px（圖片像素） | ↑↓ 上下、←→ 左右多出 | ↑↓ 上下、←→ 間距 |
| Alt + 方向鍵 | ↑↓ 大小 | 寬、高 | ↑↓ 厚度 | ↑↓ 等比大小 1% |
| + / − | | 字級 | | |
| [ / ] | | 旋轉 0.5°（Shift ×10） | | |

- `P`／`Shift+P`：預覽這隻的下一個／上一個姿勢，每個姿勢的圖都能對位。
- 「切換專用／共用」：讓這個姿勢有自己的文字框位置（例如那張圖的紙放在別的地方）。
- `Ctrl+S` 存檔並繼續調；`Enter`「鎖定」＝存檔、離開調整模式並鎖住位置；`Esc` 放棄這次的修改。
- 想讓頭伸出螢幕外：選「整排」按 ↑ 讓「整排上下」變成負數，或把某隻角色圖片的 y 調成負數。視窗本身貼在螢幕頂端，超出的部分會被切掉。

## 自訂角色

```
pets/
  config.json                 全域：伺服器、刷新秒數、門檻、角色順序、整排位置、綁定
  characters/<id>/
    character.json            名字、額度列、姿勢、規則、文字框、台詞
    normal.png                平常（抱著白紙）
    01_working.png            agent 工作中（筆電＋白紙）
    02_quota_empty.png        額度見底（哭，白紙）
    03_idle.png               閒置（沒有白紙，不顯示額度）
```

每個姿勢用一整張圖，換姿勢就是換整張。要換圖，直接用同尺寸的圖覆蓋同名檔；要新增姿勢，就放新圖、在 `poses` 加一筆、在 `rules` 加一條。姿勢預設共用角色的 `textBox`；紙放在不同位置的圖可以有自己的文字框（`poses.<姿勢>.textBox`，`working` 和 `critical` 就是）。在調整模式按 `P` 切到那個姿勢再對位。

圖片格式：png、gif、webp、apng 直接用；`.webm`、`.mp4` 會自動循環、靜音播放。同一隻的每張圖都用同一個尺寸（`size`）。另外有兩個預設沒用到的選用功能：姿勢可以加 `front`（疊在欄位前面的第二張圖），`rail.ledge.show` 設成 true 會出現一條共用的欄位。

新增一隻：在 `characters/` 開一個新資料夾，放圖和 `character.json`（從現有的複製一份改），再把資料夾名稱加進 `config.json` 的 `characters`，排列順序就是左到右。

### 預設規則

由上往下比對，第一條符合的決定姿勢。

1. 連不到資料伺服器 → `offline`（平常的圖，紙上寫「連不到伺服器」）
2. agent 不在工作、閒置 30 分鐘以上、10 秒內沒被點 → `idle`（不顯示額度）
3. 任一項已用 ≥ 90% → `critical`（`02_quota_empty`）
4. agent 工作中 → `working`（`01_working`）
5. 任一項已用 ≥ 75% → `warning`（平常的圖）
6. 其他 → `normal`

例：深夜改成閒置姿勢：

```json
{ "if": { "hours": [1, 7] }, "pose": "idle" }
```

### 規則條件

一條規則的 `if` 裡，所有條件都成立才算符合。

| 條件 | 例子 | 意思 |
|---|---|---|
| `source` | `"offline"` | 連不到資料伺服器超過 3 個刷新週期 |
| `agentState` | `["sleeping", "offline"]` | agent 狀態是其中之一 |
| `idleSecAtLeast` | `1800` | 不在工作中，而且最後活動已超過這麼多秒 |
| `severity` | `"warning"` | 牌子上最緊的一項至少到這個等級（門檻在 `config.json` 的 `thresholds`，以已用 % 計） |
| `leftBelow` | `20` | 有任一項剩不到 20% |
| `clickedWithinSec` | `10` | 這隻在 10 秒內被點過 |
| `hours` | `[1, 7]` | 現在是 1 點到 7 點之間（可以跨午夜，例如 `[23, 7]`） |
| `not`、`any` | `{ "not": { "clickedWithinSec": 10 } }` | 反向、任一成立 |

要加新條件，在 `app/renderer/js/rules.js` 的 `QP.conditions` 加一個函式就好。

### `character.json`

| 欄位 | 說明 |
|---|---|
| `name` | 名字，顯示在調整模式 |
| `size` | 圖片原始像素，例如 `{ "w": 1448, "h": 1086 }`；同一隻的每張圖都是這個尺寸 |
| `scale`、`offset` | 這隻的大小倍率與位置（螢幕像素） |
| `agent` | `/api/agents` 裡的 agent id，用來判斷工作中、閒置、睡著 |
| `quota` | 牌子上列哪些額度：`provider` 是 `/api/quota` 裡的鍵，`window` 是額度週期的 id（`5h`、`7d`），`label` 是顯示文字。留空陣列就改顯示 agent 狀態 |
| `footer` | `reset` 顯示最緊那項的重置倒數；`state` 不顯示倒數 |
| `textBox` | 文字框位置，用圖片像素：`x y w h rotate fontSize color`，可加 `font` |
| `poses` | 姿勢表。每個姿勢：`img`、`front`、`showQuota`（false＝不顯示額度）、`text`（改顯示固定文字）、`textBox`（這個姿勢專用的位置） |
| `rules` | 由上往下比對，第一條符合的決定姿勢 |
| `click` | `say`：點了會說話；`pose`＋`ms`：點了暫時換成某個姿勢 |
| `lines` | 各姿勢的台詞，點擊和隨機冒泡從這裡挑 |

`name`、`label`、姿勢的 `text` 和各姿勢的 `lines`，可以寫成單一個值，或依語言分開寫：

```json
"label": { "zh-TW": "主 5h", "en": "Main 5h" }
```

介面字串在 `app/i18n.json`，加一種語言就是加一組同樣的鍵。

### `config.json`

| 欄位 | 說明 |
|---|---|
| `server` | `"demo"` 或資料伺服器的網址 |
| `pollQuotaSec`、`pollAgentsSec` | 刷新秒數（60、20） |
| `thresholds` | `warning`、`critical` 的門檻，以已用 % 計（75、90） |
| `characters` | 角色資料夾，左到右 |
| `display` | `used`（預設）數字和進度條是已用 %；`left` 改成剩餘 % |
| `lang` | `auto`、`zh-TW` 或 `en` |
| `rail` | 整排的位置：`anchor`（`top-center`、`top-left` 或 `free`）、`x`、`y`、`shiftY`、`gap`、`scale`、`zoom`、`locked`、`ledge` |
| `bubble` | 隨機冒泡：`enabled`、`autoSec`（兩句之間的秒數，最小與最大）、`showSec` |
| `bind` | 綁定視窗，見上方 |
| `bundleVersion` | 內建 `pets` 的版本號，不用動 |

### 升級

新版程式帶的 `bundleVersion` 比較大時，舊的 `pets` 會改名成 `pets.bak-<時間>` 保留，換上新版的角色與圖片，再把你調過的東西搬回來：位置、整排大小與間距、縮放、鎖定、綁定、伺服器、語言、已用／剩餘的顯示方式，以及每隻的位置、大小和文字框。文字框只在那個姿勢用的圖檔名沒變時才會搬。

## 隱私

- 程式只會連你設定的 `server`；示範模式完全不連網路。沒有遙測，也不會檢查更新。視窗只載入本機檔案，伺服器傳來的文字一律當純文字顯示。
- 設定都存在 `%APPDATA%\額度小人`。
- 在 Windows 上，為了讓綁定視窗能運作，一個隱藏的 PowerShell 會讀取開著的視窗的標題和程式名稱（視窗事件發生時，以及每 2 秒一次），只放在記憶體裡。綁定單一視窗時，會把它的代號、程式名稱和標題存進 `config.json`；解除綁定就會刪掉。
- `tools/example_server.py` 沒有任何驗證。除非是你信任的網路，否則讓它留在 127.0.0.1 就好。

## 開發

- `npm install && npm start`：用 Electron 在 Windows、Linux 或 macOS 上執行（綁定視窗只支援 Windows）。
- 瀏覽器預覽（假資料）：`cd app && python3 -m http.server 18777`，打開 `http://127.0.0.1:18777/renderer/index.html`，可加 `?state=warning|critical|sleep`、`?edit=1`、`?lang=en`。
- `tools/package_win.sh`：用官方的 Electron Windows 版打包出 `dist/quota-pets-win-x64.zip`。需要 `curl`、`unzip`、`zip`；有 `wine` 和 `dist/rcedit-x64.exe` 時也會換上 exe 圖示。
- 程式結構與慣例：[AGENTS.md](AGENTS.md)。

## 授權

- 程式碼：MIT（[LICENSE](LICENSE)）。
- 角色圖片（`app/pets/characters/**/*.png`）：CC BY-NC 4.0（[ART-LICENSE.md](ART-LICENSE.md)），用 OpenAI 的圖像模型產生。
- 與 Anthropic、OpenAI、xAI、Alibaba 無關；角色是以各家模型為主題的同人創作。

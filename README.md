# ㄌㄌ保姆｜家訪資料與照護計畫書

The Pet Sitter Lili 的獨立 App。原本的 `lili-pet-prereport` 與多寵點名板皆未修改。

## 目前功能

- 每家庭可編輯的照護欄位、自由文字份量、選項及自訂值。
- 每一欄單獨清除，新增／移除一組，復原最近 40 次修改。
- 各照護類別保留整段補充，共用流程與個別差異並存。
- 每家庭獨立內部照片頁，多張上傳、可選說明、縮圖、原檔放大。
- 文字計畫書由明確欄位組成，允許再編輯，TXT 下載／複製；不包含照片、照片說明與 Drive 照片 ID。
- 以 Google Drive 為主要持久儲存，寫入後讀回核對，覆寫前建立還原副本。
- 每家庭完整 JSON 備份包含照片原始檔，還原會建立新副本。

## 必須完成的 Google 設定

目前沒有 OAuth client ID，尚未以真實 Google 帳號完成連線測試。未連線資料只存在目前頁面記憶體，頁面會明確提醒，請勿當成正式保存處。localStorage 只保存 OAuth client ID，不保存家庭資料或 access token。

1. 以保姆帳號 `petsitterlili2025@gmail.com` 在 Google Cloud 建立或選擇專用專案。
2. 啟用 Google Drive API，設定 Google Auth Platform OAuth 同意畫面。
3. 使用 Web application client，設定 App 的正式網域為 Authorized JavaScript origin（僅 origin，不含路徑）。
4. 申請範圍只有 `https://www.googleapis.com/auth/drive.file`。若處於 Testing 狀態，把保姆帳號加入 test users。
5. 將 client ID 填入 App「雲端設定」，接著按「連接保姆 Google Drive」，由使用者自行授權。
6. 正式使用前測試新增家庭、重開載入、修改儲存、照片、下載完整備份，以及在另一個工作階段還原。

此 App 的 OAuth 授權與 ChatGPT 的 Google Drive 連接為不同授權，不能互相代用。不需要將任何密碼或 client secret 寫進程式碼。

## 資料結構與隱私

App 建立私人 `ㄌㄌ保姆_家庭照護檔案` 資料夾。每家庭一個 JSON，照片為獨立原始檔，縮圖放在私有 JSON。照片用 appProperties.familyId 關聯家庭。資料與照片都不放進 GitHub，也不放進網站原始碼。

本版無客戶分享頁，也不建立 Drive 公開權限。客戶只取得使用者下載或複製的文字。完整備份屬內部資料，含照片，請勿作為家長文件傳送。

移除照片只從家庭記錄移除，不會永久刪除 Drive 原始檔。覆寫前的 JSON 還原副本位於同一資料夾，可以從 Drive 下載 JSON，再由管理者協助取回；介面目前只直接支援 App 完整備份格式的還原。還原副本不替代獨立完整備份。

家庭 JSON 記錄 Drive version，儲存前檢查版本，並在可取得 ETag 時使用條件寫入。Google Drive 不是交易型資料庫，本版適合一位保姆單一工作階段編輯，不建議多台裝置同時寫同一家。未連線或權限到期時會保留目前畫面，不假報儲存成功。

目前照片支援 JPEG/PNG/WebP，每張最多 40 MB。原始照片不壓縮，列表只產生 400 像素 JPEG 縮圖。完整備份以 base64 包含原圖，約增加三分之一大小，大型相簿備份需要較多瀏覽器記憶體。

本版不會匯入真實家訪資料，範例為虛構。既有 Google 表單繼續保留，是否取代仍未決定。

## 驗證與部署

靜態輸出位於 `dist/`，無需套件安裝。執行 `node --test tests/*.test.mjs`，以及 `node --check dist/app.mjs`。設定靜態網站根目錄為 `dist`，使用 HTTPS。`robots` 排除索引僅為附加提示，不能代替授權；資料存取由 Google OAuth 控制，網站另由私人 Sites 存取控制保護。

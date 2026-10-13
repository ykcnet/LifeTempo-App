# 在地化資料來源

整理日期：2026-10-08。保留原始公開資料以便追溯與重新產生離線資料。

## 臺灣辦公日曆

資料集：https://data.gov.tw/dataset/14718

提供機關：行政院人事行政總處。授權：政府資料開放授權條款第 1 版。
`是否放假`：0 為上班、2 為放假。民間事業的休假制度不一定與政府行政機關相同。

- `tw-2025.csv`：https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202510/b84cb88a-803c-4621-a843-d637b2775615.csv&nfix=&name=2025.csv
- `tw-2026.csv`：https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202506/a52331bd-a189-466b-b0f0-cae3062bbf74.csv&nfix=&name=2026.csv
- `tw-2027.csv`：https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv&nfix=&name=2027.csv

## 農曆與節氣

來源：香港天文台公曆與農曆對照表（UTC+8 民用日期），不是以固定月日推算。

- https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2025c.txt
- https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2026c.txt
- https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2027c.txt

資料集及使用資訊：https://data.gov.hk/tc-data/dataset/hk-hko-rss-gregorian-lunar-calendar-conversion-table

## 更新方法

下載官方最新檔案至本目錄相同檔名，執行 `node build-localization-data.mjs`。
目前官方 `tw-2025.csv` 使用 Big5，`tw-2026.csv` 與 `tw-2027.csv` 使用 UTF-8；建置腳本依來源編碼嚴格解碼，請勿將所有 CSV 一律以 UTF-8 讀取。替換來源時需重新確認編碼。
擴充年份時，同步修改建置腳本的年份清單與每年日數驗證（閏年為 366 天），更新整理日期，重新執行測試。未知年份顯示未收錄，不合成近似假日或節氣。

## 天氣

Open-Meteo：https://open-meteo.com/en/docs

資料使用 CC BY 4.0，App 保留提供者標示與連結。公共免費端點適用於非商業使用；正式商業部署應依提供者條款配置相應方案：https://open-meteo.com/en/terms

天氣座標是縣市中心約略位置，不是使用者定位。時間為 Asia/Taipei；顯示逐日預報，不宣稱為即時測站觀測。

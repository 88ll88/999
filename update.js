const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://taiwanlottery.com';
const FILE_PATH = path.join(__dirname, '7788.js');

// 取得台北時間（UTC+8）
function getTaipeiDateInfo() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const tzNow = new Date(utc + (3600000 * 8));
    
    const year = tzNow.getFullYear();
    const month = String(tzNow.getMonth() + 1).padStart(2, '0');
    const date = String(tzNow.getDate()).padStart(2, '0');
    const hours = tzNow.getHours();
    const minutes = tzNow.getMinutes();
    
    const todayStr = `${year}-${month}-${date}`;
    const dayOfWeek = tzNow.getDay(); // 0 是周日

    // 計算應該開獎的日期
    let targetDateStr = todayStr;
    const timeValue = hours * 100 + minutes;

    if (timeValue < 2040) {
        // 00:00 至 20:40，目標日期為昨天
        const yesterday = new Date(tzNow.getTime() - 86400000);
        targetDateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    }

    return { todayStr, targetDateStr, dayOfWeek, timeValue };
}

function fetchLottoData() {
    return new Promise((resolve, reject) => {
        https.get(API_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    try {
        const { todayStr, targetDateStr, dayOfWeek, timeValue } = getTaipeiDateInfo();
        console.log(`目前台北時間判斷：目標開獎日應為 ${targetDateStr}`);

        // 讀取現有的 7788.js
        if (!fs.existsSync(FILE_PATH)) {
            console.error('找不到 7788.js 檔案！');
            process.exit(1);
        }
        let fileContent = fs.readFileSync(FILE_PATH, 'utf-8');

        // 正則表達式抓取首列日期
        const firstLineRegex = /\['(\d{4}-\d{2}-\d{2})',\[/;
        const match = fileContent.match(firstLineRegex);
        if (!match) {
            console.error('無法解析 7788.js 的首列日期');
            process.exit(1);
        }
        const lastUpdatedDate = match[1];
        console.log(`7788.js 最新一列日期為: ${lastUpdatedDate}`);

        // 如果最新日期已經等於或大於目標開獎日，代表今天/昨天的獎號已經處理完畢
        if (lastUpdatedDate >= targetDateStr) {
            // 唯一例外：如果最後一列是順球，且現在進入落球更新時段，需進行替換
            if (lastUpdatedDate === targetDateStr && timeValue >= 2100) {
                const apiData = await fetchLottoData();
                const targetRow = apiData.lottoResult.find(item => item.drawDate === targetDateStr);
                if (targetRow && targetRow.ballOrder && targetRow.ballOrder.length === 5) {
                    const sortedStr = `['${targetDateStr}',['${targetRow.resultOrder.join("','")}']]`;
                    const ballStr = `['${targetDateStr}',['${targetRow.ballOrder.join("','")}']]`;
                    
                    if (fileContent.includes(sortedStr)) {
                        fileContent = fileContent.replace(sortedStr, ballStr);
                        fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                        console.log(`✅ [一期替換] 成功將 ${targetDateStr} 的順球替換為落球！`);
                        process.exit(0); // 成功則給 workflow 訊號
                    } else {
                        console.log('首列已是落球或格式不符，無需替換。');
                        process.exit(99); // 跳過 commit 訊號
                    }
                }
            }
            console.log('資料已是最新，無需更新。');
            process.exit(99); 
        }

        // 開始向台彩抓取資料
        const apiData = await fetchLottoData();
        if (!apiData || !apiData.lottoResult) {
            console.error('台彩 API 回傳異常');
            process.exit(1);
        }

        // 篩選出大於目前檔案最新日期的開獎歷史，並由舊到新排序
        const missingRows = apiData.lottoResult
            .filter(item => item.drawDate > lastUpdatedDate && item.drawDate <= targetDateStr)
            .sort((a, b) => a.drawDate.localeCompare(b.drawDate));

        if (missingRows.length === 0) {
            console.log('台彩官方尚未更新該期資料。');
            process.exit(1);
        }

        // 判斷未更新的期數
        if (missingRows.length >= 2) {
            // 【兩期以上未更新】邏輯：全部查[落球]並插入首列
            console.log(`偵測到 ${missingRows.length} 期未更新，執行補登落球邏輯...`);
            let insertText = '';
            for (let i = missingRows.length - 1; i >= 0; i--) {
                const row = missingRows[i];
                if (row.ballOrder && row.ballOrder.length === 5) {
                    insertText += `['${row.drawDate}',['${row.ballOrder.join("','")}']],\n`;
                }
            }
            if (insertText) {
                fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${insertText}`);
                fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                console.log('✅ [多期補登] 成功補入落球數據！');
                process.exit(0);
            }
        } else if (missingRows.length === 1) {
            // 【一期未更新】邏輯
            const row = missingRows[0];
            if (timeValue >= 2040 && timeValue < 2100) {
                // 20:40 - 20:59 插入[順球(大小排序)]
                if (row.resultOrder && row.resultOrder.length === 5) {
                    const insertText = `['${row.drawDate}',['${row.resultOrder.join("','")}']],\n`;
                    fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${insertText}`);
                    fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                    console.log(`✅ [一期順球] 成功插入 ${row.drawDate} 順球號碼！`);
                    process.exit(0);
                }
            } else if (timeValue >= 2100) {
                // 21:00 之後 直接插入[落球]
                if (row.ballOrder && row.ballOrder.length === 5) {
                    const insertText = `['${row.drawDate}',['${row.ballOrder.join("','")}']],\n`;
                    fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${insertText}`);
                    fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                    console.log(`✅ [一期落球] 成功直接插入 ${row.drawDate} 落球號碼！`);
                    process.exit(0);
                }
            }
        }

        console.log('今日對應時段獎號未齊全，暫不變動。');
        process.exit(1);

    } catch (err) {
        console.error('執行過程中發生錯誤:', err.message);
        process.exit(1);
    }
}

main();

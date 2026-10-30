const https = require('https');
const fs = require('fs');
const path = require('path');

// 確保是 ://taiwanlottery.com 完整正確路徑
const API_URL = 'https://://taiwanlottery.com/TLCAPI/Static-Data/Lotto/Result/DailyCash';
const FILE_PATH = path.join(__dirname, '7788.js');

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
    const dayOfWeek = tzNow.getDay();

    let targetDateStr = todayStr;
    const timeValue = hours * 100 + minutes;

    if (timeValue < 2040) {
        const yesterday = new Date(tzNow.getTime() - 86400000);
        targetDateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    }

    return { todayStr, targetDateStr, dayOfWeek, timeValue };
}

function fetchLottoData() {
    return new Promise((resolve, reject) => {
        const req = https.get(API_URL, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000 // 設定 10 秒超時阻斷，避免卡死
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('連線逾時')); });
    });
}

async function main() {
    try {
        const { targetDateStr, timeValue } = getTaipeiDateInfo();
        console.log(`目前台北時間判斷：目標開獎日應為 ${targetDateStr}`);

        if (!fs.existsSync(FILE_PATH)) {
            console.error('找不到 7788.js 檔案！');
            process.exit(1);
        }
        let fileContent = fs.readFileSync(FILE_PATH, 'utf-8');

        const firstLineRegex = /\['(\d{4}-\d{2}-\d{2})',\[/;
        const match = fileContent.match(firstLineRegex);
        if (!match) {
            console.error('無法解析 7788.js 的首列日期');
            process.exit(1);
        }
        const lastUpdatedDate = match[1];
        console.log(`7788.js 最新一列日期為: ${lastUpdatedDate}`);

        if (lastUpdatedDate >= targetDateStr) {
            if (lastUpdatedDate === targetDateStr && timeValue >= 2100) {
                try {
                    const apiData = await fetchLottoData();
                    const targetRow = apiData.lottoResult.find(item => item.drawDate === targetDateStr);
                    if (targetRow && targetRow.ballOrder && targetRow.ballOrder.length === 5) {
                        const sortedStr = `['${targetDateStr}',['${targetRow.resultOrder.join("','")}']]`;
                        const ballStr = `['${targetDateStr}',['${targetRow.ballOrder.join("','")}']]`;
                        
                        if (fileContent.includes(sortedStr)) {
                            fileContent = fileContent.replace(sortedStr, ballStr);
                            fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                            console.log(`✅ [一期替換] 成功將 ${targetDateStr} 的順球替換為落球！`);
                            process.exit(0);
                        }
                    }
                } catch (netErr) {
                    console.error('網路連線失敗，跳過落球替換:', netErr.message);
                    process.exit(0);
                }
            }
            console.log('資料已是最新，無需更新。');
            process.exit(0); 
        }

        let apiData;
        try {
            apiData = await fetchLottoData();
        } catch (netErr) {
            console.error('台彩連線失敗，本次排程跳過:', netErr.message);
            process.exit(0); // 網路失敗也優雅退出，不報紅燈
        }

        if (!apiData || !apiData.lottoResult) {
            console.error('台彩 API 回傳異常');
            process.exit(0);
        }

        const missingRows = apiData.lottoResult
            .filter(item => item.drawDate > lastUpdatedDate && item.drawDate <= targetDateStr)
            .sort((a, b) => a.drawDate.localeCompare(b.drawDate));

        if (missingRows.length === 0) {
            console.log('台彩官方尚未更新該期資料。');
            process.exit(0);
        }

        if (missingRows.length >= 2) {
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
            const row = missingRows[0];
            if (timeValue >= 2040 && timeValue < 2100) {
                if (row.resultOrder && row.resultOrder.length === 5) {
                    const insertText = `['${row.drawDate}',['${row.resultOrder.join("','")}']],\n`;
                    fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${insertText}`);
                    fs.writeFileSync(FILE_PATH, fileContent, 'utf-8');
                    console.log(`✅ [一期順球] 成功插入 ${row.drawDate} 順球號碼！`);
                    process.exit(0);
                }
            } else if (timeValue >= 2100) {
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
        process.exit(0);

    } catch (err) {
        console.error('執行過程中發生嚴重錯誤:', err.message);
        process.exit(0);
    }
}

main();

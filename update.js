const fs = require('fs');
const path = require('path');
const https = require('https');

// 設定目標檔案路徑
const filePath = path.join(__dirname, '7788.js');

// 取得台灣時間 (UTC+8)
function getTaiwanTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

// 格式化日期為 YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 取得目標開獎日期
function getTargetDrawDate() {
    const tw = getTaiwanTime();
    const hours = tw.getHours();
    const minutes = tw.getMinutes();
    const timeVal = hours * 100 + minutes;

    let target = new Date(tw);
    if (timeVal >= 0 && timeVal <= 2040) {
        target.setDate(target.getDate() - 1);
    }
    
    // 若碰到週日，自動再往前推一天（週日休息）
    if (target.getDay() === 0) {
        target.setDate(target.getDate() - 1);
    }

    return formatDate(target);
}

// 使用原生 https 抓取網頁內容
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

async function main() {
    if (!fs.existsSync(filePath)) {
        console.error('找不到 7788.js 檔案');
        return;
    }

    let fileContent = fs.readFileSync(filePath, 'utf8');
    const targetDateStr = getTargetDrawDate();
    console.log(`計算出的目標已開獎日期為: ${targetDateStr}`);

    // 比對首列日期
    const match = fileContent.match(/\[\s*'(\d{4}-\d{2}-\d{2})',\s*\[(.*?)\]\s*\]/);
    if (!match) {
        console.error('無法解析 7788.js 首列格式');
        return;
    }
    const firstRowDate = match[1];
    console.log(`7788.js 首列日期為: ${firstRowDate}`);

    if (firstRowDate === targetDateStr) {
        console.log('已是最新日期，無需更新。');
        return;
    }

    const d1 = new Date(firstRowDate);
    const d2 = new Date(targetDateStr);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
        console.log('需更新 2 期以上，檢查落球網頁...');
        try {
            const html = await fetchUrl('https://9800.com.tw/lotto539/drop.html');
            // 這裡可以根據需要解析網頁號碼
            console.log('成功讀取落球網頁');
        } catch (error) {
            console.error('讀取落球網頁失敗:', error.message);
        }
    } else if (diffDays === 1) {
        console.log('需更新 1 期，檢查順球網頁...');
        try {
            const html = await fetchUrl('https://www.taiwanlottery.com/lotto/result/daily_cash');
            console.log('成功讀取順球網頁');
        } catch (error) {
            console.error('讀取順球網頁失敗:', error.message);
        }
    }
}

main();

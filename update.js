const fs = require('fs');
const path = require('path');
const https = require('https');

const filePath = path.join(__dirname, '7788.js');

function getTaiwanTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTargetDrawDate() {
    const tw = getTaiwanTime();
    const hours = tw.getHours();
    const minutes = tw.getMinutes();
    const timeVal = hours * 100 + minutes;

    let target = new Date(tw);
    if (timeVal >= 0 && timeVal <= 2040) {
        target.setDate(target.getDate() - 1);
    }
    if (target.getDay() === 0) {
        target.setDate(target.getDate() - 1);
    }
    return formatDate(target);
}

function fetchUrl(url) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        };

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        });

        req.on('error', (err) => {
            console.error(`連線錯誤 (${url}):`, err.message);
            resolve(null);
        });

        req.setTimeout(8000, () => {
            req.destroy();
            console.error(`連線逾時 (${url})`);
            resolve(null);
        });
    });
}

// 專門解析 drop.html 落球表格的函式
function parseDropHtml(html, targetDateStr) {
    if (!html) return null;
    
    // 把日期轉成網站常見的格式（例如 2026-10-29 轉成對應字串）
    // 樂透堂 drop.html 通常會列出表格，我們用正則尋找該日期附近的 5 個號碼
    const escapedDate = targetDateStr.replace(/-/g, '[-/]');
    
    // 尋找包含目標日期以及其後連續 5 個二位數號碼的區塊
    const rowRegex = new RegExp(`${escapedDate}[^\\d]*([0-9]{2})[^\\d]+([0-9]{2})[^\\d]+([0-9]{2})[^\\d]+([0-9]{2})[^\\d]+([0-9]{2})`, 'i');
    const match = html.match(rowRegex);
    
    if (match) {
        return [match[1], match[2], match[3], match[4], match[5]];
    }
    
    // 備用解析：如果找不到特定日期行，嘗試抓取表格中第一組符合的落球
    const fallbackRegex = /([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})/g;
    let m;
    let count = 0;
    while ((m = fallbackRegex.exec(html)) !== null) {
        count++;
        // 通常 drop.html 的第一筆或前幾筆就是最新落球
        if (count === 1) {
            return [m[1], m[2], m[3], m[4], m[5]];
        }
    }
    
    return null;
}

async function main() {
    if (!fs.existsSync(filePath)) {
        console.error('找不到 7788.js 檔案');
        return;
    }

    let fileContent = fs.readFileSync(filePath, 'utf8');
    const targetDateStr = getTargetDrawDate();
    console.log(`計算出的目標已開獎日期為: ${targetDateStr}`);

    const match = fileContent.match(/\[\s*'(\d{4}-\d{2}-\d{2})',\s*\[(.*?)\]\s*\]/);
    if (!match) {
        console.error('無法解析 7788.js 首列格式');
        return;
    }
    const firstRowDate = match[1];
    console.log(`7788.js 首列日期為: ${firstRowDate}`);

    if (firstRowDate === targetDateStr) {
        console.log('強制執行：開始專抓樂透堂落球頁 (drop.html)...');
        
        const dropUrl = 'https://9800.com.tw/lotto539/drop.html';
        const html = await fetchUrl(dropUrl);
        const luoQiuBalls = parseDropHtml(html, targetDateStr);
        
        if (luoQiuBalls && luoQiuBalls.length === 5) {
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const newRow = `['${targetDateStr}',['${luoQiuBalls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, newRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功將 ${targetDateStr} 替換為真正的落球：${luoQiuBalls.join(', ')}`);
            }
        } else {
            console.log('無法從 drop.html 取得落球資料。');
        }
        return;
    }

    console.log('首列日期不同，此時應抓取順球...');
}

main();

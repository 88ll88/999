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
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

// 抓取順球（大小順序）
function extractShunQiuBalls(html) {
    const regexList = [
        /今彩539\s*[:：]\s*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/,
        /今彩539[^\d]*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/
    ];
    for (let regex of regexList) {
        const match = html.match(regex);
        if (match && match[1]) {
            const balls = match[1].split(/[、,\s]+/).map(b => b.trim()).filter(b => b.length === 2);
            if (balls.length === 5) return balls;
        }
    }
    return null;
}

// 抓取落球（開出順序）
function extractLuoQiuBalls(html) {
    const regexList = [
        /開出順序\s*[:：]\s*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/,
        /落球\s*[:：]\s*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/
    ];
    for (let regex of regexList) {
        const match = html.match(regex);
        if (match && match[1]) {
            const balls = match[1].split(/[、,\s]+/).map(b => b.trim()).filter(b => b.length === 2);
            if (balls.length === 5) return balls;
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

    const targetMonthDay = targetDateStr.replace(/^\d{4}-0?/, '').replace('-', '/');
    const tw = getTaiwanTime();
    const currentHourMin = tw.getHours() * 100 + tw.getMinutes();

    // 狀況一：首列已經是今天，且時間已過 21:00，檢查並將順球替換為落球
    if (firstRowDate === targetDateStr) {
        if (currentHourMin >= 2100) {
            console.log('時間已過 21:00，開始尋找落球（開出順序）...');
            const luoQiuUrl = `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開出順序`;
            try {
                const html = await fetchUrl(luoQiuUrl);
                const luoQiuBalls = extractLuoQiuBalls(html);
                if (luoQiuBalls && luoQiuBalls.length === 5) {
                    const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
                    const newRow = `['${targetDateStr}',['${luoQiuBalls.join("','")}']]`;
                    if (fileContent.match(targetRowRegex)) {
                        fileContent = fileContent.replace(targetRowRegex, newRow);
                        fs.writeFileSync(filePath, fileContent, 'utf8');
                        console.log(`成功將 ${targetDateStr} 順球替換為落球（開出順序）：${luoQiuBalls.join(', ')}`);
                    }
                } else {
                    console.log('尚未在 Yahoo 找到落球資料，保持原樣。');
                }
            } catch (err) {
                console.error('抓取落球失敗:', err.message);
            }
        } else {
            console.log('首列已是最新日期，未到 21:00 暫不替換落球。');
        }
        return;
    }

    // 狀況二：首列還沒更新，先抓順球插入
    const shunQiuUrl = `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開獎號碼`;
    try {
        console.log('正在抓取順球（大小順序）...');
        const html = await fetchUrl(shunQiuUrl);
        const shunQiuBalls = extractShunQiuBalls(html);
        if (shunQiuBalls && shunQiuBalls.length === 5) {
            const newRow = `['${targetDateStr}',['${shunQiuBalls.join("','")}']],\n`;
            fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log(`成功插入 ${targetDateStr} 順球資料：${shunQiuBalls.join(', ')}`);
        } else {
            console.log('尚未抓到順球資料。');
        }
    } catch (err) {
        console.error('抓取順球失敗:', err.message);
    }
}

main();

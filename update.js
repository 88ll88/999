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

// 解析 Yahoo 內文中的今彩539號碼
function extract539Balls(html) {
    // 支援多種常見格式：
    // 格式1：今彩539：03、07、14、17、27
    // 格式2：今彩539開獎號碼為 03、07、14、17、27
    const regexList = [
        /今彩539\s*[:：]\s*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/,
        /今彩539[^\d]*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/
    ];

    for (let regex of regexList) {
        const match = html.match(regex);
        if (match && match[1]) {
            const balls = match[1].split(/[、,\s]+/).map(b => b.trim()).filter(b => b.length === 2);
            if (balls.length === 5) {
                return balls;
            }
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
        console.log('首列已是最新日期，無需重複更新。');
        return;
    }

    // 嘗試多個 Yahoo 新聞搜尋來源
    const targetMonthDay = targetDateStr.replace(/^\d{4}-0?/, '').replace('-', '/'); // 轉成 10/29 格式
    const urlsToTry = [
        `https://tw.news.yahoo.com/tag/今彩539`,
        `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開獎號碼`
    ];

    let foundBalls = null;

    for (let url of urlsToTry) {
        try {
            console.log(`正在嘗試抓取: ${url}`);
            const html = await fetchUrl(url);
            foundBalls = extract539Balls(html);
            if (foundBalls) {
                console.log(`成功抓取到號碼: ${foundBalls.join(', ')}`);
                break;
            }
        } catch (err) {
            console.error(`連線失敗 ${url}:`, err.message);
        }
    }

    if (foundBalls && foundBalls.length === 5) {
        const newRow = `['${targetDateStr}',['${foundBalls.join("','")}']],\n`;
        fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`成功將 ${targetDateStr} 的號碼寫入 7788.js 首列！`);
    } else {
        console.log('當前來源尚未更新或無法解析號碼，請稍後再試。');
    }
}

main();

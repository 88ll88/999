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

// 通用號碼解析器（適用多種 HTML 結構）
function parse539Balls(html) {
    // 尋找連續 5 個雙位數號碼
    const regexList = [
        /539[^\d]*([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})/,
        /今彩539[^\d]*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/,
        /([0-9]{2})[、,\s]+([0-9]{2})[、,\s]+([0-9]{2})[、,\s]+([0-9]{2})[、,\s]+([0-9]{2})/
    ];

    for (let regex of regexList) {
        const match = html.match(regex);
        if (match) {
            if (match[2] && match[3] && match[4] && match[5]) {
                return [match[1], match[2], match[3], match[4], match[5]];
            } else if (match[1]) {
                const balls = match[1].split(/[、,\s]+/).map(b => b.trim()).filter(b => b.length === 2);
                if (balls.length === 5) return balls;
            }
        }
    }
    return null;
}

// 輪流試用多個網站抓取號碼
async function fetchFromMultipleSources(targetDateStr, isLuoQiu = false) {
    const targetMonthDay = targetDateStr.replace(/^\d{4}-0?/, '').replace('-', '/');
    
    // 定義多個備援網站清單
    const sources = [
        {
            name: 'Pilio 彩券資訊網',
            url: 'https://pilio.idv.tw/lto539/'
        },
        {
            name: '樂透堂 539',
            url: isLuoQiu ? 'https://9800.com.tw/lotto539/drop.html' : 'https://9800.com.tw/lotto539/'
        },
        {
            name: 'Yahoo 新聞搜尋',
            url: `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+${isLuoQiu ? '開出順序' : '開獎號碼'}`
        }
    ];

    for (let src of sources) {
        try {
            console.log(`[嘗試來源] ${src.name}: ${src.url}`);
            const html = await fetchUrl(src.url);
            const balls = parse539Balls(html);
            if (balls && balls.length === 5) {
                console.log(`成功從 ${src.name} 抓到號碼: ${balls.join(', ')}`);
                return balls;
            }
        } catch (err) {
            console.error(`${src.name} 連線失敗: ${err.message}`);
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

    const tw = getTaiwanTime();
    const currentHourMin = tw.getHours() * 100 + tw.getMinutes();

    // 1. 首列已經是今天：21:00 後嘗試多網站抓落球並替換
    if (firstRowDate === targetDateStr) {
        if (currentHourMin >= 2100) {
            console.log('時間已過 21:00，開始跨網站尋找落球（開出順序）...');
            const luoQiuBalls = await fetchFromMultipleSources(targetDateStr, true);
            if (luoQiuBalls) {
                const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
                const newRow = `['${targetDateStr}',['${luoQiuBalls.join("','")}']]`;
                if (fileContent.match(targetRowRegex)) {
                    fileContent = fileContent.replace(targetRowRegex, newRow);
                    fs.writeFileSync(filePath, fileContent, 'utf8');
                    console.log(`成功替換 ${targetDateStr} 為落球：${luoQiuBalls.join(', ')}`);
                }
            } else {
                console.log('所有網站皆尚未釋出落球資料，保持原樣。');
            }
        } else {
            console.log('首列已是最新日期，未到 21:00 暫不替換落球。');
        }
        return;
    }

    // 2. 首列還沒更新：跨網站抓順球並插入
    console.log('開始跨網站尋找順球（大小順序）...');
    const shunQiuBalls = await fetchFromMultipleSources(targetDateStr, false);
    if (shunQiuBalls) {
        const newRow = `['${targetDateStr}',['${shunQiuBalls.join("','")}']],\n`;
        fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`成功插入 ${targetDateStr} 順球資料：${shunQiuBalls.join(', ')}`);
    } else {
        console.log('所有網站皆尚未抓到當日順球號碼。');
    }
}

main();

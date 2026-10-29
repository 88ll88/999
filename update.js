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

// 驗證 539 號碼範圍 (01-39)
function validate539Balls(balls) {
    if (!balls || balls.length !== 5) return null;
    for (let b of balls) {
        const num = parseInt(b, 10);
        if (isNaN(num) || num < 1 || num > 39) {
            return null;
        }
    }
    return balls;
}

// 解析網頁，並嚴格確認附近文字包含目標日期
function parseBallsWithDateCheck(html, targetDateStr) {
    if (!html) return null;

    // 將 2026-10-29 轉成各種常見網頁日期格式 (例如 2026-10-29, 10/29, 10月29日)
    const [year, month, day] = targetDateStr.split('-');
    const mTrim = month.replace(/^0/, '');
    const dTrim = day.replace(/^0/, '');
    
    const datePatterns = [
        targetDateStr,
        `${mTrim}/${dTrim}`,
        `${month}/${day}`,
        `${mTrim}月${dTrim}日`
    ];

    // 檢查網頁內是否包含目標日期
    let hasDateMatch = datePatterns.some(p => html.includes(p));
    if (!hasDateMatch) {
        console.log(`網頁內容中未找到對應的日期 (${targetDateStr})，跳過此來源。`);
        return null;
    }

    // 尋找符合 01-39 範圍的 5 個數字組合
    const regex = /([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const candidate = [match[1], match[2], match[3], match[4], match[5]];
        if (validate539Balls(candidate)) {
            return candidate;
        }
    }

    return null;
}

async function fetchVerifiedBalls(targetDateStr) {
    const targetMonthDay = targetDateStr.replace(/^\d{4}-0?/, '').replace('-', '/');
    
    const sources = [
        {
            name: 'Pilio 彩券資訊網',
            url: 'https://pilio.idv.tw/lto539/'
        },
        {
            name: '台灣彩券官方網站',
            url: 'https://www.taiwanlottery.com.tw/'
        },
        {
            name: 'Yahoo 新聞搜尋',
            url: `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開獎號碼`
        }
    ];

    for (let src of sources) {
        console.log(`[嘗試來源] ${src.name}: ${src.url}`);
        const html = await fetchUrl(src.url);
        const balls = parseBallsWithDateCheck(html, targetDateStr);
        if (balls) {
            console.log(`成功通過日期與號碼驗證，自 ${src.name} 取得: ${balls.join(', ')}`);
            return balls;
        }
        console.log(`${src.name} 未能通過日期或號碼驗證，換下一個...`);
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
        console.log('強制執行：開始比對日期並抓取正確號碼替換首列...');
        const balls = await fetchVerifiedBalls(targetDateStr);
        if (balls) {
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const newRow = `['${targetDateStr}',['${balls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, newRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功將 ${targetDateStr} 更新為驗證無誤的號碼：${balls.join(', ')}`);
            }
        } else {
            console.log('所有來源皆未找到符合當日日期的正確號碼。');
        }
        return;
    }

    console.log('首列日期不同，等待更新...');
}

main();

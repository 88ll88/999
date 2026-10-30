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

// 嚴格數字範圍驗證：5個號碼必須全部在 01 到 39 之間，且不能重複
function validate539Balls(balls) {
    if (!balls || balls.length !== 5) return null;
    const numSet = new Set();
    for (let b of balls) {
        const num = parseInt(b, 10);
        if (isNaN(num) || num < 1 || num > 39) return null;
        if (numSet.has(b)) return null; // 539 號碼不重複
        numSet.add(b);
    }
    return balls;
}

// 改用其他乾淨的彩券資訊頁面（徹底排除舊網站）
async function fetchFromAlternativeSource(targetDateStr) {
    const [year, month, day] = targetDateStr.split('-');
    
    // 這裡我們改用另一個記錄開獎結果的公開網頁介面
    const targetUrl = `https://www.pilio.idv.tw/lto539/lto.asp?y=${year}&m=${month}&d=${day}`;
    console.log(`[全新嘗試] ${targetUrl}`);
    
    const html = await fetchUrl(targetUrl);
    if (!html) return null;

    // 用更嚴格的區塊正則尋找 539 開獎號碼
    const regex = /<td[^>]*>([0-3][0-9])<\/td>\s*<td[^>]*>([0-3][0-9])<\/td>\s*<td[^>]*>([0-3][0-9])<\/td>\s*<td[^>]*>([0-3][0-9])<\/td>\s*<td[^>]*>([0-3][0-9])<\/td>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const candidate = [match[1], match[2], match[3], match[4], match[5]];
        const valid = validate539Balls(candidate);
        if (valid) {
            return valid;
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
        console.log('強制執行：使用新來源抓取精準落球並替換首列...');
        const balls = await fetchFromAlternativeSource(targetDateStr);
        if (balls) {
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const newRow = `['${targetDateStr}',['${balls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, newRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功更新為正確落球：${balls.join(', ')}`);
            }
        } else {
            console.log('此來源尚未有正確格式的資料。');
        }
        return;
    }

    console.log('首列日期不同，等待更新...');
}

main();

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

// 嚴格驗證：必須剛好 5 個號碼，且每個號碼必須在 01 到 39 之間
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

// 全新更換的乾淨資料源（排除會亂寫或錯棚的搜尋引擎）
async function fetchCleanAndReliableBalls(targetDateStr) {
    const [year, month, day] = targetDateStr.split('-');
    
    // 這裡換成專門提供歷史開獎數據與順序的乾淨頁面
    const sources = [
        {
            name: 'Pilio 彩券詳細開獎頁',
            url: `https://pilio.idv.tw/lto539/lto.asp?y=${year}&m=${month}&d=${day}`
        },
        {
            name: 'Pilio 彩券資訊網主站',
            url: 'https://pilio.idv.tw/lto539/'
        }
    ];

    for (let src of sources) {
        console.log(`[嘗試新來源] ${src.name}: ${src.url}`);
        const html = await fetchUrl(src.url);
        if (!html) continue;

        // 尋找網頁中符合 539 格式的 5 個號碼
        const regex = /([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])[^0-9]+([0-3][0-9])/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const candidate = [match[1], match[2], match[3], match[4], match[5]];
            const valid = validate539Balls(candidate);
            if (valid) {
                console.log(`成功從 ${src.name} 取得合法號碼: ${valid.join(', ')}`);
                return valid;
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
        console.log('強制執行：使用乾淨的新資料源抓取落球並替換首列...');
        const balls = await fetchCleanAndReliableBalls(targetDateStr);
        if (balls) {
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const newRow = `['${targetDateStr}',['${balls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, newRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功將 ${targetDateStr} 替換為乾淨正確的落球：${balls.join(', ')}`);
            }
        } else {
            console.log('新資料源尚未釋出該日資料。');
        }
        return;
    }

    console.log('首列日期不同，等待更新...');
}

main();

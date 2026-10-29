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

        req.setTimeout(6000, () => {
            req.destroy();
            console.error(`連線逾時 (${url})`);
            resolve(null);
        });
    });
}

function parse539Balls(html) {
    if (!html) return null;
    const regexList = [
        /539[^\d]*([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})/,
        /今彩539[^\d]*([0-9]{2}(?:[、,\s]+[0-9]{2}){4})/,
        /([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})[^\d]+([0-9]{2})/
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

async function fetchFromMultipleWebsites(targetDateStr) {
    const targetMonthDay = targetDateStr.replace(/^\d{4}-0?/, '').replace('-', '/');
    
    // 建立包含多個不同網站與搜尋來源的清單（完全不使用 9800）
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
            name: 'Yahoo 新聞搜尋 (開出順序)',
            url: `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開出順序`
        },
        {
            name: 'Yahoo 新聞搜尋 (開獎號碼)',
            url: `https://tw.news.search.yahoo.com/search?p=今彩539+${targetMonthDay}+開獎號碼`
        }
    ];

    for (let src of sources) {
        console.log(`[嘗試來源] ${src.name}: ${src.url}`);
        const html = await fetchUrl(src.url);
        const balls = parse539Balls(html);
        if (balls && balls.length === 5) {
            console.log(`成功從 ${src.name} 抓到號碼: ${balls.join(', ')}`);
            return balls;
        }
        console.log(`${src.name} 未能取得有效號碼，換下一個網站...`);
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
        console.log('強制執行：開始透過多個備援網站尋找並替換首列號碼...');
        const balls = await fetchFromMultipleWebsites(targetDateStr);
        if (balls) {
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const newRow = `['${targetDateStr}',['${balls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, newRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功將 ${targetDateStr} 更新為：${balls.join(', ')}`);
            }
        } else {
            console.log('所有備援網站皆尚未抓到號碼。');
        }
        return;
    }

    console.log('首列日期不同，等待更新...');
}

main();

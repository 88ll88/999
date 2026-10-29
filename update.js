const fs = require('fs');
const path = require('path');
const https = require('https');

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

// 依據時間與週日判斷已開獎日期
function getTargetDrawDate() {
    const tw = getTaiwanTime();
    const hours = tw.getHours();
    const minutes = tw.getMinutes();
    const timeVal = hours * 100 + minutes;

    let target = new Date(tw);
    // 00:00 至 20:40 算昨天的開獎
    if (timeVal >= 0 && timeVal <= 2040) {
        target.setDate(target.getDate() - 1);
    }
    // 周日休息不開獎，自動再往前推一天
    if (target.getDay() === 0) {
        target.setDate(target.getDate() - 1);
    }

    return formatDate(target);
}

// 使用原生 https 抓取 Yahoo 網頁內容 (加上 User-Agent 模擬瀏覽器)
function fetchYahooUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

// 從 Yahoo 新聞搜尋結果解析落球或順球資料
function parseYahooBalls(html, targetDate) {
    // 這裡預留從 Yahoo 新聞 HTML 中擷取當日 539 號碼的邏輯
    // 格式範例：{ date: targetDate, balls: ['35', '13', '11', '19', '06'] }
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

    // 讀取 7788.js 首列日期
    const match = fileContent.match(/\[\s*'(\d{4}-\d{2}-\d{2})',\s*\[(.*?)\]\s*\]/);
    if (!match) {
        console.error('無法解析 7788.js 首列格式');
        return;
    }
    const firstRowDate = match[1];
    console.log(`7788.js 首列日期為: ${firstRowDate}`);

    // Yahoo 新聞搜尋網址 (以 539 開獎號碼為關鍵字)
    const yahooSearchUrl = `https://tw.search.yahoo.com/search?p=539+開獎號碼+${targetDateStr}`;

    if (firstRowDate === targetDateStr) {
        console.log('首列已是最新日期，檢查是否需將順球替換為落球...');
        
        // 21:00 以後檢查並將首列順球替換為落球
        const tw = getTaiwanTime();
        const currentHourMin = tw.getHours() * 100 + tw.getMinutes();
        if (currentHourMin >= 2100) {
            try {
                console.log('正在從 Yahoo 新聞搜尋當日落球...');
                const html = await fetchYahooUrl(yahooSearchUrl);
                const luoQiuData = parseYahooBalls(html, targetDateStr);
                if (luoQiuData && luoQiuData.balls.length === 5) {
                    const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
                    const newRow = `['${targetDateStr}',['${luoQiuData.balls.join("','")}']]`;
                    if (fileContent.match(targetRowRegex)) {
                        fileContent = fileContent.replace(targetRowRegex, newRow);
                        fs.writeFileSync(filePath, fileContent, 'utf8');
                        console.log(`成功從 Yahoo 新聞將 ${targetDateStr} 順球替換為落球`);
                    }
                }
            } catch (err) {
                console.error('從 Yahoo 更新落球失敗:', err.message);
            }
        }
        return;
    }

    const d1 = new Date(firstRowDate);
    const d2 = new Date(targetDateStr);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    if (diffDays >= 1) {
        console.log('開始從 Yahoo 新聞搜尋並抓取號碼...');
        try {
            const html = await fetchYahooUrl(yahooSearchUrl);
            const yahooData = parseYahooBalls(html, targetDateStr);
            if (yahooData && yahooData.balls.length === 5) {
                const newRow = `['${yahooData.date}',['${yahooData.balls.join("','")}']],\n`;
                fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功從 Yahoo 新聞插入 ${yahooData.date} 資料`);
            }
        } catch (err) {
            console.error('從 Yahoo 抓取資料失敗:', err.message);
        }
    }
}

main();

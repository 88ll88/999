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

// 從 Yahoo 新聞 HTML 中精準抓取今彩539號碼
function parseYahooBalls(html, targetDate) {
    // 尋找包含「今彩539」與號碼的文字區段
    // 範例格式如畫面上的：今彩539：03、07、14、17、27
    const regex = /今彩539\s*[:：]\s*([0-9、]+)/;
    const match = html.match(regex);
    
    if (match && match[1]) {
        // 將「03、07、14」切切割成陣列 ['03', '07', '14', '17', '27']
        const balls = match[1].split('、').map(b => b.trim()).filter(b => b.length > 0);
        if (balls.length === 5) {
            return { date: targetDate, balls: balls };
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

    // Yahoo 新聞搜尋或相關報導網址
    const yahooUrl = `https://tw.search.yahoo.com/search?p=威力彩開獎號碼+今彩539+${targetDateStr}`;

    if (firstRowDate === targetDateStr) {
        console.log('首列已是最新日期，檢查是否需將順球替換為落球...');
        
        const tw = getTaiwanTime();
        const currentHourMin = tw.getHours() * 100 + tw.getMinutes();
        if (currentHourMin >= 2100) {
            try {
                const html = await fetchYahooUrl(yahooUrl);
                const luoQiuData = parseYahooBalls(html, targetDateStr);
                if (luoQiuData && luoQiuData.balls.length === 5) {
                    const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
                    const newRow = `['${targetDateStr}',['${luoQiuData.balls.join("','")}']]`;
                    if (fileContent.match(targetRowRegex)) {
                        fileContent = fileContent.replace(targetRowRegex, newRow);
                        fs.writeFileSync(filePath, fileContent, 'utf8');
                        console.log(`成功從 Yahoo 將 ${targetDateStr} 順球替換為落球`);
                    }
                }
            } catch (err) {
                console.error('更新落球失敗:', err.message);
            }
        }
        return;
    }

    const d1 = new Date(firstRowDate);
    const d2 = new Date(targetDateStr);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    if (diffDays >= 1) {
        console.log('開始從 Yahoo 抓取開獎號碼...');
        try {
            const html = await fetchYahooUrl(yahooUrl);
            const yahooData = parseYahooBalls(html, targetDateStr);
            if (yahooData && yahooData.balls.length === 5) {
                const newRow = `['${yahooData.date}',['${yahooData.balls.join("','")}']],\n`;
                fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功從 Yahoo 插入 ${yahooData.date} 資料`);
            } else {
                console.log('尚未在 Yahoo 抓到完整的 5 顆號碼');
            }
        } catch (err) {
            console.error('抓取失敗:', err.message);
        }
    }
}

main();

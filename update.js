const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// 設定目標檔案路徑
const filePath = path.join(__dirname, '7788.js');

// 取得台灣時間 (UTC+8) 的當前日期與時間
function getTaiwanTime() {
    const now = new Date();
    // 轉換為台灣時間
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const twTime = new Date(utc + (3600000 * 8));
    return twTime;
}

// 格式化日期為 YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 取得已開獎日期（根據時間點判斷）
function getTargetDrawDate() {
    const tw = getTaiwanTime();
    const hours = tw.getHours();
    const minutes = tw.getMinutes();
    const currentTimeVal = hours * 100 + minutes;

    let targetDate = new Date(tw);
    // 00:00 至 20:40 之間，已開獎日期算昨天
    if (currentTimeVal >= 0 && currentTimeVal <= 2040) {
        targetDate.setDate(targetDate.getDate() - 1);
    }
    
    // 檢查是否為週日（週日休息不開獎，若今天是週日則往前推算）
    if (targetDate.getDay() === 0) {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    return formatDate(targetDate);
}

// 抓取 9800.com.tw 順球 (Daily Cash 官方或 9800)
async function fetchShunQiu(targetDate) {
    try {
        // 示範以台灣彩券官方 API 或 9800 抓取今彩539順球
        // 實務上可依照 9800.com.tw 結構解析
        const url = 'https://www.taiwanlottery.com/lotto/result/daily_cash';
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // 這裡需配合台彩或 9800 實際 DOM 結構抓取「順球」陣列
        // 假設順球抓出來為陣列: ['01', '02', '03', '04', '05']
        let balls = [];
        // TODO: 根據實際網頁結構填入解析選擇器
        
        return balls;
    } catch (error) {
        console.error('抓取順球失敗:', error.message);
        return null;
    }
}

// 抓取 9800.com.tw/lotto539/drop.html 落球
async function fetchLuoQiu(targetDate) {
    try {
        const url = 'https://9800.com.tw/lotto539/drop.html';
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        let foundDate = '';
        let balls = [];

        // 尋找對應日期的落球資料
        // TODO: 依照 9800 drop.html 實際表格結構提取
        
        return { date: foundDate, balls: balls };
    } catch (error) {
        console.error('抓取落球失敗:', error.message);
        return null;
    }
}

async function main() {
    if (!fs.existsSync(filePath)) {
        console.error('找不到 7788.js 檔案');
        return;
    }

    let fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 取得目標開獎日期
    const targetDateStr = getTargetDrawDate();
    console.log(`計算出的目標已開獎日期為: ${targetDateStr}`);

    // 解析現有的 7788.js 內容取得首列日期
    // 假設開頭格式為: ['2026-10-28',['35','13','11','19','06']],
    const match = fileContent.match(/\[\s*'(\d{4}-\d{2}-\d{2})',\s*\[(.*?)\]\s*\]/);
    if (!match) {
        console.error('無法解析 7788.js 首列格式');
        return;
    }
    const firstRowDate = match[1];
    console.log(`7788.js 首列日期為: ${firstRowDate}`);

    // 邏輯判斷
    if (firstRowDate === targetDateStr) {
        console.log('已是最新日期，無需更新。');
        return;
    }

    // 計算落後天數或期數
    const d1 = new Date(firstRowDate);
    const d2 = new Date(targetDateStr);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
        console.log('需更新 2 期以上，從 drop.html 抓取落球...');
        const result = await fetchLuoQiu(targetDateStr);
        if (result && result.balls.length > 0) {
            const newRow = `['${result.date}',['${result.balls.join("','")}']],\n`;
            fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log(`成功補上 ${result.date} 落球資料`);
        }
    } else if (diffDays === 1) {
        console.log('需更新 1 期，先抓取順球...');
        const shunQiuBalls = await fetchShunQiu(targetDateStr);
        if (shunQiuBalls && shunQiuBalls.length > 0) {
            // 先插入順球
            const newRow = `['${targetDateStr',['${shunQiuBalls.join("','")}']],\n`;
            fileContent = fileContent.replace('var 7788 = [\n', `var 7788 = [\n${newRow}`);
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log(`已暫時插入 ${targetDateStr} 順球資料`);
        }
    }

    // 後續步驟：若時間已過 21:00，檢查並將順球替換為落球
    const tw = getTaiwanTime();
    if (tw.getHours() >= 21) {
        console.log('時間已過 21:00，開始檢查並替換為落球...');
        const dropResult = await fetchLuoQiu(targetDateStr);
        if (dropResult && dropResult.balls.length > 0) {
            // 將對應日期的順球替換為落球
            const targetRowRegex = new RegExp(`\\['${targetDateStr}',\\s*\\[.*?\\]\\]`, 'g');
            const correctedRow = `['${targetDateStr}',['${dropResult.balls.join("','")}']]`;
            if (fileContent.match(targetRowRegex)) {
                fileContent = fileContent.replace(targetRowRegex, correctedRow);
                fs.writeFileSync(filePath, fileContent, 'utf8');
                console.log(`成功將 ${targetDateStr} 順球替換為落球`);
            }
        }
    }
}

main();

const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const LOTTO_URL = "https://9800.com.tw";
const JS_FILE_PATH = "./7788.js";

function addDays(dateStr, days) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function getTaiwanTodayStr() {
    const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('zh-TW', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

function isSunday(dateStr) {
    return new Date(dateStr).getDay() === 0;
}

async function run() {
    try {
        const todayStr = getTaiwanTodayStr();
        console.log(`[系統通知] 當前台灣日期：${todayStr}`);

        if (!fs.existsSync(JS_FILE_PATH)) {
            console.error("錯誤：找不到 7788.js 檔案！");
            return;
        }
        let jsContent = fs.readFileSync(JS_FILE_PATH, 'utf-8');

        // 精準抓取目前 7788.js 首列的日期
        const dateRegex = /['"](\d{4}-\d{2}-\d{2})['"]/;
        const match = jsContent.match(dateRegex);
        if (!match) {
            console.error("錯誤：7788.js 裡找不到任何日期格式！");
            return;
        }

        const latestDateInJs = match[1];
        console.log(`[步驟驗證] 7788.js 目前首列最新日期是：${latestDateInJs}`);

        // 精準定位首列整行內容，用於步驟 3 的落球替換
        const firstRowRegex = /(\[\s*['"]\d{4}-\d{2}-\d{2}['"]\s*,\s*\[[\s\S]*?\]\s*\]\s*,)/;
        const firstRowMatch = jsContent.match(firstRowRegex);
        const firstRowString = firstRowMatch ? firstRowMatch[1] : null;

        let nextTargetDate = addDays(latestDateInJs, 1);
        if (isSunday(nextTargetDate)) {
            nextTargetDate = addDays(nextTargetDate, 1);
        }

        console.log(`正在前往樂透堂抓取 ${nextTargetDate} 的網頁資料 (設定 15 秒超時)...`);
        
        // 偽裝成一般的真實 Chrome 瀏覽器連線，並加上 15 秒強制超時防止卡死
        const response = await axios.get(LOTTO_URL, { 
            timeout: 15000, 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            } 
        });
        
        const $ = cheerio.load(response.data);

        let targetTr = null;
        $('table tr').each((i, row) => {
            const rowText = $(row).text();
            if (rowText.includes(nextTargetDate)) {
                targetTr = row;
            }
        });

        if (!targetTr) {
            console.log(`[通知] 樂透堂網頁上目前還找不到 ${nextTargetDate} 的開獎紀錄。今日提早結束。`);
            return;
        }

        const tds = $(targetTr).find('td');
        
        // 樂透堂欄位：期次(0)、開獎日期(1)、週幾(2)、落球序(3)、順序排序(4)
        // 使用 .filter 清除多餘空格，確保只有 5 個乾淨號碼
        const rawDrop = $(tds.get(3)).text().trim().split(/[\s,]+/).filter(n => n.length > 0);
        const rawOrder = $(tds.get(4)).text().trim().split(/[\s,]+/).filter(n => n.length > 0);

        if (rawOrder.length !== 5) {
            console.error(`[異常] 找到的號碼數量不是 5 顆，停止執行。`);
            return;
        }

        // 嚴格確保您要求的「無空格」緊密字串格式
        const dropBallsStr = `[${rawDrop.map(n => `'${n}'`).join(',')}]`;
        const orderBallsStr = `[${rawOrder.map(n => `'${n}'`).join(',')}]`;

        // ==========================================
        // 【邏輯 1】：補更之前的落球
        // ==========================================
        if (nextTargetDate !== todayStr) {
            console.log(`[執行步驟 1] 發現歷史落後，正在直接補更 ${nextTargetDate} 的【落球】。`);
            const newRowStr = `['${nextTargetDate}',${dropBallsStr}],`;
            let newJsContent = jsContent.replace(/(\[\s*\n?)/, `$1  ${newRowStr}\n`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 補更完畢！`);
            return;
        }

        // ==========================================
        // 【邏輯 2 與 3】：處理今天的最新開獎
        // ==========================================
        if (latestDateInJs !== todayStr) {
            // 20:40 第一棒：插入【順球】
            console.log(`[執行步驟 2] 偵測到今日新開獎！正在置入 ${todayStr} 的【順球】。`);
            const newRowStr = `['${todayStr}',${orderBallsStr}],`;
            let newJsContent = jsContent.replace(/(\[\s*\n?)/, `$1  ${newRowStr}\n`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日新開獎【順球】已成功插入首列。`);
        } else {
            // 21:30 第二棒：把今天的順球整列，直接覆蓋替換成【落球】
            if (!firstRowString) {
                console.error("錯誤：無法定位舊首列，無法進行覆蓋。");
                return;
            }
            console.log(`[執行步驟 3] 正在將今日首列的順球覆蓋替換為最新【落球】。`);
            const targetDropRowStr = `['${todayStr}',${dropBallsStr}],`;
            let newJsContent = jsContent.replace(firstRowString, targetDropRowStr);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日首列已完美替換為【落球】！`);
        }

    } catch (error) {
        console.error("自動更新過程中發生系統錯誤:", error.message);
    }
}

run();

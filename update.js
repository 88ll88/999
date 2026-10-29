const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 539 自動更新`);

    // 1. 計算當前台灣時間與開獎基準日期（20:40 切分邊界）
    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const hours = twTime.getUTCHours();
    const minutes = twTime.getUTCMinutes();
    const currentMinutes = (hours * 60) + minutes;

    let calcDate = new Date(twTime);
    if (currentMinutes < (20 * 60 + 40)) {
        calcDate.setDate(calcDate.getDate() - 1); // 20:40 前算昨天的
    }
    if (calcDate.getUTCDay() === 0) {
        calcDate.setDate(calcDate.getDate() - 1); // 週日休息
    }

    const yyyy = calcDate.getUTCFullYear();
    const mm = String(calcDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(calcDate.getUTCDate()).padStart(2, '0');
    const targetDate = `${yyyy}-${mm}-${dd}`; 

    // 2. 讀取與解析 7788.js 首列
    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        process.exit(1);
    }

    const firstRowMatch = content.match(/\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[/);
    if (!firstRowMatch) process.exit(1);
    const topDateStr = firstRowMatch[1];

    console.log(`[系統通知] 預計已開獎日期: ${targetDate}, 檔案目前首列日期: ${topDateStr}`);

    // 【步驟 3 邏輯】：首列日期已等於今天，且到 21:00 執行落球覆蓋
    if (topDateStr === targetDate) {
        if (currentMinutes >= (21 * 60)) {
            console.log("今日首列已存在，進入 21:00 落球完全覆蓋替換階段...");
            const balls = await fetchFrom9800Web(targetDate, 'luo');
            if (balls) {
                const targetDropRow = `['${targetDate}',['${balls.join("','")}']],`;
                const firstRowRegex = /(\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[[\s\S]*?\]\s*\]\s*,)/;
                const matchRow = content.match(firstRowRegex);
                if (matchRow) {
                    if (matchRow[1].replace(/\s/g, '') === targetDropRow.replace(/\s/g, '')) {
                        console.log("今日首列【落球】已是最新狀態，安全退出。");
                        return;
                    }
                    let newContent = content.replace(matchRow[1], targetDropRow);
                    fs.writeFileSync('./7788.js', newContent, 'utf8');
                    console.log("今日落球成功覆蓋替換！");
                }
            }
        } else {
            console.log("今天順球已更新，尚未到 21:00 落球更替時間。");
        }
        return;
    }

    // 計算相差天數判定狀況
    function getDaysDiff(d1, d2) {
        const date1 = new Date(d1 + "T00:00:00+08:00");
        const date2 = new Date(d2 + "T00:00:00+08:00");
        return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
    }

    let dateToUpdate = "";
    let mode = "luo";

    if (getDaysDiff(topDateStr, targetDate) >= 2 || (topDateStr < targetDate && getDaysDiff(topDateStr, targetDate) === 2 && new Date(targetDate + "T00:00:00+08:00").getDay() === 1)) {
        // 【步驟 1 邏輯】：落後多期，強追歷史落球補課
        let d = new Date(topDateStr + "T00:00:00+08:00");
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        dateToUpdate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        mode = "luo";
        console.log(`[步驟 1] 自動補齊歷史落球，目標日期: ${dateToUpdate}`);
    } else {
        // 【步驟 2 邏輯】：落後 1 期更新
        dateToUpdate = targetDate;
        mode = currentMinutes < (21 * 60) ? "shun" : "luo";
        console.log(`[步驟 2] 更新今日新期，目標日期: ${dateToUpdate}，模式: ${mode}`);
    }

    const balls = await fetchFrom9800Web(dateToUpdate, mode);
    if (!balls) {
        console.log("9800 網頁號碼尚未就緒或比對失敗，放棄寫入。");
        return;
    }

    // 嚴格遵守無空格緊密結構
    const newRowStr = `['${dateToUpdate}',['${balls.join("','")}']],`;
    let newContent = content.replace(/(var\s+7788\s*=\s*\[\s*\n?)/, `$1${newRowStr}\n`);
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log(`[成功] 緊密資料已成功置入首列: ${newRowStr}`);
}

async function fetchFrom9800Web(dateStr, mode) {
    try {
        // 100% 直連 9800 樂透堂網頁純文字
        const res = await fetch('https://9800.com.tw', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await res.text();

        const dateIdx = html.indexOf(dateStr);
        if (dateIdx === -1) return null;

        // 切出關鍵文字區塊
        const subText = html.substring(dateIdx, dateIdx + 500);

        // 🌟 核心修正：改用精準匹配彩球數字的正則，徹底解決 &nbsp; 導致看漏球號的漏洞！
        const matches = subText.match(/(0[1-9]|[12][0-9]|3[0-9])/g);
        if (!matches) return null;

        const [y, m, d] = dateStr.split('-');
        let validNums = [];
        for (let num of matches) {
            // 排除了與日期年月日重複的數字干擾
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            const cleanSet = validNums.slice(0, 10);
            // 第四欄（落球）取前面 5 顆，第五欄（順球）取後面 5 顆
            return mode === 'shun' ? cleanSet.slice(-5) : cleanSet.slice(0, 5);
        }
    } catch (e) {
        console.error('9800 網頁讀取異常:', e.message);
    }
    return null;
}

main();

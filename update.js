const fs = require('fs');

async function main() {
    // 1. 取得台灣時間與已開獎日期
    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const hours = twTime.getUTCHours();
    const minutes = twTime.getUTCMinutes();
    const currentMinutes = (hours * 60) + minutes;

    let calcDate = new Date(twTime);
    // 時間是 00:00 至 20:40，則已開獎日期就是昨天
    if (currentMinutes < (20 * 60 + 40)) {
        calcDate.setDate(calcDate.getDate() - 1);
    }
    // 遇週日再往前推一天（週日休息）
    if (calcDate.getUTCDay() === 0) {
        calcDate.setDate(calcDate.getDate() - 1);
    }

    const yyyy = calcDate.getUTCFullYear();
    const mm = String(calcDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(calcDate.getUTCDate()).padStart(2, '0');
    const targetDate = `${yyyy}-${mm}-${dd}`; // 預計要更新的開獎日期

    // 2. 讀取本地 7788.js
    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        process.exit(1);
    }

    // 抓取現有 7788.js 首列日期
    const firstRowMatch = content.match(/\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[/);
    if (!firstRowMatch) process.exit(1);
    const topDateStr = firstRowMatch[1];

    console.log(`[系統通知] 預計已開獎日期: ${targetDate}, 檔案目前首列日期: ${topDateStr}`);

    // 比對首列日期與已開獎日期
    if (topDateStr === targetDate) {
        // 如果首列日期已經是今天，且時間在 21:00 以後，去台彩官網拿最精準的「落球序」完全覆蓋
        if (currentMinutes >= (21 * 60)) { 
            console.log("今日首列已存在（為順球），進入 21:00 落球完全覆蓋替換階段...");
            const balls = await fetchFromTaiwanLottery(targetDate, 'luo');
            if (balls) {
                const targetDropRow = `['${targetDate}',['${balls.join("','")}']],`;
                const firstRowRegex = /(\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[[\s\S]*?\]\s*\]\s*,)/;
                const matchRow = content.match(firstRowRegex);
                if (matchRow) {
                    if (matchRow[1].replace(/\s/g, '') === targetDropRow.replace(/\s/g, '')) {
                        console.log("今日首列【落球】已是最新且完全一致，安全退出。");
                        return;
                    }
                    let newContent = content.replace(matchRow[1], targetDropRow);
                    fs.writeFileSync('./7788.js', newContent, 'utf8');
                    console.log("落球完全覆蓋替換成功！");
                }
            }
        } else {
            console.log("今天順球已更新成功，尚未到 21:00 落球更替時間。");
        }
        return;
    }

    // 計算落後幾期
    function getDaysDiff(d1, d2) {
        const date1 = new Date(d1 + "T00:00:00+08:00");
        const date2 = new Date(d2 + "T00:00:00+08:00");
        return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
    }

    let dateToUpdate = "";
    let mode = "luo";

    if (getDaysDiff(topDateStr, targetDate) >= 2 || (topDateStr < targetDate && getDaysDiff(topDateStr, targetDate) === 2 && new Date(targetDate + "T00:00:00+08:00").getDay() === 1)) {
        // 狀況 1：落後 2 期以上 -> 自動補齊歷史「落球」補課
        let d = new Date(topDateStr + "T00:00:00+08:00");
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateToUpdate = `${y}-${m}-${day}`;
        mode = "luo";
        console.log(`[步驟 1 觸發] 需更新 2 期以上，自動補齊歷史落球日期: ${dateToUpdate}`);
    } else {
        // 狀況 2：落後 1 期
        dateToUpdate = targetDate;
        mode = currentMinutes < (21 * 60) ? "shun" : "luo";
        console.log(`[步驟 2 觸發] 需更新 1 期，日期: ${dateToUpdate}，優先模式: ${mode}`);
    }

    const balls = await fetchFromTaiwanLottery(dateToUpdate, mode);
    if (!balls) {
        console.log("台灣彩券官方網站數據尚未就緒或解析失敗，放棄寫入。");
        return;
    }

    // 嚴格落實：不得有空格緊密緊湊格式
    const newRowStr = `['${dateToUpdate}',['${balls.join("','")}']],`;
    let newContent = content.replace(/(var\s+7788\s*=\s*\[\s*\n?)/, `$1${newRowStr}\n`);
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log(`[成功] 緊密資料已成功置入首列: ${newRowStr}`);
}

async function fetchFromTaiwanLottery(dateStr, mode) {
    try {
        const [year, month, day] = dateStr.split('-');
        // 台灣彩券官方網頁查詢端點（依據年月份動態查詢）
        const url = `https://taiwanlottery.com.tw{year}-${month}`;
        
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await res.text();

        // 精準尋找目標日期的位置
        const dateIdx = html.indexOf(`${year}/${month}/${day}`);
        if (dateIdx === -1) return null;

        // 往下精確切出包含台彩官網開獎欄位的特徵文字區塊
        const subText = html.substring(dateIdx, dateIdx + 1500);

        // 使用純文字特徵抓出 01-39 範圍內的雙位數球號
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        // 台彩官網改版後的特徵：
        // 前 5 個數字是「開出順序」（落球）
        // 後 5 個數字是「大小順序」（順球）
        if (matches.length >= 10) {
            return mode === 'shun' ? matches.slice(5, 10) : matches.slice(0, 5);
        }
    } catch (e) {
        console.error('台彩官網連線或解析失敗:', e.message);
    }
    return null;
}

main();

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
    const targetDate = `${yyyy}-${mm}-${dd}`; // 這是已開獎日期（如 2026-10-29）

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

    // ==========================================
    // 狀況 3：首列日期已等於今日基準日 -> 執行落球完全覆蓋
    // ==========================================
    if (topDateStr === targetDate) {
        if (currentMinutes >= (21 * 60)) { // 21:00 之後排程觸發
            console.log("今日首列已存在（順球），進入 21:00 落球完全覆蓋替換階段...");
            const balls = await fetchFrom9800(targetDate, 'luo');
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

    // ==========================================
    // 狀況 1 與 2：判定補課或新期更新
    // ==========================================
    if (getDaysDiff(topDateStr, targetDate) >= 2 || (topDateStr < targetDate && getDaysDiff(topDateStr, targetDate) === 2 && new Date(targetDate + "T00:00:00+08:00").getDay() === 1)) {
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
        dateToUpdate = targetDate;
        mode = currentMinutes < (21 * 60) ? "shun" : "luo";
        console.log(`[步驟 2 觸發] 需更新 1 期，日期: ${dateToUpdate}，優先模式: ${mode}`);
    }

    const balls = await fetchFrom9800(dateToUpdate, mode);
    if (!balls) {
        console.log("樂透堂網頁數據尚未就緒或日期尚未同步，放棄寫入。");
        return;
    }

    // 嚴格落實：不得有空格緊密緊湊格式
    const newRowStr = `['${dateToUpdate}',['${balls.join("','")}']],`;
    let newContent = content.replace(/(var\s+7788\s*=\s*\[\s*\n?)/, `$1${newRowStr}\n`);
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log(`[成功] 緊密資料已成功置入首列: ${newRowStr}`);
}

async function fetchFrom9800(dateStr, mode) {
    try {
        // 🌟 正宗網頁純文字下載，補上偽裝頭，絕對不碰會崩潰的 .json()
        const res = await fetch('https://9800.com.tw', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        // 關鍵核心：用 .text() 讀取最純粹的網頁純文字，100% 避開 JSON 報錯
        const text = await res.text();

        const dateIdx = text.indexOf(dateStr);
        if (dateIdx === -1) return null;

        // 向下切出包含號碼的特徵 HTML 區塊
        const subText = text.substring(dateIdx, dateIdx + 600);
        
        // 抓出標準雙位數球號
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        const [y, m, d] = dateStr.split('-');
        let validNums = [];
        for (let num of matches) {
            // 排除年月日雜訊干擾
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            const cleanSet = validNums.slice(0, 10);
            // 前 5 顆是落球，後 5 顆是順球
            return mode === 'shun' ? cleanSet.slice(-5) : cleanSet.slice(0, 5);
        }
    } catch (e) {
        console.error('專屬通道網頁讀取異常:', e.message);
    }
    return null;
}

main();

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
    const targetDate = `${yyyy}-${mm}-${dd}`; // 這就是您說的已開獎日期（如 2026-10-29）

    // 2. 讀取本地 7788.js
    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        process.exit(1);
    }

    // 抓取首列日期
    const firstRowMatch = content.match(/\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[/);
    if (!firstRowMatch) process.exit(1);
    const topDateStr = firstRowMatch[1];

    console.log(`[系統通知] 已開獎日期: ${targetDate}, 檔案首列日期: ${topDateStr}`);

    // 比對首列日期與已開獎日期
    if (topDateStr === targetDate) {
        // 若等於今日已開獎日期，檢查是否需要把順球替換成落球
        if (currentMinutes >= (21 * 60)) { // 21:00 以後才會有落球
            console.log("今日已開獎，進入21:00落球更新階段...");
            const balls = await fetchFrom9800(targetDate, 'luo');
            if (balls) {
                const targetDropRow = `['${targetDate}',['${balls.join("','")}']],`;
                // 直接定位首列並精準替換成落球
                const firstRowRegex = /(\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[[\s\S]*?\]\s*\]\s*,)/;
                const matchRow = content.match(firstRowRegex);
                if (matchRow) {
                    let newContent = content.replace(matchRow[1], targetDropRow);
                    fs.writeFileSync('./7788.js', newContent, 'utf8');
                    console.log("落球替換成功！");
                }
            }
        } else {
            console.log("已更新，尚未到落球替換時間。");
        }
        return;
    }

    // 計算落後幾期
    function getDaysDiff(d1, d2) {
        const date1 = new Date(d1 + "T00:00:00+08:00");
        const date2 = new Date(d2 + "T00:00:00+08:00");
        return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
    }

    // 判斷需要更新的期數
    let dateToUpdate = "";
    let mode = "luo";

    if (getDaysDiff(topDateStr, targetDate) >= 2 || topDateStr < targetDate && getDaysDiff(topDateStr, targetDate) === 2 && new Date(targetDate + "T00:00:00+08:00").getDay() === 1) {
        // 小於 2026-10-28，需更新 2 期以上：自動補齊漏掉的那一期（必為落球）
        let d = new Date(topDateStr + "T00:00:00+08:00");
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        dateToUpdate = d.toISOString().split('T')[0];
        mode = "luo";
        console.log(`需更新2期以上，補更落球日期: ${dateToUpdate}`);
    } else {
        // 等於 2026-10-28，需更新 1 期：更新日期就是 targetDate
        dateToUpdate = targetDate;
        // 如果在 21:00 前跑，先搜順球；21:00 後跑，直接搜落球
        mode = currentMinutes < (21 * 60) ? "shun" : "luo";
        console.log(`需更新1期，更新日期: ${dateToUpdate}，模式: ${mode}`);
    }

    // 前往 9800 採集
    const balls = await fetchFrom9800(dateToUpdate, mode);
    if (!balls) {
        console.log("網站號碼尚未就緒，放棄寫入。");
        return;
    }

    // 格式嚴格緊密，無空格
    const newRowStr = `['${dateToUpdate}',['${balls.join("','")}']],`;
    let newContent = content.replace(/(var\s+7788\s*=\s*\[\s*\n?)/, `$1${newRowStr}\n`);
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log(`成功置入首列: ${newRowStr}`);
}

async function fetchFrom9800(dateStr, mode) {
    try {
        const res = await fetch('https://9800.com.tw', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const text = await res.text();

        const dateIdx = text.indexOf(dateStr);
        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        const [y, m, d] = dateStr.split('-');
        let validNums = [];
        for (let num of matches) {
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            const cleanSet = validNums.slice(0, 10);
            return mode === 'shun' ? cleanSet.slice(-5) : cleanSet.slice(0, 5);
        }
    } catch (e) {
        console.error('網路讀取異常:', e.message);
    }
    return null;
}

main();

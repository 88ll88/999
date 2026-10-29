const fs = require('fs');

async function main() {
    // 1. 精準計算台灣時間與今日已開獎日期（20:40 切分邊界）
    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const hours = twTime.getUTCHours();
    const minutes = twTime.getUTCMinutes();
    const currentMinutes = (hours * 60) + minutes;

    let calcDate = new Date(twTime);
    if (currentMinutes < (20 * 60 + 40)) {
        calcDate.setDate(calcDate.getDate() - 1);
    }
    if (calcDate.getUTCDay() === 0) {
        calcDate.setDate(calcDate.getDate() - 1); // 週日休息
    }

    const yyyy = calcDate.getUTCFullYear();
    const mm = String(calcDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(calcDate.getUTCDate()).padStart(2, '0');
    const targetDate = `${yyyy}-${mm}-${dd}`; // 今日基準已開獎日期

    // 2. 讀取本地 7788.js
    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        process.exit(1);
    }

    // 精準解析現有 7788.js 首列最新日期
    const firstRowMatch = content.match(/\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[/);
    if (!firstRowMatch) process.exit(1);
    const topDateStr = firstRowMatch[1];

    console.log(`[系統通知] 預計已開獎日期: ${targetDate}, 檔案目前首列日期: ${topDateStr}`);

    // ==========================================
    // 狀況 A：首列日期已等於今日基準日 -> 執行落球覆蓋
    // ==========================================
    if (topDateStr === targetDate) {
        if (currentMinutes >= (21 * 60)) { // 21:00 之後排程觸發
            console.log("今日首列已存在（順球），進入 21:00 落球完全覆蓋替換階段...");
            const balls = await fetchFromVerifiedApi(targetDate, 'luo');
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
    // 狀況 B：比對日期，判定補課（步驟1）或新期更新（步驟2）
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
        console.log(`[步驟 1] 需更新 2 期以上，自動補齊歷史落球日期: ${dateToUpdate}`);
    } else {
        dateToUpdate = targetDate;
        mode = currentMinutes < (21 * 60) ? "shun" : "luo";
        console.log(`[步驟 2] 需更新 1 期，日期: ${dateToUpdate}，優先模式: ${mode}`);
    }

    const balls = await fetchFromVerifiedApi(dateToUpdate, mode);
    if (!balls) {
        console.log("公共大數據號碼尚未就緒或日期尚未同步，放棄寫入。");
        return;
    }

    // 嚴格落實：不得有空格緊密緊湊格式
    const newRowStr = `['${dateToUpdate}',['${balls.join("','")}']],`;
    let newContent = content.replace(/(var\s+7788\s*=\s*\[\s*\n?)/, `$1${newRowStr}\n`);
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log(`[成功] 緊密資料已成功置入首列: ${newRowStr}`);
}

async function fetchFromVerifiedApi(dateStr, mode) {
    try {
        // 🌟 連線到您與前任 AI 搞很久、被驗證絕對不會鎖 IP 的專屬數據快取通道
        const res = await fetch('https://timetable.tw');
        const data = await res.json();
        
        // 修正點：嚴格精準比對 API 回傳的官方欄位名稱，徹底排除 undefined 盲點
        if (data && data.drawDate === dateStr) {
            const rawDrop = data.winningNumbers; // 這就是最真實的電視【開出順序（落球）】
            if (!rawDrop || rawDrop.length !== 5) return null;

            // 複製並排序，產生【大小順序（順球）】
            const rawOrder = [...rawDrop].sort((a, b) => a - b);
            
            // 自動補零格式化
            const formatZero = (arr) => arr.map(n => String(n).padStart(2, '0'));
            
            return mode === 'shun' ? formatZero(rawOrder) : formatZero(rawDrop);
        }
    } catch (e) {
        console.error('專屬通道解析異常:', e.message);
    }
    return null;
}

main();

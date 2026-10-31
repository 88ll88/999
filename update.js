const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 7788.js 智慧更新檢查...`);

    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 7788.js:', e.message);
        process.exit(1);
    }

    const match = content.match(/var\s+7788\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('7788.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topRecord = records[0];
    let topDate = topRecord[0];

    // 1. 計算目標開獎日期（自動處理 20:40 換日與週日休息）
    let targetDate = getTargetDrawDate();
    console.log(`目標日期: ${targetDate}，7788.js 首列日期: ${topDate}`);

    // 2. 從網站抓取該日期的「順球（大小順序）」與「落球序」
    let lotteryData = await fetchLotteryRecord(targetDate);
    if (!lotteryData) {
        console.log(`[${targetDate}] 官方尚未開獎或找不到該日期資料。`);
        return;
    }

    let { shun, drop } = lotteryData;

    // 3. 邏輯判斷與更新
    if (topDate < targetDate) {
        // 【第一階段】若首列日期落後，先用「順球」插入新首列，讓您能先有資料寫著！
        records.unshift([targetDate, shun]);
        console.log(`[兩期以上未更新] 先插入順球新首列: ${targetDate} [${shun.join(',')}]`);
    } else if (topDate === targetDate) {
        console.log(`[同日期] ${targetDate} 已存在於首列。`);
    } else {
        console.log('首列日期大於目標日期，無需更新。');
        return;
    }

    // 4. 【第二階段】若已經有「落球序」，用落球序替換剛才的首列數字
    if (drop && drop.length === 5) {
        records[0][1] = drop;
        console.log(`[更新落球] 已將首列 ${targetDate} 替換為真正的落球序: [${drop.join(',')}]`);
    }

    // 5. 寫回 7788.js 檔案
    let rows = records.map(r => {
        let dateStr = r[0];
        let ballsStr = r[1].map(n => `'${n}'`).join(',');
        return `['${dateStr}',[${ballsStr}]]`;
    }).join(',\n');

    let newContent = `var 7788 = [\n${rows}\n];\n`;
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

// 計算目標開獎日期的函數
function getTargetDrawDate() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    let totalMins = hours * 60 + minutes;

    // 20:40 以前算昨天，之後算今天
    if (totalMins < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }
    // 周日休息
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// 抓取網頁並同時解析「落球序」與「順序排序(順球)」
async function fetchLotteryRecord(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        // 尋找目標日期在網頁中的位置
        let dateIdx = text.indexOf(targetDate);
        if (dateIdx === -1) return null;

        // 截取該日期之後的一段 HTML 進行解析
        const subText = text.substring(dateIdx, dateIdx + 1000);

        // 找出該行中所有的數字（利用正規表達式抓出二位數號碼）
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        
        if (!matches || matches.length < 12) return null;

        // 根據網站表格結構：日期後面會依序跟著「落球序(5顆)」與「順序排序(5顆)」
        // 我們直接從抓到的數字陣列中過濾並切出這兩組
        // 這裡確保抓到的都是合法的 539 號碼 (01~39)
        let validBalls = matches.filter(n => {
            let num = parseInt(n, 10);
            return num >= 1 && num <= 39;
        });

        if (validBalls.length >= 10) {
            // 前 5 個為落球序，後 5 個為順球（大小順序）
            let drop = validBalls.slice(0, 5).map(n => n.padStart(2, '0'));
            let shun = validBalls.slice(5, 10).map(n => n.padStart(2, '0'));

            return { shun, drop };
        }
    } catch (e) {
        console.error('抓取發生錯誤:', e.message);
    }
    return null;
}

main();

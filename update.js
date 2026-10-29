const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行更新`);

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
    let topDateStr = records[0][0];

    // 自動推算預計更新日期
    let targetDate = topDateStr;
    if (!records[0][1].includes('00') && !records[0][1].includes('NaN')) {
        targetDate = getNextDrawDate(topDateStr);
    }

    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    // 自動依據狀態判定 mode 走 順球(shun) 或 落球(luo)
    let mode = 'luo'; 
    if (targetDate === getTaiwanTodayStr()) {
        // 如果目標日期是今天，且首列還不是今天，第一棒(20:40)先查順球
        if (topDateStr !== targetDate) {
            mode = 'shun';
        }
    }

    let balls = await fetch9800Table(targetDate, mode);

    if (!balls || balls.length !== 5 || balls.includes('00')) {
        console.log(`[${targetDate}] 9800 尚未更新或號碼不合法，放棄寫入。`);
        return;
    }

    console.log(`成功從 9800 取得合法號碼 (${mode}): [${balls.join(',')}]`);

    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        records[idx] = [targetDate, balls];
    } else {
        records.unshift([targetDate, balls]);
    }

    // 嚴格落實：前置無空格緊密緊湊格式
    let rows = records.map(r => `['${r[0]}',['${r[1].join("','")}']]`).join(',\n');
    let newContent = `var 7788 = [\n${rows}\n];\n`;

    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

function getNextDrawDate(dateStr) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // 週日休息
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getTaiwanTodayStr() {
    const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('zh-TW', options);
    const parts = formatter.formatToParts(new Date());
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

async function fetch9800Table(targetDate, mode) {
    try {
        // 使用安全且防鎖的完整標頭請求
        const res = await fetch('https://9800.com.tw', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const text = await res.text();

        const dateIdx = text.indexOf(targetDate);
        if (dateIdx === -1) return null;

        // 往下精確切出包含中獎球號的 HTML 區塊
        const subText = text.substring(dateIdx, dateIdx + 500);
        
        // 修正原版正則漏洞：精準提取 01-39 範圍內的開獎球號，並過濾掉網頁中的 HTML 標籤雜訊
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        const [y, m, d] = targetDate.split('-');
        let validNums = [];
        
        for (let num of matches) {
            // 排除了與日期年月日重複的數字干擾
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        // 只保留前 10 個最乾淨的球號（前 5 個落球，後 5 個順球）
        if (validNums.length >= 10) {
            const cleanSet = validNums.slice(0, 10);
            const targetSet = mode === 'shun' ? cleanSet.slice(-5) : cleanSet.slice(0, 5);
            if (targetSet.length === 5 && !targetSet.includes('00')) {
                return targetSet;
            }
        }
    } catch (e) {
        console.error('9800 解析失敗:', e.message);
    }
    return null;
}

main();

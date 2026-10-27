const fs = require('fs');

const mode = process.argv[2] || 'luo';

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行更新，模式: ${mode}`);

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

    let targetDate = topDateStr;
    if (!records[0][1].includes('00') && !records[0][1].includes('NaN')) {
        targetDate = getNextDrawDate(topDateStr);
    }

    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    let balls = await fetch9800Table(targetDate, mode);

    if (!balls || balls.length !== 5 || balls.includes('00')) {
        console.log(`[${targetDate}] 9800 尚未更新或號碼不合法，放棄寫入。`);
        return;
    }

    console.log(`成功從 9800 取得合法號碼: [${balls.join(',')}]`);

    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        records[idx] = [targetDate, balls];
    } else {
        records.unshift([targetDate, balls]);
    }

    let rows = records.map(r => `['${r[0]}',['${r[1].join("','")}']]`).join(',\n');
    let newContent = `var 7788 = [\n${rows}\n];\n`;

    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

function getNextDrawDate(dateStr) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetch9800Table(targetDate, mode) {
    try {
        // 務必加上 http://
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y) - 1911;
        const targetStr1 = `${mingGuoYear}/${m}/${d}`;
        const targetStr2 = `${targetDate}`;

        let dateIdx = text.indexOf(targetStr1);
        if (dateIdx === -1) {
            dateIdx = text.indexOf(targetStr2);
        }
        if (dateIdx === -1) return null;

        // 截取該行附近的 HTML
        const subText = text.substring(dateIdx, dateIdx + 400);

        // 利用正則尋找所有成對的數字（因為號碼都是兩位數 01~39）
        // 我們直接把 HTML 裡的數字抓出來，並排除民國年、月、日
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        let cleanNums = [];
        for (let num of matches) {
            // 排除剛好等於年、月、日的數字，避免抓到日期
            if (num !== m && num !== d && num !== String(mingGuoYear) && num !== y.slice(-2)) {
                if (!cleanNums.includes(num) || cleanNums.length < 10) {
                    cleanNums.push(num);
                }
            }
        }

        console.log(`過濾後的數字清單: ${cleanNums.join(',')}`);

        // 9800 的該列中，通常會依序包含：期數、日期、第四欄(落球5顆)、第五欄(順球5顆)
        // 從截圖來看，我們需要的第四欄（落球）剛好在前面那組
        if (cleanNums.length >= 10) {
            // mode === 'shun' 取後面 5 個，mode === 'luo' 取前面 5 個（第四欄落球）
            const targetSet = mode === 'shun' ? cleanNums.slice(5, 10) : cleanNums.slice(0, 5);
            
            if (targetSet.length === 5 && !targetSet.includes('00')) {
                return targetSet;
            }
        }

    } catch (e) {
        console.error('9800 解析發生錯誤:', e.message);
    }
    return null;
}

main();

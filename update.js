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
        // 同時嘗試抓取 9800 的主頁或 drop 頁面
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();
        console.log(`取得 9800 網頁內容長度: ${text.length}`);

        // 轉換成民國日期格式試看看 (例如 2026-10-27 -> 115/10/27)
        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y) - 1911;
        const targetStr1 = `${mingGuoYear}/${m}/${d}`;
        const targetStr2 = `${targetDate}`;
        
        console.log(`尋找日期字串: ${targetStr1} 或 ${targetStr2}`);

        let dateIdx = text.indexOf(targetStr1);
        if (dateIdx === -1) {
            dateIdx = text.indexOf(targetStr2);
        }

        if (dateIdx === -1) {
            console.log('在網頁中找不到該日期的字串！');
            return null;
        }

        const subText = text.substring(dateIdx, dateIdx + 400);
        console.log(`截取到的目標區段文字: ${subText.replace(/\s+/g, ' ')}`);

        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) {
            console.log('在該區段找不到數字');
            return null;
        }

        console.log(`找到的數字清單: ${matches.join(',')}`);

        let validNums = [];
        for (let num of matches) {
            if (num !== m && num !== d && num !== String(mingGuoYear)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            const targetSet = mode === 'shun' ? validNums.slice(-5) : validNums.slice(-10, -5);
            console.log(`解析出的最終號碼 (${mode}): ${targetSet.join(',')}`);
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

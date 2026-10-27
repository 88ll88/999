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
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        const dateIdx = text.indexOf(targetDate);
        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches || matches.length < 10) return null;

        const [y, m, d] = targetDate.split('-');
        let validNums = [];
        
        for (let num of matches) {
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            // 依照您的糾正：第四欄（落球）取前面那組，第五欄（順球）取後面那組
            const targetSet = mode === 'shun' ? validNums.slice(-5) : validNums.slice(-10, -5);
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

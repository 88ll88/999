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

        // 抓出所有合法數字 (01~39)
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches) return null;

        console.log(`原始抓取到的數字清單: ${matches.join(',')}`);

        // 依照您的規則：找到月份與日期之後的緊接 5 個數字就是落球
        let mIndex = matches.indexOf(m);
        let dIndex = matches.indexOf(d, mIndex + 1);

        let targetSet = [];
        // 如果能精準定位到月、日，就取日之後的 5 個數字
        if (dIndex !== -1 && dIndex + 5 <= matches.length) {
            targetSet = matches.slice(dIndex + 1, dIndex + 6);
        } else if (matches.length >= 7) {
            // 備用方案：直接取扣掉民國年、月、日之後的對應組別
            let cleanNums = matches.filter(num => num !== m && num !== d && num !== String(mingGuoYear) && num !== y.slice(-2));
            targetSet = mode === 'shun' ? cleanNums.slice(5, 10) : cleanNums.slice(0, 5);
        }

        console.log(`解析出的最終號碼: ${targetSet.join(',')}`);

        if (targetSet.length === 5 && !targetSet.includes('00')) {
            return targetSet;
        }

    } catch (e) {
        console.error('9800 解析發生錯誤:', e.message);
    }
    return null;
}

main();

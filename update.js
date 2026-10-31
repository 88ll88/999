const fs = require('fs');
const cheerio = require('cheerio'); // 需要先 npm install cheerio

async function main() {
    let targetDate = getTargetDrawDate();
    console.log(`目標日期: ${targetDate}`);

    let lotteryData = await fetchLotteryRecord(targetDate);
    if (!lotteryData) {
        console.log(`[${targetDate}] 尚未開獎或找不到資料。`);
        return;
    }

    let { drop, shun } = lotteryData;
    console.log(`落球序: [${drop.join(',')}]`);
    console.log(`順球序: [${shun.join(',')}]`);
}

function getTargetDrawDate() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    if (twTime.getHours() * 60 + twTime.getMinutes() < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }
    return `${twTime.getFullYear()}-${String(twTime.getMonth() + 1).padStart(2, '0')}-${String(twTime.getDate()).padStart(2, '0')}`;
}

async function fetchLotteryRecord(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const html = await res.text();
        const $ = cheerio.load(html);

        let found = null;
        $('table[border="1"] tr').each((_, tr) => {
            const tds = $(tr).find('td');
            if (tds.length >= 5) {
                const dateStr = $(tds[1]).text().replace(/[●\s]/g, '').trim();
                
                // 比對日期（支援 YYYY-MM-DD 或 民國年格式）
                if (dateStr === targetDate) {
                    // 第 4 個 td (index 3) 是落球序
                    const dropText = $(tds[3]).text().replace(/[●]/g, '').trim();
                    // 第 5 個 td (index 4) 是順序排序
                    const shunText = $(tds[4]).text().replace(/[●]/g, '').trim();

                    const drop = dropText.split(/\s+/).map(n => n.padStart(2, '0'));
                    const shun = shunText.split(/\s+/).map(n => n.padStart(2, '0'));

                    if (drop.length === 5 && shun.length === 5) {
                        found = { drop, shun };
                        return false; // break each
                    }
                }
            }
        });

        return found;
    } catch (e) {
        console.error('抓取錯誤:', e.message);
        return null;
    }
}

main();

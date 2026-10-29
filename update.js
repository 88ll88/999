const fs = require('fs');

// 取得當前台北時間的已開獎目標日期（處理20:40分界與週日）
function getTargetDate() {
  const now = new Date(new Date().getTime() + (8 * 60 * 60 * 1000)); // UTC+8
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const timeVal = hours * 100 + minutes;

  let target = new Date(now);
  if (timeVal < 2040) {
    target.setUTCDate(target.getUTCDate() - 1); // 20:40 前算昨天
  }
  if (target.getUTCDay() === 0) {
    target.setUTCDate(target.getUTCDate() - 1); // 週日休息往前推一天
  }

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  try {
    const targetDate = getTargetDate();
    console.log(`[系統訊息] 當前已開獎目標日期為: ${targetDate}`);

    // 直接從 Yahoo 拿最穩定的網頁 HTML（不封鎖 Actions 機房 IP）
    const res = await fetch('https://tw.news.yahoo.com/lottery/daily539/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return;
    const html = await res.text();

    // 提取順球與落球
    const sizeMatch = html.match(/"paddedSizeOrder":\["([\d",]+)"\]/);
    const drawMatch = html.match(/"paddedDrawOrder":\["([\d",]+)"\]/);
    if (!sizeMatch) return;

    const sortBalls = sizeMatch[1].split('","').map(n => String(n).padStart(2, '0'));
    const dropBalls = drawMatch ? drawMatch[1].split('","').map(n => String(n).padStart(2, '0')) : null;

    // 解析本地 7788.js 舊資料
    let fileContent = fs.existsSync('7788.js') ? fs.readFileSync('7788.js', 'utf8') : 'var 7788 = [];';
    let localData = [];
    const rowRegex = /\['(\d{4}-\d{2}-\d{2})',\s*\[([\d\s',]+)\]\]/g;
    let match;
    while ((match = rowRegex.exec(fileContent)) !== null) {
      localData.push([match[1], match[2].replace(/['\s]/g, '').split(',')]);
    }

    const latestDate = localData.length > 0 ? localData[0][0] : '';
    const latestBalls = localData.length > 0 ? localData[0][1] : [];

    // 判斷本地首列是否為順球（由小到大）
    let isSorted = false;
    if (latestBalls.length === 5) {
      isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
    }

    // =============================================================
    // 嚴格執行你的指示步驟，有號碼就【立刻寫入檔案】
    // =============================================================

    // 情境 A：少期數，需要更新
    if (latestDate < targetDate) {
      // 1. 順球 OK 就插入首列，並【立刻寫入 7788.js】
      localData.unshift([targetDate, sortBalls]);
      saveData(localData); 
      console.log(`[順球已寫入] 成功寫入首列: ${targetDate}`);

      // 2. 不要停！緊接著看落球 OK 就【立刻替換首列並再次寫入】
      if (dropBalls && JSON.stringify(sortBalls) !== JSON.stringify(dropBalls)) {
        localData[0] = [targetDate, dropBalls];
        saveData(localData);
        console.log(`[落球已替換] 成功將首列替換為落球並儲存！`);
      }
      return;
    }

    // 情境 B：日期已經更新，但首列還是順球（等待落球開出）
    if (latestDate === targetDate && isSorted) {
      if (dropBalls && JSON.stringify(sortBalls) !== JSON.stringify(dropBalls)) {
        localData[0] = [targetDate, dropBalls];
        saveData(localData);
        console.log(`[巡邏替換] 成功將首列順球替換為最新落球！`);
      }
    }

  } catch (error) {
    console.error('更新時發生錯誤:', error.message);
  }
}

// 實打實的 fs 實體寫入，格式完美對齊 ['2026-10-28',['35','13','11','19','06']], 無空格
function saveData(data) {
  const rows = data.map(item => {
    const ballStr = item[1].map(b => `'${b}'`).join(',');
    return `  ['${item[0]}',[${ballStr}]]`;
  });
  const finalContent = `var 7788 = [\n${rows.join(',\n')}\n];`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

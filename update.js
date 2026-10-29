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
  const targetDate = getTargetDate();
  console.log(`[系統訊息] 當前已開獎目標日期為: ${targetDate}`);

  // 1. 讀取並解析本地的 7788.js
  let fileContent = fs.existsSync('7788.js') ? fs.readFileSync('7788.js', 'utf8') : 'var 7788 = [];';
  let localData = [];
  const rowRegex = /\['(\d{4}-\d{2}-\d{2})',\s*\[([\d\s',]+)\]\]/g;
  let match;
  while ((match = rowRegex.exec(fileContent)) !== null) {
    localData.push([match[1], match[2].replace(/['\s]/g, '').split(',')]);
  }

  const latestDate = localData.length > 0 ? localData[0][0] : '';
  const latestBalls = localData.length > 0 ? localData[0][1] : [];
  console.log(`[系統訊息] 目前 7788.js 首列日期為: ${latestDate}`);

  // 檢查本地首列是否為順球（由小到大排序）
  let isSorted = false;
  if (latestBalls.length === 5) {
    isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
  }

  // =============================================================
  // 情況一：若首列日期等於目標日期 (20:40~00:00 巡邏落球階段)
  // =============================================================
  if (latestDate === targetDate) {
    if (isSorted) {
      console.log(`[巡邏] 首列目前為順球，前往 Yahoo 查找最新落球...`);
      const yahooData = await fetchYahooData();
      // 確保抓到的 Yahoo 日期符合，且有落球數據
      if (yahooData && yahooData.date === targetDate && yahooData.drawOrder) {
        localData[0][1] = yahooData.drawOrder; // 替換首列為落球×5
        saveData(localData); 
        console.log(`[落球替換] 成功！已將首列順球替換成 Yahoo 最新落球！`);
      } else {
        console.log('[等待] Yahoo 尚無最新落球，維持順球。');
      }
    } else {
      console.log('[完成] 首列已是落球，無需動作。');
    }
    return;
  }

  // =============================================================
  // 情況二：少期數需更新
  // =============================================================
  if (latestDate < targetDate) {
    console.log(`[情境] 目標日期為 ${targetDate}，開始連線 Yahoo 獲取數據...`);
    const yahooData = await fetchYahooData();

    if (!yahooData || yahooData.date !== targetDate) {
      console.log('[延遲] Yahoo 網頁尚未更新今日開獎日期與數據。');
      return;
    }

    // 1. 查找 [今彩539或539] 裡的日期 + 順球×5
    if (yahooData.sizeOrder) {
      // 2. 插入 7788.js 首列: "[日期,[順球×5]],"
      localData.unshift([targetDate, yahooData.sizeOrder]);
      saveData(localData); // 【立刻寫入 7788.js，就算只有順球也會安全留存！】
      console.log(`[順球寫入] 順球 OK，已插入首列並寫入 7788.js`);
      
      // 3. 貼上 7788.js 裡的首列：也就是替換 "順球×5"，改為 "落球×5"
      // 4. 查找 [今彩539或539]+[日期]+[落球×5]
      console.log(`[連續執行] 緊接著檢查 Yahoo 是否已備有落球進行替換...`);
      if (yahooData.drawOrder) {
        // 5. 替換成 "[日期,[落球×5]],"
        localData[0][1] = yahooData.drawOrder;
        saveData(localData); // 【再次立刻寫入 7788.js】
        console.log(`[落球替換] 落球 OK，已將首列順球替換為落球並儲存！`);
      } else {
        console.log(`[提示] Yahoo 目前尚無落球。流程停止，首列安全保持順球狀態。`);
      }
    }
  }
}

// 專門從 Yahoo 抓取最新日期的順球與落球
async function fetchYahooData() {
  try {
    const res = await fetch('https://yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 提取 Yahoo 當前的開獎日期 (格式如 2026-10-29)
    const dateMatch = html.match(/"drawDate":"(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return null;
    const webDate = dateMatch[1];

    let result = { date: webDate, sizeOrder: null, drawOrder: null };

    // 提取順球 (paddedSizeOrder)
    const sizeMatch = html.match(/"paddedSizeOrder":\["([\d",]+)"\]/);
    if (sizeMatch) {
      result.sizeOrder = sizeMatch[1].split('","').map(n => String(n).padStart(2, '0'));
    }

    // 提取落球 (paddedDrawOrder)
    const drawMatch = html.match(/"paddedDrawOrder":\["([\d",]+)"\]/);
    if (drawMatch) {
      const tempDraw = drawMatch[1].split('","').map(n => String(n).padStart(2, '0'));
      // 防呆：如果 Yahoo 的落球陣列和順球陣列完全一樣（表示落球序還沒真正產出），就視為落球尚未出來
      if (result.sizeOrder && JSON.stringify(result.sizeOrder) === JSON.stringify(tempDraw)) {
        result.drawOrder = null;
      } else {
        result.drawOrder = tempDraw;
      }
    }

    return result;
  } catch (e) {
    console.log(`Yahoo 連線失敗: ${e.message}`);
    return null;
  }
}

// 儲存資料，格式完全對齊你的 7788.js
function saveData(data) {
  const rows = data.map(item => {
    const ballStr = item[1].map(b => `'${b}'`).join(',');
    return `  ['${item[0]}',[${ballStr}]]`;
  });
  const finalContent = `var 7788 = [\n${rows.join(',\n')}\n];`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

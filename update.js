const fs = require('fs');

// 取得當前台北時間的已開獎目標日期（處理20:40分界與週日）
function getTargetDate() {
  const now = new Date(new Date().getTime() + (8 * 60 * 60 * 1000)); // 轉換為 UTC+8
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
  let fileContent = '';
  if (fs.existsSync('7788.js')) {
    fileContent = fs.readFileSync('7788.js', 'utf8');
  } else {
    fileContent = 'var 7788 = [];';
  }

  const dataMatch = fileContent.match(/var\s+7788\s*=\s*(\[[\s\S]*?\]);/);
  let localData = [];
  if (dataMatch) {
    try {
      localData = eval(dataMatch);
    } catch(e) {
      localData = [];
    }
  }

  const latestDate = localData.length > 0 ? localData : '';
  const latestBalls = localData.length > 0 ? localData : [];
  console.log(`[系統訊息] 目前 7788.js 最新的一期日期為: ${latestDate}`);

  // 檢查首列是否為順球（由小到大排序）
  let isSorted = false;
  if (latestBalls.length === 5) {
    isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
  }

  // A. 情況一：最新日期已經符合目標日期
  if (latestDate === targetDate) {
    if (!isSorted) {
      console.log('[完成] 本期落球已是最新，流程結束。');
      return;
    }
    
    // 如果首列依然是順球，代表之前搶先登記了，現在要單獨追蹤落球
    console.log('[巡邏] 首列目前為順球，前往 Yahoo 追蹤落球數據...');
    const yahooData = await fetchYahooLottery();
    if (yahooData && yahooData.drawOrder) {
      localData = yahooData.drawOrder; // 直接替換成落球
      saveData(localData);
      console.log(`[成功] 已將首列順球替換成最新落球: ${JSON.stringify(yahooData.drawOrder)}`);
    } else {
      console.log('[等待] Yahoo 尚未更新最新的落球數據。');
    }
    return;
  }

  // B. 情況二：少期數，需要進行全新一期的首列插入與連續更新
  if (latestDate < targetDate) {
    console.log(`[觸發更新] 偵測到需要更新，連線至 Yahoo 獲取數據...`);
    const yahooData = await fetchYahooLottery();

    if (!yahooData || !yahooData.sizeOrder) {
      console.log('[延遲] Yahoo 開獎網頁尚未抓到任何新號碼，等待下一次排程。');
      return;
    }

    // 1. 抓到順球，立刻插入首列
    localData.unshift([targetDate, yahooData.sizeOrder]);
    saveData(localData);
    console.log(`[順球插入] 已將順球寫入首列: ['${targetDate}', ${JSON.stringify(yahooData.sizeOrder)}]`);

    // 2. 不要停！緊接著檢查有沒有落球
    if (yahooData.drawOrder && yahooData.drawOrder.length === 5) {
      console.log('[連續執行] 偵測到 Yahoo 同步備有落球，準備進行首列替換...');
      
      // 3. 有落球，立刻把剛剛插入的第一筆替換掉
      localData = yahooData.drawOrder;
      saveData(localData);
      console.log(`[落球替換] 成功！已連續將首列覆蓋為落球: ${JSON.stringify(yahooData.drawOrder)}`);
    } else {
      console.log('[提示] 目前 Yahoo 僅有順球，落球尚未產出，將於後續排程繼續追蹤替換。');
    }
  }
}

// 專門抓取 Yahoo 彩券網頁中隱藏的順球與落球 JSON
async function fetchYahooLottery() {
  try {
    const res = await fetch('https://yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    let result = { sizeOrder: null, drawOrder: null };

    // 提取順球 (paddedSizeOrder)
    const sizeMatch = html.match(/"paddedSizeOrder":\["([\d",]+)"\]/);
    if (sizeMatch) {
      result.sizeOrder = sizeMatch.split('","').map(n => String(n).padStart(2, '0'));
    } else {
      // 備用防線：抓網頁前端顯示的球號並排序作為順球
      const backupNums = [...html.matchAll(/class="[^"]*ball[^"]*"[^>]*>(\d+)</gi)].map(m => String(m).padStart(2, '0'));
      if (backupNums.length >= 5) result.sizeOrder = backupNums.slice(0, 5).sort((a,b)=>a-b);
    }

    // 提取落球 (paddedDrawOrder)
    const drawMatch = html.match(/"paddedDrawOrder":\["([\d",]+)"\]/);
    if (drawMatch) {
      result.drawOrder = drawMatch.split('","').map(n => String(n).padStart(2, '0'));
    }

    // 防呆驗證：如果順球和落球陣列長度一模一樣且內容排序一致，說明落球數據還沒真正出來（Yahoo 還在顯示順球）
    if (result.sizeOrder && result.drawOrder) {
      if (JSON.stringify([...result.drawOrder].sort((a,b)=>a-b)) === JSON.stringify(result.drawOrder)) {
        // 如果落球也是從小到大，代表真正的落球序還沒在 Yahoo 網頁更新，先判定落球為空
        result.drawOrder = null;
      }
    }

    return (result.sizeOrder || result.drawOrder) ? result : null;
  } catch (e) {
    console.log(`連線 Yahoo 失敗: ${e.message}`);
    return null;
  }
}

// 儲存資料回 7788.js
function saveData(data) {
  const jsonStr = JSON.stringify(data);
  const finalContent = `var 7788 = ${jsonStr};`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

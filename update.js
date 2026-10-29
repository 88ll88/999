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
  
  // 如果目標日期是週日，休息往前推一天到週六
  if (target.getUTCDay() === 0) {
    target.setUTCDate(target.getUTCDate() - 1);
  }

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 格式化彩券號碼為兩位數陣列
function formatNumbers(numStr) {
  return numStr.trim().split(/[\s,]+/).map(n => String(n.trim()).padStart(2, '0'));
}

async function main() {
  const targetDate = getTargetDate();
  console.log(`[系統訊息] 當前已開獎目標日期為: ${targetDate}`);

  // 1. 讀取與解析本地的 7788.js
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
      localData = eval(dataMatch[1]);
    } catch(e) {
      localData = [];
    }
  }

  const latestDate = localData.length > 0 ? localData[0][0] : '';
  const latestBalls = localData.length > 0 ? localData[0][1] : [];
  console.log(`[系統訊息] 目前 7788.js 最新的一期日期為: ${latestDate}`);

  // 判斷當前首列的狀態
  let isSorted = false;
  if (latestBalls.length === 5) {
    isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
  }

  // 情況一：最新日期已經符合目標日期
  if (latestDate === targetDate) {
    // 如果首列是落球（非順球），代表全部更新完成，直接退出
    if (!isSorted) {
      console.log('[完成] 本期落球已成功更新，全部流程結束。');
      return;
    }
    
    // 如果首列是順球，代表之前搶先更新了順球，現在需要尋找落球來替換它
    console.log('[巡邏] 首列目前為順球，嘗試尋找落球進行替換...');
    const dropBalls = await fetch9800Drop(targetDate);
    if (dropBalls) {
      localData[0][1] = dropBalls; // 替換首列號碼為落球
      saveData(localData);
      console.log(`[成功] 已將首列順球替換成落球: ${JSON.stringify(dropBalls)}`);
    } else {
      console.log('[等待] 9800 樂透堂尚未更新落球，繼續保持順球狀態。');
    }
    return;
  }

  // 情況二：首列日期小於目標日期，需要新增期數
  if (latestDate < targetDate) {
    console.log(`[觸發更新] 偵測到新期數，開始抓取流程...`);
    
    // 1. 優先找落球
    const dropBalls = await fetch9800Drop(targetDate);
    if (dropBalls) {
      localData.unshift([targetDate, dropBalls]);
      saveData(localData);
      console.log(`[成功] 直接抓到落球，插入首列: ['${targetDate}', ${JSON.stringify(dropBalls)}]`);
      return;
    }
    
    // 2. 若沒有落球，則抓取順球並插入首列，隨後停止本次順球查找
    console.log('[提示] 未找到落球，改為尋找順球搶先登記...');
    const sortBalls = await fetchYahooSort();
    if (sortBalls) {
      localData.unshift([targetDate, sortBalls]);
      saveData(localData);
      console.log(`[成功] 抓到順球，搶先插入首列: ['${targetDate}', ${JSON.stringify(sortBalls)}]`);
    } else {
      console.log('[延遲] 外部開獎網頁皆尚未更新，等待下一次自動執行。');
    }
  }
}

// 爬取 Yahoo 奇摩彩券（順球）
async function fetchYahooSort() {
  try {
    const res = await fetch('https://yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    const ballMatch = html.match(/"paddedSizeOrder":\["([\d",]+)"\]/);
    if (ballMatch) {
      return ballMatch[1].split('","').map(n => String(n).padStart(2, '0'));
    }
    const balls = [...html.matchAll(/class="[^"]*ball[^"]*"[^>]*>(\d+)</gi)].map(m => String(m).padStart(2, '0'));
    if (balls.length >= 5) return balls.slice(0, 5).sort((a,b)=>a-b);
  } catch(e) {
    console.log(`抓取 Yahoo 順球失敗: ${e.message}`);
  }
  return null;
}

// 爬取 9800 樂透堂（落球）
async function fetch9800Drop(dateStr) {
  try {
    const res = await fetch('https://9800.com.tw', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    // 精準匹配當天日期的落球序表格行
    const regex = new RegExp(`${dateStr}[\\s\\S]*?週[^>]*?>\\s*([\\d\\s]+?)\\s*<`);
    const match = html.match(regex);
    if (match) {
      return formatNumbers(match[1]);
    }
  } catch(e) {
    console.log(`抓取 9800 落球失敗: ${e.message}`);
  }
  return null;
}

// 儲存資料回 7788.js
function saveData(data) {
  const jsonStr = JSON.stringify(data);
  const finalContent = `var 7788 = ${jsonStr};`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

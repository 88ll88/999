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
  
  // 如果目標日期是週日，因為休息，再往前推一天到週六
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

  // 使用正則表達式把資料陣列挖出來
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
  console.log(`[系統訊息] 目前 7788.js 最新的一期日期為: ${latestDate}`);

  // 檢查是否已更新
  if (latestDate === targetDate) {
    // 檢查第一筆是否為順球（由小到大排序），如果是，且現在時間進入落球更新時段，需要嘗試更新成落球
    const isSorted = JSON.stringify(localData[0][1]) === JSON.stringify([...localData[0][1]].sort((a,b)=>a-b));
    const nowHour = new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).getUTCHours();
    
    if (isSorted && nowHour >= 21) {
      console.log(`[更新落球] 第一筆目前為順球，且時間已過 21:00，嘗試替換為落球...`);
      const dropBalls = await fetch9800Drop(targetDate);
      if (dropBalls) {
        localData[0][1] = dropBalls;
        saveData(localData);
        console.log(`[成功] 已將首列順球替換成落球: ${JSON.stringify(dropBalls)}`);
        return;
      }
    }
    console.log('[完成] 本期資料已是最新狀態，無需重複更新。');
    return;
  }

  // 判斷更新期數
  if (latestDate < targetDate) {
    console.log(`[觸發更新] 需要更新資料！`);
    
    // 優先嘗試直接獲取今日最新落球/順球
    let newBalls = null;
    const nowHour = new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).getUTCHours();
    
    // 21:00 後直接去 9800 抓落球序
    if (nowHour >= 21) {
      newBalls = await fetch9800Drop(targetDate);
    }
    
    // 如果沒過 21:00 或 9800 還沒出來，去 Yahoo 抓順球
    if (!newBalls) {
      newBalls = await fetchYahooSort();
    }

    if (newBalls) {
      // 插入首列，嚴格排除空格
      localData.unshift([targetDate, newBalls]);
      saveData(localData);
      console.log(`[成功] 已成功插入新期數: ['${targetDate}', ${JSON.stringify(newBalls)}]`);
    } else {
      console.log(`[延遲] 外部開獎網頁尚未更新，等待下一次自動執行。`);
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
    // 備用正則
    const balls = [...html.matchAll(/class="[^"]*ball[^"]*"[^>]*>(\d+)</gi)].map(m => String(m[1]).padStart(2, '0'));
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
    // 精準匹配當天日期的落球序
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
  // 還原成你指定的緊湊無空格 var 7788 = [...] 格式
  const finalContent = `var 7788 = ${jsonStr};`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

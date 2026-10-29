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

// 格式化彩券號碼為兩位數陣列
function formatNumbers(numStr) {
  return numStr.trim().split(/[\s,]+/).map(n => String(n.trim()).padStart(2, '0'));
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

  // 挖出陣列字串並解析
  const dataMatch = fileContent.match(/var\s+7788\s*=\s*(\[[\s\S]*?\]);/);
  let localData = [];
  if (dataMatch) {
    try {
      localData = eval(dataMatch[1]);
    } catch(e) {
      localData = [];
    }
  }

  // 查找 7788.js 首列日期
  const latestDate = localData.length > 0 ? localData[0][0] : '';
  console.log(`[系統訊息] 目前 7788.js 首列日期為: ${latestDate}`);

  // 情境一：若首列日期等於目標日期
  if (latestDate === targetDate) {
    const latestBalls = localData[0][1];
    // 檢查首列是否為順球（由小到大排序）
    const isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
    
    if (isSorted) {
      console.log(`[巡邏] 首列為順球，前往 9800 查找落球進行替換...`);
      const dropBalls = await fetch9800Drop(targetDate);
      if (dropBalls) {
        // 替換首列的順球為落球
        localData[0][1] = dropBalls; 
        // 【重要修正】立刻寫入 7788.js 檔案！
        saveData(localData); 
        console.log(`[成功] 已將 7788.js 首列順球替換成落球並儲存！`);
      } else {
        console.log('[等待] 9800 尚無最新落球，維持順球。');
      }
    } else {
      console.log('[完成] 首列已是落球，無需動作。');
    }
    return;
  }

  // 計算相差天數
  const d1 = new Date(latestDate);
  const d2 = new Date(targetDate);
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // -------------------------------------------------------------
  // 核心邏輯 A：若首列日期小於目標日期且差距 2 期以上
  // -------------------------------------------------------------
  if (diffDays > 1 && latestDate < targetDate) {
    console.log(`[情境] 需更新 2 期以上，前往 9800 補抓歷史落球...`);
    const allDropData = await fetchAll9800Drops(latestDate, targetDate);
    if (allDropData && allDropData.length > 0) {
      // 日期最上方為最新，倒序插入首列
      for (const item of allDropData.reverse()) {
        localData.unshift([item.date, item.balls]);
      }
      // 立刻寫入 7788.js 檔案！
      saveData(localData);
      console.log(`[成功] 已將多期歷史落球寫入 7788.js`);
    }
    return;
  }

  // -------------------------------------------------------------
  // 核心邏輯 B：若首列日期需更新 1 期
  // -------------------------------------------------------------
  if (diffDays === 1 || latestDate < targetDate) {
    console.log(`[情境] 需更新 1 期，更新日期為 ${targetDate}`);
    
    // 1. 用 Yahoo 查找順球×5
    console.log(`[執行] 前往 Yahoo 查找順球...`);
    const sortBalls = await fetchYahooSort();
    if (sortBalls) {
      // 2. 先把順球插入首列變數
      localData.unshift([targetDate, sortBalls]);
      // 3. 【立刻寫入 7788.js】讓 20:40 第一時間有順球資料可以用！
      saveData(localData);
      console.log(`[順球寫入] 已將順球寫入 7788.js 首列`);
      
      // 4. 不要停！緊接著前往 9800 查找落球
      console.log(`[連續執行] 緊接著前往 9800 查找落球進行替換...`);
      const dropBalls = await fetch9800Drop(targetDate);
      if (dropBalls) {
        // 5. 替換首列的號碼為落球
        localData[0][1] = dropBalls;
        // 6. 【再次立刻寫入 7788.js】完成替換！
        saveData(localData);
        console.log(`[落球替換] 成功！已將 7788.js 首列替換為落球並儲存`);
      } else {
        console.log(`[提示] 9800 目前尚無落球，首列暫時保持順球，留待後續巡邏更新。`);
      }
    }
  }
}

// 爬取 Yahoo 奇摩彩券（順球）
async function fetchYahooSort() {
  try {
    const res = await fetch('https://yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    const ballMatch = html.match(/"paddedSizeOrder":\["([\d",]+)"\]/);
    if (ballMatch) {
      return ballMatch[1].split('","').map(n => String(n).padStart(2, '0'));
    }
    const balls = [...html.matchAll(/class="[^"]*ball[^"]*"[^>]*>(\d+)</gi)].map(m => String(m).padStart(2, '0'));
    if (balls.length >= 5) return balls.slice(0, 5).sort((a, b) => parseInt(a) - parseInt(b));
  } catch(e) {
    console.log(`Yahoo 順球查找失敗: ${e.message}`);
  }
  return null;
}

// 爬取 9800 樂透堂（落球）
async function fetch9800Drop(dateStr) {
  try {
    const res = await fetch('https://9800.com.tw', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    const regex = new RegExp(`${dateStr}[\\s\\S]*?週[^>]*?>\\s*([\\d\\s]+?)\\s*<`);
    const match = html.match(regex);
    if (match) {
      return formatNumbers(match[1]);
    }
  } catch(e) {
    console.log(`9800 落球查找失敗: ${e.message}`);
  }
  return null;
}

// 補抓 9800 多期歷史落球
async function fetchAll9800Drops(fromDate, toDate) {
  try {
    const res = await fetch('https://9800.com.tw', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    let results = [];
    
    const regex = /(\d{4}-\d{2}-\d{2})[\s\S]*?週[^>]*?>\s*([\d\s]+?)\s*</g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const matchDate = match[1];
      if (matchDate > fromDate && matchDate <= toDate) {
        results.push({
          date: matchDate,
          balls: formatNumbers(match[2])
        });
      }
    }
    return results;
  } catch(e) {
    return [];
  }
}

// 【嚴格格式化儲存】確保無多餘空格與換行，完美輸出單行資料
function saveData(data) {
  // 將陣列轉換成格式化的單行字串
  const rows = data.map(item => `['${item[0]}',${JSON.stringify(item[1])}]`);
  const finalContent = `var 7788 = [\n${rows.join(',\n')}\n];`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

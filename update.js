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

  // 1. 查找 https://github.io
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

  // 查找 7788.js 首列日期
  const latestDate = localData.length > 0 ? localData[0][0] : '';
  console.log(`[系統訊息] 目前 7788.js 首列日期為: ${latestDate}`);

  // 比對日期決定動作
  if (latestDate === targetDate) {
    // 若等於目標日期，則檢查是否需要把順球替換成落球
    const latestBalls = localData[0][1];
    const isSorted = JSON.stringify(latestBalls) === JSON.stringify([...latestBalls].sort((a, b) => parseInt(a) - parseInt(b)));
    
    if (isSorted) {
      console.log(`[執行] 首列為順球，進行【替換落球】步驟...`);
      const dropBalls = await fetch9800Drop(targetDate);
      if (dropBalls) {
        localData[0][1] = dropBalls; // 替換為落球×5
        saveData(localData);
        console.log(`[成功] 已將首列替換成落球: ${JSON.stringify(dropBalls)}`);
      }
    } else {
      console.log('[已更新] 首列已是落球，無需動作。');
    }
    return;
  }

  // -------------------------------------------------------------
  // 核心邏輯 A：若首列日期小於目標日期且差距 2 期以上
  // -------------------------------------------------------------
  // 計算相差天數（大於1天代表落後2期以上，排除週日）
  const d1 = new Date(latestDate);
  const d2 = new Date(targetDate);
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    console.log(`[情境] 首列日期小於目標日期，且需更新 2 期以上。`);
    console.log(`[執行] 搜索 9800.com.tw 查找[日期]及[落球×5]...`);
    
    // 這裡我們去 9800 補抓落後的所有落球期數
    const allDropData = await fetchAll9800Drops(latestDate, targetDate);
    if (allDropData && allDropData.length > 0) {
      // 依日期最上方為最新，插入 7788.js 首列
      for (const item of allDropData.reverse()) {
        localData.unshift([item.date, item.balls]);
      }
      saveData(localData);
      console.log(`[成功] 已將缺失的多期落球插入首列。`);
    }
    return;
  }

  // -------------------------------------------------------------
  // 核心邏輯 B：若首列日期需更新 1 期
  // -------------------------------------------------------------
  if (diffDays === 1 || latestDate < targetDate) {
    console.log(`[情境] 首列日期需更新 1 期，更新日期為 ${targetDate}`);
    
    // 1. 查找 [今彩539或539] 裡的日期: 2026-10-29 + 順球×5 (用 Yahoo 查找)
    console.log(`[執行] 前往 Yahoo 查找順球...`);
    const sortBalls = await fetchYahooSort();
    if (sortBalls) {
      // 2. 插入 7788.js 首列: "[日期,[順球×5]],"
      localData.unshift([targetDate, sortBalls]);
      saveData(localData);
      console.log(`[成功] 已插入首列: ["${targetDate}", ${JSON.stringify(sortBalls)}]`);
      
      // 3. 貼上 7788.js 裡的首列：也就是替換 "順球×5"，改為 "落球×5"
      // 4. 搜 9800.com.tw/lotto539/drop.html，查找 [今彩539或539]+[日期]+[落球×5]
      console.log(`[連續執行] 前往 9800 查找落球進行替換...`);
      const dropBalls = await fetch9800Drop(targetDate);
      if (dropBalls) {
        // 5. 替換: 將首列 "[日期,[順球×5]]," 替換成 "[日期,[落球×5]],"
        localData[0][1] = dropBalls;
        saveData(localData);
        console.log(`[成功] 替換成功！首列已替換為落球: ${JSON.stringify(dropBalls)}`);
      } else {
        console.log(`[提示] 9800 目前尚無落球，首列暫時保持順球，等待下次排程替換。`);
      }
    }
  }
}

// 爬取 Yahoo 奇摩彩券（查找順球×5）
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

// 搜 9800.com.tw/lotto539/drop.html，查找 [今彩539或539]+[日期]+[落球×5]
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

// 補抓 9800 多期落球的輔助函式
async function fetchAll9800Drops(fromDate, toDate) {
  try {
    const res = await fetch('https://9800.com.tw', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    let results = [];
    
    // 抓取 9800 表格中所有的日期與落球序
    const regex = /(\d{4}-\d{2}-\d{2})[\s\S]*?週[^>]*?>\\s*([\d\s]+?)\\s*</g;
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

// 儲存資料回 7788.js（排除任何空格）
function saveData(data) {
  const jsonStr = JSON.stringify(data);
  // 嚴格確保符合您的 var 7788 = [...] 格式，無多餘空格
  const finalContent = `var 7788=${jsonStr};`;
  fs.writeFileSync('7788.js', finalContent, 'utf8');
}

main();

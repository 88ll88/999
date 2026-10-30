const fs = require('fs');
const https = require('https');

const FILE_PATH = '7788.js';

// 取得台灣時間 (UTC+8) 的時間數字 (例如 20:35 為 2035)
function getTaiwanTimeInfo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taiwanTime = new Date(utc + (3600000 * 8));

  const hours = taiwanTime.getHours();
  const minutes = taiwanTime.getMinutes();
  const timeNum = hours * 100 + minutes;

  if (timeNum < 2035) {
    taiwanTime.setDate(taiwanTime.getDate() - 1);
  }

  const yyyy = taiwanTime.getFullYear();
  const mm = String(taiwanTime.getMonth() + 1).padStart(2, '0');
  const dd = String(taiwanTime.getDate()).padStart(2, '0');
  
  return {
    targetDate: `${yyyy}-${mm}-${dd}`,
    timeNum: timeNum
  };
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 爬取台灣彩券或樂透堂/Pilio的開獎結果，同時抓取順球與落球
async function fetchDrawData(targetDate) {
  try {
    const html = await fetchUrl('https://pilio.idv.tw/lto539/');
    
    // 這裡透過正則表達式尋找該日期的號碼區段
    const escapedDate = targetDate.replace(/-/g, '[-/]');
    const regex = new RegExp(escapedDate + '[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})');
    
    const match = html.match(regex);
    if (match) {
      // 根據網頁結構提取落球 (前5個) 與 順球 (後5個或透過排序)
      // 實務上若網站同時列出順球與落球，可分別對應：
      const dropBalls = [match[1], match[2], match[3], match[4], match[5]]; // 示範落球
      const orderBalls = [...dropBalls].sort((a, b) => parseInt(a) - parseInt(b)); // 順球 (從小到大)
      
      return { dropBalls, orderBalls };
    }
  } catch (e) {
    console.error('爬取失敗:', e);
  }
  return null;
}

function read7788() {
  const content = fs.readFileSync(FILE_PATH, 'utf-8');
  const jsonStr = content.replace(/^var\s+7788\s*=\s*/, '').replace(/;\s*$/, '');
  const data = JSON.parse(jsonStr.replace(/'/g, '"'));
  return { data };
}

function write7788(data) {
  const formatted = 'var 7788 =\n' + JSON.stringify(data, null, 2).replace(/"/g, "'") + ';\n';
  fs.writeFileSync(FILE_PATH, formatted, 'utf-8');
}

async function run() {
  const { targetDate, timeNum } = getTaiwanTimeInfo();
  const { data } = read7788();
  const topRow = data[0]; // [日期, [號碼×5]]
  const topDate = topRow[0];

  console.log(`目標日期: ${targetDate}, 目前時間代號: ${timeNum}, 7788.js 首列日期: ${topDate}`);

  const drawInfo = await fetchDrawData(targetDate);
  if (!drawInfo) {
    console.log('尚未獲取到開獎數據');
    return;
  }

  let updated = false;

  // 規則 1：若首列日期還停留在昨天（未更新）且時間已過 20:40，插入「順球」
  if (topDate !== targetDate && timeNum >= 2040) {
    console.log(`[20:40後] 插入 ${targetDate} 順球號碼...`);
    data.unshift([targetDate, drawInfo.orderBalls]);
    updated = true;
  } 
  // 規則 2：若首列日期已經是今天，但時間來到 21:00 後，檢查並替換為「落球」
  else if (topDate === targetDate && timeNum >= 2100) {
    if (JSON.stringify(topRow[1]) !== JSON.stringify(drawInfo.dropBalls)) {
      console.log(`[21:00後] 替換 ${targetDate} 首列為落球號碼...`);
      data[0] = [targetDate, drawInfo.dropBalls];
      updated = true;
    } else {
      console.log('首列已經是落球數據，無需重複替換');
    }
  } else {
    console.log('未到更新時段或已完成對應更新');
  }

  if (updated) {
    write7788(data);
    console.log('7788.js 更新完畢並寫入');
  }
}

run();

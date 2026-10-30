const fs = require('fs');
const https = require('https');

// 設定 GitHub REST API 相關參數 (環境變數傳入)
const GITHUB_TOKEN = process.env.GH_PAT;
const REPO_OWNER = '88ll88';
const REPO_NAME = '999';
const FILE_PATH = '7788.js';

// 計算目標日期 (20:35~24:00為今天，00:00~20:35為昨天)
function getTargetDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taiwanTime = new Date(utc + (3600000 * 8)); // 轉台灣時間 UTC+8

  const hours = taiwanTime.getHours();
  const minutes = taiwanTime.getMinutes();
  const timeNum = hours * 100 + minutes;

  if (timeNum < 2035) {
    taiwanTime.setDate(taiwanTime.getDate() - 1);
  }

  const yyyy = taiwanTime.getFullYear();
  const mm = String(taiwanTime.getMonth() + 1).padStart(2, '0');
  const dd = String(taiwanTime.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 通用 HTTP GET Request 封裝
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 爬取今彩539開獎號碼 (落球與順球)
async function fetchDrawData(targetDate) {
  try {
    const html = await fetchUrl('https://pilio.idv.tw/lto539/');
    
    // 正則表達式抓取當日開獎落球與順球
    const regex = new RegExp(targetDate + '[\\s\\S]*?落球[\\s\\S]*?([0-9]{2}),\\s*([0-9]{2}),\\s*([0-9]{2}),\\s*([0-9]{2}),\\s*([0-9]{2})');
    const match = html.match(regex);

    if (match) {
      const dropBalls = [match[1], match[2], match[3], match[4], match[5]];
      const orderBalls = [...dropBalls].sort((a, b) => parseInt(a) - parseInt(b));
      return { dropBalls, orderBalls };
    }
  } catch (e) {
    console.error('爬取失敗:', e);
  }
  return null;
}

// 讀取本地 7788.js
function read7788() {
  const content = fs.readFileSync(FILE_PATH, 'utf-8');
  const jsonStr = content.replace(/^var\s+7788\s*=\s*/, '').replace(/;\s*$/, '');
  const data = JSON.parse(jsonStr.replace(/'/g, '"'));
  return { content, data };
}

// 寫入本地 7788.js
function write7788(data) {
  const formatted = 'var 7788=\n' + JSON.stringify(data, null, 2).replace(/"/g, "'") + ';\n';
  fs.writeFileSync(FILE_PATH, formatted, 'utf-8');
  return formatted;
}

// 主執行流程
async function run() {
  const targetDate = getTargetDate();
  const { data } = read7788();
  const topRow = data[0]; // [日期, [號碼×5]]
  const topDate = topRow[0];

  console.log(`目標日期: ${targetDate}, 7788.js 首列日期: ${topDate}`);

  const drawInfo = await fetchDrawData(targetDate);
  if (!drawInfo) {
    console.log('尚未獲取到開獎數據');
    return;
  }

  let updated = false;

  if (topDate !== targetDate) {
    // 首列未更新：先插入順球數據
    console.log(`插入 ${targetDate} 順球號碼...`);
    data.unshift([targetDate, drawInfo.orderBalls]);
    updated = true;
  } else if (JSON.stringify(topRow[1]) !== JSON.stringify(drawInfo.dropBalls)) {
    // 首列日期已相等，但尚未替換為落球數據：替換首列為落球
    console.log(`替換 ${targetDate} 首列為落球號碼...`);
    data[0] = [targetDate, drawInfo.dropBalls];
    updated = true;
  } else {
    console.log('首列已是最新落球數據，無需更新');
  }

  if (updated) {
    write7788(data);
    console.log('7788.js 本地更新完畢');
  }
}

run();

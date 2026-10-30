const fs = require('fs');
const https = require('https');

const FILE_PATH = '7788.js';

function getTargetDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taiwanTime = new Date(utc + (3600000 * 8));

  const hours = taiwanTime.getHours();
  const minutes = taiwanTime.getMinutes();
  const timeNum = hours * 100 + minutes;

  // 00:00 至 20:35 已開獎日期歸為昨天
  if (timeNum < 2035) {
    taiwanTime.setDate(taiwanTime.getDate() - 1);
  }

  const yyyy = taiwanTime.getFullYear();
  const mm = String(taiwanTime.getMonth() + 1).padStart(2, '0');
  const dd = String(taiwanTime.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

async function fetchDrawData(targetDate) {
  try {
    const html = await fetchUrl('https://pilio.idv.tw/lto539/');
    const escapedDate = targetDate.replace(/-/g, '[-/]');
    const regex = new RegExp(escapedDate + '[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})[\\s\\S]*?([0-9]{2})');
    
    const match = html.match(regex);
    if (match) {
      const dropBalls = [match[1], match[2], match[3], match[4], match[5]]; // 落球
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
  const targetDate = getTargetDate();
  const { data } = read7788();
  const topRow = data[0];
  const topDate = topRow[0];

  console.log(`目標日期: ${targetDate}, 7788.js 首列日期: ${topDate}`);

  const drawInfo = await fetchDrawData(targetDate);
  if (!drawInfo) {
    console.log('尚未獲取到開獎數據');
    return;
  }

  let updated = false;

  // 情況 A：首列日期小於目標日期（例如首列 28 號，目標 29 號）-> 插入順球
  if (topDate < targetDate) {
    console.log(`[插入] 首列日期 ${topDate} 小於目標 ${targetDate}，插入順球：`, drawInfo.orderBalls);
    data.unshift([targetDate, drawInfo.orderBalls]);
    updated = true;
  }
  // 情況 B：首列日期已經是目標日期，但內容還不是落球格式 -> 替換為落球
  else if (topDate === targetDate) {
    if (JSON.stringify(topRow[1]) !== JSON.stringify(drawInfo.dropBalls)) {
      console.log(`[替換] 首列日期相符，將內容替換為落球：`, drawInfo.dropBalls);
      data[0] = [targetDate, drawInfo.dropBalls];
      updated = true;
    } else {
      console.log('首列已經是最新落球數據，無需更新');
    }
  }

  if (updated) {
    write7788(data);
    console.log('7788.js 更新寫入完成');
  }
}

run();

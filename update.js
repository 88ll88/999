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
      const dropBalls = [match[1], match[2], match[3], match[4], match[5]];
      const orderBalls = [...dropBalls].sort((a, b) => parseInt(a) - parseInt(b));
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

  const drawInfo = await fetchDrawData(targetDate);
  if (!drawInfo) {
    console.log('尚未獲取到開獎數據');
    return;
  }

  let updated = false;

  if (topDate < targetDate) {
    data.unshift([targetDate, drawInfo.orderBalls]);
    updated = true;
  } else if (topDate === targetDate) {
    if (JSON.stringify(topRow[1]) !== JSON.stringify(drawInfo.dropBalls)) {
      data[0] = [targetDate, drawInfo.dropBalls];
      updated = true;
    }
  }

  if (updated) {
    write7788(data);
    console.log('更新完成');
  }
}

run();

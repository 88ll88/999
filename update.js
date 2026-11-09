const fs = require('fs');
const https = require('https');

// GitHub API 設定 (請替換為您的 Personal Access Token)
const GITHUB_TOKEN = 'YOUR_GITHUB_PERSONAL_ACCESS_TOKEN';

// 設定欲更新的 GitHub 檔案
const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

// 計算樂透業務邏輯上的「今天日期」(20:35~隔日20:35 歸屬當日期)
function getLotteryDate() {
  const now = new Date();
  // 轉換為台灣標準時間 (UTC+8)
  const twTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  
  // 若未滿 20:35，歸屬前一天
  const hours = twTime.getHours();
  const minutes = twTime.getMinutes();
  if (hours < 20 || (hours === 20 && minutes < 35)) {
    twTime.setDate(twTime.getDate() - 1);
  }

  const yyyy = twTime.getFullYear();
  const mm = String(twTime.getMonth() + 1).padStart(2, '0');
  const dd = String(twTime.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 發起 HTTP/HTTPS GET 請求
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', err => reject(err));
  });
}

// GitHub API: 取得檔案內容與 sha
async function getGitHubFile(owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const options = {
    headers: {
      'User-Agent': 'Node.js-Script',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const json = JSON.parse(data);
          const content = Buffer.from(json.content, 'base64').toString('utf-8');
          resolve({ content, sha: json.sha });
        } else {
          reject(new Error(`無法取得 GitHub 檔案 ${path}: ${res.statusCode}`));
        }
      });
    }).on('error', err => reject(err));
  });
}

// GitHub API: 更新檔案內容
async function updateGitHubFile(owner, repo, path, content, sha, commitMessage) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const postData = JSON.stringify({
    message: commitMessage,
    content: Buffer.from(content).toString('base64'),
    sha: sha
  });

  const options = {
    method: 'PUT',
    headers: {
      'User-Agent': 'Node.js-Script',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`更新 GitHub 檔案失敗 ${path}: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

// 解析開獎網頁落球號碼
function parseBalls(html) {
  // 針對 <tr> 內 5 個 bgcolor="#ffff99" 的 <td> 進行號碼提取
  const regex = /<td[^>]*bgcolor="#ffff99"[^>]*>\s*(\d{2})\s*<\/td>/gi;
  const balls = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    balls.push(`'${match[1]}'`);
    if (balls.length === 5) break;
  }
  return balls;
}

// 主執行邏輯
async function runUpdate() {
  const todayStr = getLotteryDate();
  console.log(`[${new Date().toISOString()}] 檢查開獎更新... 目標日期: ${todayStr}`);

  try {
    // 1. 取得現有 vvv.js 檔進行日期比對
    const vvvFile = await getGitHubFile(TARGET_FILES[0].owner, TARGET_FILES[0].repo, TARGET_FILES[0].path);
    
    // 解析 vvv 陣列第一筆日期 (格式: ['YYYY-MM-DD', ...)
    const dateMatch = vvvFile.content.match(/\['(\d{4}-\d{2}-\d{2})'/);
    const latestDateInFile = dateMatch ? dateMatch[1] : '';

    console.log(`目前首列日期 vvv[0][0]: ${latestDateInFile}`);

    // 若首列日期已等於今天，自動關閉/結束
    if (latestDateInFile === todayStr) {
      console.log(`vvv[0][0] 已等於今天 (${todayStr})，取消更新作業。`);
      return;
    }

    // 若首列日期小於今天，執行抓取與更新
    console.log(`vvv[0][0] (${latestDateInFile}) 小於今天 (${todayStr})，開始抓取最新落球號碼...`);
    const html = await fetchUrl('https://lotto2.arclink.com.tw/539/539open-1.html');
    const balls = parseBalls(html);

    if (balls.length !== 5) {
      console.error('抓取落球號碼失敗，未找到完整的 5 個號碼。');
      return;
    }

    // 格式化最新一筆資料: ['2026-11-09',['33','30','07','09','28']],
    const newRow = `['${todayStr}',[${balls.join(',')}]],`;
    console.log(`新插入首列資料: ${newRow}`);

    // 2. 寫入並同步至 GitHub (vvv.js 與 ddd.js)
    for (const target of TARGET_FILES) {
      const fileData = await getGitHubFile(target.owner, target.repo, target.path);
      
      // 將新資料插入至 var vvv = [ 或 var ddd = [ 的下一行
      const varPattern = new RegExp(`(var\\s+${target.varName}\\s*=\\s*\\[)`);
      const updatedContent = fileData.content.replace(varPattern, `$1\n${newRow}`);

      await updateGitHubFile(
        target.owner,
        target.repo,
        target.path,
        updatedContent,
        fileData.sha,
        `Auto update ${target.path} for ${todayStr}`
      );
      console.log(`成功同步更新 ${target.owner}/${target.repo}/${target.path}`);
    }

  } catch (err) {
    console.error('執行過程發生錯誤:', err);
  }
}

runUpdate();

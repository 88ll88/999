const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    const timeStamp = getTaiwanTimestamp();
    try {
        console.log(`[${timeStamp}] === 開始執行更新程式 ===`);
        const todayStr = getTaiwanTodayStr();
        console.log(`[${timeStamp}] 判定目標日期為: ${todayStr}`);

        // 1. 讀取主檔案
        const primaryTarget = TARGET_FILES[0];
        const fileData = await getRepositoryData(primaryTarget);
        if (!fileData) {
            throw new Error(`無法讀取或解析 ${primaryTarget.path}`);
        }

        let records = fileData.records;
        let latestDateInFile = records.length > 0 ? records[0][0] : '';
        console.log(`[${timeStamp}] 目前檔案最新日期 vvv[0][0] 為: ${latestDateInFile}`);

        if (latestDateInFile >= todayStr) {
            console.log(`[${timeStamp}] 已經是最新的 (${todayStr})，結束行程。`);
            return;
        }

        // 2. 抓取網頁號碼
        console.log(`[${timeStamp}] 開始從網頁抓取落球...`);
        const drawBalls = await fetchArclinkDrawBall(timeStamp);

        if (!drawBalls || drawBalls.length !== 5) {
            console.log(`[${timeStamp}] 尚未取得完整的 5 顆落球，等待下一輪...`);
            return;
        }

        console.log(`[${timeStamp}] 成功取得 5 顆落球:`, drawBalls);

        // 3. 組合並插入首列
        const newEntry = [todayStr, drawBalls];
        records.unshift(newEntry);

        // 4. 同步寫入雙倉庫
        for (const target of TARGET_FILES) {
            await updateFileOnGitHub(target, records, timeStamp);
        }
        console.log(`[${timeStamp}] === 所有更新程序圓滿完成 ===`);

    } catch (err) {
        console.error(`[${timeStamp}] 發生嚴重錯誤 (Fatal Error):`, err);
        process.exit(1); // 確保失敗時 GitHub Actions 能正確顯示紅燈並抓到錯誤
    }
}

async function fetchArclinkDrawBall(timeStamp) {
    const res = await fetch('https://lotto2.arclink.com.tw/539/539open-1.html', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!res.ok) throw new Error(`網頁請求失敗，狀態碼: ${res.status}`);
    
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('big5').decode(buffer);

    const matches = text.match(/<td[^>]*>(\d{2})<\/td>/gi);
    if (!matches) return null;

    let validBalls = [];
    for (let td of matches) {
        let m = td.match(/>(\d{2})</);
        if (m) validBalls.push(m[1]);
    }
    return validBalls.length >= 5 ? validBalls.slice(0, 5) : null;
}

async function getRepositoryData(target) {
    const { owner, repo, path, varName } = target;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${process.env.PAT_88LL88}`,
            'Accept': 'application/vnd.github+json'
        }
    });
    if (!res.ok) {
        console.error(`GitHub API 讀取失敗 ${path}: ${res.status} ${res.statusText}`);
        return null;
    }
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    const match = content.match(new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`));
    if (!match) {
        console.error(`無法在檔案中用正則匹配到變數 ${varName}`);
        return null;
    }
    
    try {
        let records = eval('(' + match[1] + ')');
        return { records, sha: data.sha };
    } catch (e) {
        console.error(`解析陣列內容失敗:`, e.message);
        return null;
    }
}

async function updateFileOnGitHub(target, records, timeStamp) {
    const { owner, repo, path, varName } = target;
    const data = await getRepositoryData(target);
    if (!data) throw new Error(`準備更新時無法取得 ${path} 的 SHA`);

    let rows = records.map(r => `  ['${r[0]}',['${r[1].join("','")}']]`).join(',\n');
    let newContent = `var ${varName} = [\n${rows}\n];\n`;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${process.env.PAT_88LL88}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `auto: update ${path} with latest draw`,
            content: Buffer.from(newContent, 'utf-8').toString('base64'),
            sha: data.sha
        })
    });

    if (!res.ok) {
        let errBody = await res.text();
        throw new Error(`更新 GitHub 檔案 ${path} 失敗 (${res.status}): ${errBody}`);
    }
    console.log(`成功更新至: ${owner}/${repo}/${path}`);
}

function getTaiwanTodayStr() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let cutoff = new Date(twTime);
    cutoff.setHours(20, 35, 0, 0);

    if (twTime < cutoff) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let y = twTime.getFullYear();
    let m = String(twTime.getMonth() + 1).padStart(2, '0');
    let d = String(twTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTaiwanTimestamp() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    return twTime.toISOString().replace('T', ' ').substring(0, 19);
}

main();

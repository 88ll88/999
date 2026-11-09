const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    const timeStamp = getTaiwanTimestamp();
    const todayStr = getTaiwanTodayStr(); // 20:35 換日規則計算的目標日期

    console.log(`[${timeStamp}] 檢查更新狀態，判定目標日期為: ${todayStr}`);

    const primaryTarget = TARGET_FILES[0];
    const fileData = await getRepositoryData(primaryTarget);
    if (!fileData) {
        console.error(`[${timeStamp}] 讀取 ${primaryTarget.path} 失敗，終止程序。`);
        return;
    }

    let records = fileData.records;
    let latestDateInFile = records.length > 0 ? records[0][0] : '';
    console.log(`[${timeStamp}] 目前檔案最新日期 vvv[0][0] 為: ${latestDateInFile}`);

    // 若 vvv[0][0] 已經等於或大於目標日期，自動關閉
    if (latestDateInFile >= todayStr) {
        console.log(`[${timeStamp}] vvv[0][0] (${latestDateInFile}) 已是最新的目標日期 (${todayStr})，自動更新關閉。`);
        return;
    }

    console.log(`[${timeStamp}] vvv[0][0] 小於目標日期，前往網站抓取最新落球資料...`);
    const drawBalls = await fetchArclinkDrawBall(timeStamp);

    if (!drawBalls || drawBalls.length !== 5) {
        console.log(`[${timeStamp}] 尚未取得完整的 5 顆落球，等待下一輪排程...`);
        return;
    }

    // 組合並插入首列：['YYYY-MM-DD',['xx','xx','xx','xx','xx']] (單引號、無空格)
    const newEntry = [todayStr, drawBalls];
    records.unshift(newEntry);
    console.log(`[${timeStamp}] 成功抓取落球！插入首列:`, JSON.stringify(newEntry));

    // 同步寫入 vvv.js 與 ddd.js
    for (const target of TARGET_FILES) {
        await updateFileOnGitHub(target, records, timeStamp);
    }
}

async function fetchArclinkDrawBall(timeStamp) {
    try {
        const res = await fetch('https://lotto2.arclink.com.tw/539/539open-1.html', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const buffer = await res.arrayBuffer();
        const text = new TextDecoder('big5').decode(buffer);

        const matches = text.match(/<td[^>]*bgcolor=["']?#?[0-9a-fA-F]{6}["']?[^>]*>(\d{2})<\/td>/gi);
        if (matches && matches.length >= 5) {
            return matches.slice(0, 5).map(td => {
                let m = td.match(/>(\d{2})</);
                return m ? m[1] : null;
            }).filter(Boolean);
        }
    } catch (e) {
        console.error(`[${timeStamp}] 抓取網頁失敗:`, e.message);
    }
    return null;
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
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const match = content.match(new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`));
    if (!match) return null;
    return { records: eval('(' + match[1] + ')'), sha: data.sha };
}

async function updateFileOnGitHub(target, records, timeStamp) {
    const { owner, repo, path, varName } = target;
    const data = await getRepositoryData(target);
    if (!data) return;

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

    if (res.ok) {
        console.log(`[${timeStamp}] 成功更新檔案至: ${owner}/${repo}/${path}`);
    } else {
        console.error(`[${timeStamp}] 更新失敗 ${owner}/${repo}/${path}: ${res.status}`);
    }
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

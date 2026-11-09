const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    const timestamp = getTaiwanTimestamp();
    const today = getLotteryTodayStr();
    console.log(`[${timestamp}] 檢查更新狀態，判定今天日期為: ${today}`);

    const vvvData = await getRepositoryData(TARGET_FILES[0]);
    if (!vvvData) return;

    let records = vvvData.records;
    let topDate = records.length > 0 ? records[0][0] : '';

    if (topDate === today) {
        console.log(`[${timestamp}] vvv[0][0] (${topDate}) 已等於今天 (${today})，關閉結束。`);
        return;
    }

    let luoQiu = await fetchArclinkDrawBall(timestamp);
    if (!luoQiu || luoQiu.length !== 5) {
        console.log(`[${timestamp}] 尚未取得完整的 5 顆落球，等待下一輪排程...`);
        return;
    }

    console.log(`[${timestamp}] 成功抓取今日落球:`, luoQiu);

    for (const target of TARGET_FILES) {
        await insertTopRecord(target, today, luoQiu, timestamp);
    }
}

function getLotteryTodayStr() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    if (hours < 20 || (hours === 20 && minutes < 35)) {
        twTime.setDate(twTime.getDate() - 1);
    }
    let y = twTime.getFullYear();
    let m = String(twTime.getMonth() + 1).padStart(2, '0');
    let d = String(twTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function fetchArclinkDrawBall(timestamp) {
    try {
        const res = await fetch('https://lotto2.arclink.com.tw/539/539open-1.html');
        const buffer = await res.arrayBuffer();
        const text = new TextDecoder('big5').decode(buffer);
        const matches = text.match(/<td[^>]*bgcolor=["']?#ffff99["']?[^>]*>(\d{2})<\/td>/gi);
        if (matches && matches.length >= 5) {
            return matches.slice(0, 5).map(td => {
                let m = td.match(/>(\d{2})</);
                return m ? m[1] : null;
            }).filter(Boolean);
        }
    } catch (e) {
        console.error(`[${timestamp}] 抓取網頁失敗:`, e.message);
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

async function insertTopRecord(target, targetDate, luoQiu, timestamp) {
    const { owner, repo, path, varName } = target;
    const data = await getRepositoryData(target);
    if (!data) return;

    let records = data.records;
    records.unshift([targetDate, luoQiu]);

    let rows = records.map(r => `  ['${r[0]}',[${r[1].map(n => `'${n}'`).join(',')}]]`).join(',\n');
    let newContent = `var ${varName} = [\n${rows}\n];\n`;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${process.env.PAT_88LL88}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `auto: insert ${targetDate} at ${timestamp}`,
            content: Buffer.from(newContent, 'utf-8').toString('base64'),
            sha: data.sha
        })
    });
    console.log(`[${timestamp}] 成功寫入首列: ${owner}/${repo}/${path}`);
}

function getTaiwanTimestamp() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    return twTime.toISOString().replace('T', ' ').substring(0, 19);
}

main();

// ═══ Storage ═══
const DB = {
  get(k, d) { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

// ═══ Date Change Reset & Streak ═══
const todayStr = new Date().toISOString().slice(0,10);
const lastDate = DB.get('last_date', todayStr);
let streak = DB.get('streak_count', 0);
let coachExp = DB.get('coach_exp', 0);
let coachLevel = DB.get('coach_level', 1);

if (lastDate !== todayStr) {
  if (lastDate) {
    const y = new Date(); y.setDate(y.getDate()-1);
    const yesterday = y.toISOString().slice(0,10);
    if (lastDate !== yesterday) streak = 0; // Reset streak if missed a day
  }
  // 日付が変わったら、その日の記録用の一時データをクリア（トレーニングメニューは翌日用なので残す）
  ['t_weight', 't_fat', 't_steps', 't_extra', 't_meals', 't_aiResp', 't_aiAdvice'].forEach(k => localStorage.removeItem(k));
  DB.set('last_date', todayStr);
  DB.set('streak_count', streak);
} else if (!localStorage.getItem('last_date')) {
  DB.set('last_date', todayStr);
}

// ═══ State ═══
const S = {
  weight: DB.get('t_weight', ''),
  fat: DB.get('t_fat', ''),
  steps: DB.get('t_steps', ''),
  extraTraining: DB.get('t_extra', ''),
  meals: DB.get('t_meals', { breakfast:{food:'',p:'',f:'',c:''}, lunch:{food:'',p:'',f:'',c:''}, dinner:{food:'',p:'',f:'',c:''}, snack:{food:'',p:'',f:'',c:''} }),
  activeMeal: 'breakfast',
  trainItems: DB.get('t_train', []),   // [{text,done}]
  aiResponse: DB.get('t_aiResp', ''),
  aiAdvice: DB.get('t_aiAdvice', ''),
  selectedAI: DB.get('sel_ai', 'chatgpt'),
  records: DB.get('records', []),
  settings: DB.get('settings', { name:'', age:'', height:'', targetWeight:'', equipment:['bodyweight','dumbbells','pullup'], goal:'recomp', activityLevel:'moderate', geminiKey:'', openaiKey:'', gender:'male' }),
  graphPeriod: 30,
  waitingForAI: false,
  streak: streak,
  coachExp: coachExp,
  coachLevel: coachLevel
};

// ═══ Nav ═══
function navTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  document.querySelectorAll('.nav-item,.sidebar-link,.tab').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
  if (page === 'graph') renderGraphs();
  if (page === 'settings') renderSettings();
  if (page === 'history') renderHistory();
}

// ═══ Init ═══
document.addEventListener('DOMContentLoaded', () => {
  // Date
  const now = new Date();
  const days = ['日','月','火','水','木','金','土'];
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} (${days[now.getDay()]})`;

  // Bind body inputs
  bindVal('inp-weight', 'weight', 't_weight');
  bindVal('inp-fat', 'fat', 't_fat');
  bindVal('inp-steps', 'steps', 't_steps');
  bindTA('inp-extra-training', 'extraTraining', 't_extra');

  // AI response textarea
  const aiTA = document.getElementById('ai-response');
  if (aiTA) { aiTA.value = S.aiResponse; aiTA.addEventListener('input', () => { S.aiResponse = aiTA.value; DB.set('t_aiResp', aiTA.value); }); }

  // Meal tabs
  document.querySelectorAll('.meal-tab').forEach(t => t.addEventListener('click', () => {
    S.activeMeal = t.dataset.meal;
    document.querySelectorAll('.meal-tab').forEach(x => x.classList.toggle('active', x.dataset.meal === S.activeMeal));
    renderMeal();
  }));
  ['meal-food','meal-p','meal-f','meal-c'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.addEventListener('input', saveMeal);
  });
  renderMeal();
  renderPFC();
  renderTrainList();
  renderAIAdvice();

  // AI chips
  document.querySelectorAll('.ai-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.ai === S.selectedAI);
    c.addEventListener('click', () => {
      S.selectedAI = c.dataset.ai; DB.set('sel_ai', S.selectedAI);
      document.querySelectorAll('.ai-chip').forEach(x => x.classList.toggle('active', x.dataset.ai === S.selectedAI));
    });
  });

  // Settings
  document.querySelectorAll('.equip-btn').forEach(b => b.addEventListener('click', () => toggleEquip(b.dataset.equip)));
  document.querySelectorAll('.goal-btn').forEach(b => b.addEventListener('click', () => setGoal(b.dataset.goal)));
  document.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', () => { S.graphPeriod = +b.dataset.period; renderGraphs(); }));

  ['name','age','height'].forEach(k => bindSetting('set-'+k, k));
  bindSetting('set-target', 'targetWeight');
  bindSetting('set-gender', 'gender');
  bindSetting('set-gemini-key', 'geminiKey');
  bindSetting('set-openai-key', 'openaiKey');
  const act = document.getElementById('set-activity');
  if (act) { act.value = S.settings.activityLevel; act.addEventListener('change', () => { S.settings.activityLevel = act.value; saveSets(); }); }

  updateDeltas();
  updateBodyStatus();
  updateMetaUI();
});

function updateMetaUI() {
  const elStreak = document.getElementById('streak-val');
  if (elStreak) elStreak.textContent = S.streak;
  const elLv = document.getElementById('coach-lv');
  if (elLv) elLv.textContent = S.coachLevel;
  const elExp = document.getElementById('coach-exp');
  if (elExp) elExp.textContent = S.coachExp;
}

function bindVal(id, key, dbKey) {
  const el = document.getElementById(id); if (!el) return;
  el.value = S[key];
  el.addEventListener('input', () => { 
    S[key] = el.value; 
    DB.set(dbKey, el.value); 
    if(key==='weight'||key==='fat') updateBodyStatus();
  });
}
function bindTA(id, key, dbKey) {
  const el = document.getElementById(id); if (!el) return;
  el.value = S[key];
  el.addEventListener('input', () => { S[key] = el.value; DB.set(dbKey, el.value); });
}

// ═══ Meals ═══
function renderMeal() {
  const m = S.meals[S.activeMeal];
  document.getElementById('meal-food').value = m.food || '';
  document.getElementById('meal-p').value = m.p || '';
  document.getElementById('meal-f').value = m.f || '';
  document.getElementById('meal-c').value = m.c || '';
}
function saveMeal() {
  S.meals[S.activeMeal] = { food: document.getElementById('meal-food').value, p: document.getElementById('meal-p').value, f: document.getElementById('meal-f').value, c: document.getElementById('meal-c').value };
  DB.set('t_meals', S.meals);
  renderPFC();
}
function totalPFC() {
  let p=0,f=0,c=0;
  Object.values(S.meals).forEach(m => { p+=parseFloat(m.p)||0; f+=parseFloat(m.f)||0; c+=parseFloat(m.c)||0; });
  return {p,f,c};
}

function getTargets() {
  const s = S.settings;
  const w = parseFloat(S.weight) || parseFloat(s.targetWeight) || 60;
  const h = parseFloat(s.height) || 170;
  const a = parseFloat(s.age) || 30;
  const g = s.gender || 'male';
  let bmr = (10 * w) + (6.25 * h) - (5 * a) + (g === 'male' ? 5 : -161);
  const act = {low:1.2, moderate:1.55, high:1.725}[s.activityLevel] || 1.55;
  let tdee = bmr * act;
  let tCal = tdee;
  if (s.goal === 'cut') tCal -= 500;
  else if (s.goal === 'bulk') tCal += 300;
  const tP = w * 2;
  const tF = (tCal * 0.25) / 9;
  const tC = (tCal - (tP*4) - (tF*9)) / 4;
  return { cal: Math.round(tCal), p: Math.round(tP), f: Math.round(tF), c: Math.round(tC) };
}

function renderPFC() {
  const {p,f,c} = totalPFC();
  const tgt = getTargets();
  const kcal = p*4+f*9+c*4;
  
  document.getElementById('pfc-p-val').textContent = p.toFixed(0)+'g';
  document.getElementById('pfc-f-val').textContent = f.toFixed(0)+'g';
  document.getElementById('pfc-c-val').textContent = c.toFixed(0)+'g';
  
  const elTgtP = document.getElementById('tgt-p');
  const elTgtF = document.getElementById('tgt-f');
  const elTgtC = document.getElementById('tgt-c');
  if(elTgtP) {
    elTgtP.textContent = `/ ${tgt.p}g`;
    elTgtF.textContent = `/ ${tgt.f}g`;
    elTgtC.textContent = `/ ${tgt.c}g`;
    document.getElementById('tdee-note').textContent = `目標カロリー: ${tgt.cal} kcal (現在 ${Math.round(kcal)} kcal)`;
  }
  
  const pP = tgt.p ? Math.min(100, Math.round(p/tgt.p*100)) : 0;
  const fP = tgt.f ? Math.min(100, Math.round(f/tgt.f*100)) : 0;
  const cP = tgt.c ? Math.min(100, Math.round(c/tgt.c*100)) : 0;
  
  document.getElementById('pfc-bar-p').style.width = pP+'%';
  document.getElementById('pfc-bar-f').style.width = fP+'%';
  document.getElementById('pfc-bar-c').style.width = cP+'%';
  
  let note = ``;
  if (kcal > 0) {
    if (p >= tgt.p) note += '✅タンパク質達成 ';
    else note += `💪Pあと${(tgt.p - p).toFixed(0)}g `;
    if (kcal > tgt.cal) note += '⚠️カロリーオーバー ';
  }
  document.getElementById('pfc-note').textContent = note;
}

// ═══ Training Checklist ═══
function renderTrainList() {
  const list = document.getElementById('train-list');
  if (!list) return;
  if (S.trainItems.length === 0) { list.innerHTML = '<div class="empty-state">AIからメニューを取得、または手動追加</div>'; return; }
  list.innerHTML = S.trainItems.map((item, i) => `
    <div class="train-item ${item.done?'done':''}">
      <input type="checkbox" class="train-check" ${item.done?'checked':''} onchange="toggleTrain(${i})">
      <span class="train-text ${item.done?'done':''}">${esc(item.text)}</span>
      <button class="train-del" onclick="delTrain(${i})">x</button>
    </div>`).join('');
}
function toggleTrain(i) { 
  S.trainItems[i].done = !S.trainItems[i].done; 
  DB.set('t_train', S.trainItems); 
  renderTrainList(); 
  if (S.trainItems[i].done && S.trainItems.every(x=>x.done)) {
    triggerConfetti();
    showToast('🎉 全トレーニング達成！素晴らしい！');
  }
}
function delTrain(i) { S.trainItems.splice(i,1); DB.set('t_train', S.trainItems); renderTrainList(); }
function addTrainItem() {
  const inp = document.getElementById('train-add-input');
  const v = inp.value.trim(); if (!v) return;
  S.trainItems.push({text:v,done:false}); DB.set('t_train', S.trainItems);
  inp.value = ''; renderTrainList();
}

// ═══ AI Response Parse ═══
function parseAIResponse() {
  const text = document.getElementById('ai-response').value;
  if (!text.trim()) { showToast('返答がありません'); return; }
  
  const lines = text.split('\n');
  let inTrain = false, items = [], advice = [];
  let pfcUpdated = false;
  
  for (const line of lines) {
    const t = line.trim();
    
    // Parse PFC e.g. "朝: P:20g F:5g C:10g" or "昼(P20,F5,C10)"
    const pfcMatch = t.match(/(朝|昼|夜|間食|snack|breakfast|lunch|dinner).*?P\s*[:：]?\s*([\d\.]+).*?F\s*[:：]?\s*([\d\.]+).*?C\s*[:：]?\s*([\d\.]+)/i);
    if (pfcMatch) {
      const mealMap = {'朝':'breakfast', '昼':'lunch', '夜':'dinner', '間食':'snack', 'breakfast':'breakfast', 'lunch':'lunch', 'dinner':'dinner', 'snack':'snack'};
      const mealKey = mealMap[pfcMatch[1]];
      if (mealKey && S.meals[mealKey]) {
         S.meals[mealKey].p = Math.round(parseFloat(pfcMatch[2]));
         S.meals[mealKey].f = Math.round(parseFloat(pfcMatch[3]));
         S.meals[mealKey].c = Math.round(parseFloat(pfcMatch[4]));
         pfcUpdated = true;
      }
      // Continue to next line so this doesn't show up in advice text directly if we don't want to, but actually keeping it in advice is fine too.
      // We will skip adding purely PFC lines to advice if they start with meal name
      if (/^(朝|昼|夜|間食).*P.*F.*C/.test(t)) continue;
    }

    if (/[■【].*トレーニング|TRAINING/i.test(t)) { inTrain = true; continue; }
    if (/[■【]/.test(t) && inTrain) { inTrain = false; }
    
    if (inTrain && t) {
      // Ignore lines that look like conversational text or explanations
      if (t.includes('目的') || t.includes('おすすめ') || t.includes('頑張り') || t.includes('です') || t.includes('ます')) continue;
      const clean = t.replace(/^[\d]+[.．)）]\s*/,'').replace(/^[・\-\*]\s*/,'');
      if (clean.length > 1) items.push({text:clean, done:false});
      continue;
    }
    
    // Collect non-training content as advice
    if (!inTrain && t && !/^[■【].*トレーニング/.test(t)) advice.push(t);
  }

  // Update UI with parsed data
  if (pfcUpdated) {
    DB.set('t_meals', S.meals);
    renderMeal(); // update inputs for current active meal tab
    renderPFC();  // update total PFC UI
  }

  if (items.length > 0) {
    S.trainItems = items; DB.set('t_train', S.trainItems); renderTrainList();
    showToast(items.length + '種目を抽出し、PFCを反映しました');
  } else {
    showToast(pfcUpdated ? 'PFCのみを反映しました' : '種目が見つかりませんでした');
  }
  
  S.aiAdvice = advice.join('\n'); DB.set('t_aiAdvice', S.aiAdvice);
  renderAIAdvice();
}
function renderAIAdvice() {
  const el = document.getElementById('ai-advice');
  if (S.aiAdvice) { el.style.display = 'block'; el.textContent = S.aiAdvice; }
  else { el.style.display = 'none'; }
}

// ═══ Save Record ═══
function saveRecord() {
  saveMeal();
  const today = new Date().toISOString().slice(0,10);
  const idx = S.records.findIndex(r => r.date === today);
  const doneCount = S.trainItems.filter(x=>x.done).length;
  
  if (idx < 0) {
    S.streak++; DB.set('streak_count', S.streak);
    S.coachExp += 20;
    if (S.streak > 1 && S.streak % 7 === 0) { S.coachExp += 50; showToast('連続達成ボーナス+50EXP!'); }
  } else {
    S.coachExp += 5;
  }
  
  if (S.coachExp >= 100) {
    S.coachLevel++; S.coachExp -= 100;
    setTimeout(()=>{ triggerConfetti(); showToast(`🎉 AIコーチがLv.${S.coachLevel}にレベルアップ！`); }, 1000);
  }
  DB.set('coach_level', S.coachLevel); DB.set('coach_exp', S.coachExp);
  updateMetaUI();

  const rec = {
    date: today, weight: S.weight, fat: S.fat, steps: S.steps,
    meals: JSON.parse(JSON.stringify(S.meals)),
    trainItems: JSON.parse(JSON.stringify(S.trainItems)),
    trainDone: S.trainItems.length ? Math.round(doneCount/S.trainItems.length*100) : 0,
    extraTraining: S.extraTraining,
  };
  if (idx >= 0) S.records[idx] = rec; else S.records.push(rec);
  S.records.sort((a,b) => a.date.localeCompare(b.date));
  DB.set('records', S.records);
  showToast('保存しました');
  updateDeltas();
  updateBodyStatus();
}

// ═══ Send to AI ═══
function sendToAI() {
  saveMeal();
  const s = S.settings;
  const {p,f,c} = totalPFC();
  const kcal = Math.round(p*4+f*9+c*4);
  const equipMap = {bodyweight:'自重',dumbbells:'ダンベル×2',pullup:'懸垂機',barbell:'バーベル',bench:'ベンチ',bands:'チューブ'};
  const goalMap = {bulk:'増量',recomp:'筋肉をつけて痩せる',cut:'減量'};
  const equip = (s.equipment||[]).map(e=>equipMap[e]||e).join('・');

  // Past 7 days
  const recs = S.records.slice(-7);
  let history = '';
  if (recs.length > 0) {
    history = '【過去7日間の記録】\n';
    for (const r of recs) {
      const mStr = Object.entries(r.meals||{}).map(([k,v])=>{
        const n={breakfast:'朝',lunch:'昼',dinner:'夜',snack:'間'}[k];
        return v.food ? `${n}:${v.food}` : '';
      }).filter(Boolean).join(' / ');
      const tStr = (r.trainItems||[]).map(t=>`${t.text}${t.done?'[済]':'[未]'}`).join(', ');
      history += `${r.date}: 体重${r.weight||'-'}kg 体脂肪${r.fat||'-'}% 歩数${r.steps||'-'}\n`;
      if (mStr) history += `  食事: ${mStr}\n`;
      if (tStr) history += `  トレーニング: ${tStr} (達成率${r.trainDone||0}%)\n`;
      if (r.extraTraining) history += `  追加: ${r.extraTraining}\n`;
    }
  }

  // Today meal summary
  const mealStr = Object.entries(S.meals).map(([k,v])=>{
    const n={breakfast:'朝',lunch:'昼',dinner:'夜',snack:'間食'}[k];
    if (!v.food) return '';
    const hasPFC = (parseFloat(v.p)||parseFloat(v.f)||parseFloat(v.c));
    return `${n}: ${v.food} ${hasPFC ? `(P${v.p||0}g F${v.f||0}g C${v.c||0}g)` : '(PFC未入力)'}`;
  }).filter(Boolean).join('\n') || '未入力';

  const doneCount = S.trainItems.filter(x=>x.done).length;
  const trainStatus = S.trainItems.length ? S.trainItems.map(t=>`${t.done?'[済]':'[未]'} ${t.text}`).join('\n') : '未設定';

  let toneStr = "冷静で専門的なトーン";
  if (S.coachLevel >= 15) toneStr = "最高に熱い情熱と、絶対の信頼を寄せる親友のような口調";
  else if (S.coachLevel >= 10) toneStr = "非常にフレンドリーで、少しフランクで感情豊かな口調";
  else if (S.coachLevel >= 5) toneStr = "親しみやすく、優しく励ましてくれる温かいトーン";
  else if (S.coachLevel >= 2) toneStr = "丁寧だが少し親しみの湧くトーン";

  const prompt = `あなたは最高峰のパーソナルトレーナー兼管理栄養士です。

【ルール】
・ユーザーとの親密度（Lv.${S.coachLevel}）に合わせて、${toneStr}で回答すること。親密度が高いほど労いや褒め言葉を増やすこと。
・過去データを分析し、最適なトレーニングメニューと食事アドバイスを出す
・利用可能な器具のみでメニューを組む
・目標に合わせた負荷設定
・必要なことだけ答える
・毎日1つモチベ知識を入れる

【ユーザー情報】
名前：${s.name||'未設定'} (${s.gender==='female'?'女性':'男性'})
目標：${goalMap[s.goal]||s.goal}
器具：${equip}
${s.height?'身長：'+s.height+'cm':''}${s.age?' 年齢：'+s.age+'歳':''}${s.targetWeight?' 目標体重：'+s.targetWeight+'kg':''}
活動レベル：${s.activityLevel}

${history}
【今日の情報】
体重：${S.weight||'未入力'}kg
体脂肪率：${S.fat||'未入力'}%
歩数：${S.steps||'未入力'}歩
食事内容（PFC未入力の場合は食事名からPFCを自動計算して推測してください）：
${mealStr}
PFC合計：P${p.toFixed(0)}g / F${f.toFixed(0)}g / C${c.toFixed(0)}g（${kcal}kcal）
トレーニング実施状況：
${trainStatus}
${S.extraTraining?'追加トレーニング：'+S.extraTraining:''}

【出力形式 - 以下の形式を厳守】
■PFC推測
未入力の食事がある場合、必ず以下の形式でPFC推測値を出力すること。
朝: P:◯g F:◯g C:◯g
昼: P:◯g F:◯g C:◯g
夜: P:◯g F:◯g C:◯g
間食: P:◯g F:◯g C:◯g

■明日のトレーニング
※種目名と回数・セット数のみを箇条書きすること。目的や解説の記載は厳禁。
・種目名 ◯回×◯セット
・種目名 ◯回×◯セット

■食事アドバイス
朝:
昼:
夜:
間食:

■改善点
・

■今日の知識
・`;

  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  btn.textContent = '取得中...';

  const aiType = S.selectedAI; // 'chatgpt' or 'gemini' or 'claude'
  
  if (aiType === 'claude') {
    showToast('Claude APIは現在未対応です。GeminiかChatGPTを選択してください');
    btn.disabled = false; btn.textContent = 'SEND TO AI';
    return;
  }

  const key = aiType === 'gemini' ? S.settings.geminiKey.trim() : S.settings.openaiKey.trim();
  if (!key) {
    showToast(`設定タブで${aiType}のAPIキーを入力してください`);
    navTo('settings');
    btn.disabled = false; btn.textContent = 'SEND TO AI';
    return;
  }

  fetchAI(aiType, key, prompt).then(res => {
    document.getElementById('ai-response').value = res;
    S.aiResponse = res; DB.set('t_aiResp', res);
    parseAIResponse();
    showToast('AIの返答を取得・解析しました');
    currentImageBase64 = null;
    document.getElementById('ai-image-name').textContent = '';
  }).catch(err => {
    console.error(err);
    showToast('AI取得エラー: ' + (err.message || '不明なエラー'));
  }).finally(() => {
    btn.disabled = false; btn.textContent = 'SEND TO AI';
  });
}

let currentImageBase64 = null;
let currentImageMime = null;
function handleAIImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('ai-image-name').textContent = '📸 ' + file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentImageMime = file.type;
    currentImageBase64 = ev.target.result.split(',')[1];
  };
  reader.readAsDataURL(file);
}

async function fetchAI(type, key, prompt) {
  if (type === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const parts = [{text:prompt}];
    if (currentImageBase64) {
      parts.unshift({ inline_data: { mime_type: currentImageMime, data: currentImageBase64 } });
    }
    const req = { contents: [{parts}] };
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if(!res.ok) {
      const errData = await res.json().catch(()=>({}));
      throw new Error((errData.error && errData.error.message) ? errData.error.message : `HTTPエラー ${res.status}`);
    }
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } else if (type === 'chatgpt') {
    const url = 'https://api.openai.com/v1/chat/completions';
    const req = {
      model: 'gpt-4o-mini',
      messages: [{role:'user', content:prompt}]
    };
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+key },
      body: JSON.stringify(req)
    });
    if(!res.ok) {
      const errData = await res.json().catch(()=>({}));
      throw new Error((errData.error && errData.error.message) ? errData.error.message : `HTTPエラー ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

function fbCopy(t){const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a)}

// ═══ Deltas ═══
function updateDeltas() {
  const last = S.records.length >= 1 ? S.records[S.records.length-1] : null;
  setDelta('delta-weight', S.weight, last?.weight, 'kg');
  setDelta('delta-fat', S.fat, last?.fat, '%');
}
function setDelta(id,cur,prev,u){
  const el=document.getElementById(id);if(!el)return;
  if(!cur||!prev){el.textContent='--';el.className='metric-delta flat';return}
  const d=parseFloat(cur)-parseFloat(prev);
  el.textContent=(d>0?'+':'')+d.toFixed(1)+u;
  el.className='metric-delta '+(d===0?'flat':d>0?'up':'down');
}

// ═══ Graphs (SVG) ═══
function renderGraphs() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-S.graphPeriod+1);
  const ck = cutoff.toISOString().slice(0,10);
  const recs = S.records.filter(r=>r.date>=ck);
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',+b.dataset.period===S.graphPeriod));
  renderBar('chart-weight', recs.map(r=>({l:r.date.slice(5),v:parseFloat(r.weight)||null})), '#f0b90b');
  renderBar('chart-fat', recs.map(r=>({l:r.date.slice(5),v:parseFloat(r.fat)||null})), '#1890ff');
  renderBar('chart-steps', recs.map(r=>({l:r.date.slice(5),v:parseFloat(r.steps)||null})), '#03c076');
}
function renderBar(id,data,color){
  const c=document.getElementById(id);if(!c)return;
  const f=data.filter(d=>d.v!==null);
  if(!f.length){c.innerHTML='<div class="empty-state">No data</div>';return}
  const W=Math.max(data.length*32,c.clientWidth||320),H=130,PB=26,PT=14,PL=40,PR=8;
  const vals=f.map(d=>d.v),mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const bw=Math.max((W-PL-PR)/data.length-4,8);
  let svg='';
  for(let i=0;i<=3;i++){const v=mn+rng*i/3,y=H-PB-(v-mn)/rng*(H-PB-PT);svg+=`<text x="${PL-4}" y="${y+3}" text-anchor="end" fill="#5e6673" font-size="9">${v.toFixed(v>1000?0:1)}</text><line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#2b3139" stroke-width=".5"/>`}
  data.forEach((d,i)=>{const x=PL+i*((W-PL-PR)/data.length)+((W-PL-PR)/data.length-bw)/2;if(d.v!==null){const bh=Math.max((d.v-mn)/rng*(H-PB-PT),3),y=H-PB-bh;svg+=`<rect x="${x}" y="${y}" width="${bw}" rx="3" height="${bh}" fill="${color}" opacity=".85"/>`}if(i%Math.ceil(data.length/7)===0)svg+=`<text x="${x+bw/2}" y="${H-5}" text-anchor="middle" fill="#5e6673" font-size="9">${d.l}</text>`});
  c.innerHTML=`<div class="chart-wrap"><svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg></div>`;
}

// ═══ Settings ═══
function renderSettings(){
  const s=S.settings;
  document.getElementById('set-name').value=s.name||'';
  document.getElementById('set-age').value=s.age||'';
  document.getElementById('set-height').value=s.height||'';
  document.getElementById('set-target').value=s.targetWeight||'';
  document.getElementById('set-activity').value=s.activityLevel||'moderate';
  document.getElementById('set-gender').value=s.gender||'male';
  document.getElementById('set-gemini-key').value=s.geminiKey||'';
  document.getElementById('set-openai-key').value=s.openaiKey||'';
  document.querySelectorAll('.equip-btn').forEach(b=>b.classList.toggle('active',(s.equipment||[]).includes(b.dataset.equip)));
  document.querySelectorAll('.goal-btn').forEach(b=>b.classList.toggle('active',b.dataset.goal===s.goal));
}
function bindSetting(id,key){const el=document.getElementById(id);if(!el)return;el.addEventListener('change',()=>{S.settings[key]=el.value;saveSets();if(['height','age','targetWeight','gender','activityLevel'].includes(key)){updateBodyStatus();renderPFC();}})}
function saveSets(){DB.set('settings',S.settings)}
function toggleEquip(e){const a=S.settings.equipment||[];const i=a.indexOf(e);if(i>=0)a.splice(i,1);else a.push(e);S.settings.equipment=a;saveSets();document.querySelectorAll('.equip-btn').forEach(b=>b.classList.toggle('active',a.includes(b.dataset.equip)))}
function setGoal(g){S.settings.goal=g;saveSets();renderPFC();document.querySelectorAll('.goal-btn').forEach(b=>b.classList.toggle('active',b.dataset.goal===g))}

// ═══ History ═══
function renderHistory() {
  const hl = document.getElementById('history-list');
  if (!hl) return;
  if (!S.records.length) { hl.innerHTML = '<div class="empty-state">まだ記録がありません</div>'; return; }
  let html = '';
  const rev = [...S.records].reverse();
  for (const r of rev) {
    let tMeals = '';
    if (r.meals) {
      Object.entries(r.meals).forEach(([k,v])=>{
        if(v.food) tMeals += `${{breakfast:'朝',lunch:'昼',dinner:'夜',snack:'間'}[k]}: ${v.food}<br>`;
      });
    }
    html += `
    <div class="card" style="margin-bottom:12px; font-size:13px; line-height:1.5;">
      <div style="display:flex; justify-content:space-between; color:#03c076; font-weight:bold; margin-bottom:8px;">
        <span>${r.date}</span>
        <span>達成率 ${r.trainDone||0}%</span>
      </div>
      <div style="color:#eaecef;">
        体重: ${r.weight||'--'}kg / 体脂肪: ${r.fat||'--'}% / 歩数: ${r.steps||'--'}<br>
      </div>
      <div style="margin-top:8px; color:#848e9c; border-top:1px solid #2b3139; padding-top:8px;">
        ${tMeals||'食事記録なし'}
      </div>
    </div>`;
  }
  hl.innerHTML = html;
}

// ═══ Data Backup / Restore ═══
function exportData() {
  const data = JSON.stringify(localStorage);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `diet_ai_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if(!data.settings && !data.records) throw new Error();
      localStorage.clear();
      Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));
      showToast('復元しました。再読み込みします。');
      setTimeout(() => location.reload(), 1500);
    } catch(err) { showToast('ファイル形式が不正です'); }
  };
  reader.readAsText(file);
}

// ═══ Utils ═══
function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),2400)}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function triggerConfetti() {
  if (typeof confetti !== 'function') return;
  const duration = 2000;
  const end = Date.now() + duration;
  const colors = ['#f0b90b', '#03c076', '#1890ff', '#e84142', '#ffffff'];
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: colors });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

// ═══ Body Status (Meters) ═══
function updateBodyStatus() {
  const st = document.getElementById('body-status');
  if (!st) return;
  const h = parseFloat(S.settings.height);
  const w = parseFloat(S.weight);
  const f = parseFloat(S.fat);
  const g = S.settings.gender || 'male';

  if (!w || (!h && !f)) { st.style.display = 'none'; return; }
  st.style.display = 'block';

  // BMI
  if (w && h) {
    const hm = h / 100;
    const bmi = w / (hm * hm);
    document.getElementById('bmi-val').textContent = bmi.toFixed(1);
    let text = '', left = 0;
    if (bmi < 18.5) text = '低体重';
    else if (bmi < 25) text = '普通体重';
    else if (bmi < 30) text = '肥満(1度)';
    else text = '肥満(2度以上)';
    document.getElementById('bmi-text').textContent = text;
    // Map BMI 15-35 to 0-100%
    left = ((bmi - 15) / 20) * 100;
    document.getElementById('bmi-pointer').style.left = Math.max(0, Math.min(100, left)) + '%';
  } else {
    document.getElementById('bmi-val').textContent = '--';
    document.getElementById('bmi-text').textContent = '--';
    document.getElementById('bmi-pointer').style.left = '0%';
  }

  // Fat
  if (f) {
    document.getElementById('fat-val').textContent = f.toFixed(1);
    let text = '', left = 0;
    if (g === 'male') {
      if (f < 10) text = '低い(アスリート)';
      else if (f < 20) text = '標準';
      else if (f < 25) text = 'やや高い(軽度肥満)';
      else text = '高い(肥満)';
      left = ((f - 5) / 30) * 100; // map 5-35 to 0-100
    } else {
      if (f < 20) text = '低い(アスリート)';
      else if (f < 30) text = '標準';
      else if (f < 35) text = 'やや高い(軽度肥満)';
      else text = '高い(肥満)';
      left = ((f - 15) / 30) * 100; // map 15-45 to 0-100
    }
    document.getElementById('fat-text').textContent = text;
    document.getElementById('fat-pointer').style.left = Math.max(0, Math.min(100, left)) + '%';
  } else {
    document.getElementById('fat-val').textContent = '--';
    document.getElementById('fat-text').textContent = '--';
    document.getElementById('fat-pointer').style.left = '0%';
  }

  // Goal Progress
  const tw = parseFloat(S.settings.targetWeight);
  // Get oldest record weight as start, else current
  const startW = S.records.length > 0 ? parseFloat(S.records[0].weight) : w;
  if (w && tw && startW && tw !== startW) {
    const totalDiff = Math.abs(startW - tw);
    const currDiff = Math.abs(w - tw);
    const percent = Math.max(0, Math.min(100, ((totalDiff - currDiff) / totalDiff) * 100));
    document.getElementById('goal-diff').textContent = Math.abs(w - tw).toFixed(1);
    document.getElementById('goal-percent').textContent = percent.toFixed(1) + '%';
    document.getElementById('goal-progress-bar').style.width = percent + '%';
  } else if (w && tw) {
    document.getElementById('goal-diff').textContent = Math.abs(w - tw).toFixed(1);
    document.getElementById('goal-percent').textContent = '--%';
    document.getElementById('goal-progress-bar').style.width = '0%';
  }
}



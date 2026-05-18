'use strict';

const MAX_QUESTION_COUNT = 40;

const TYPE_LABELS = {
  scenario: { label: 'Scenario', desc: 'Choose the ISO-correct action.' },
  match: { label: 'Match', desc: 'Connect concepts and definitions.' },
  fill: { label: 'Fill Blank', desc: 'Complete ISO sentences.' },
  sort: { label: 'Order', desc: 'Sort activities or hierarchy levels.' }
};

let G = {
  incidents: [],
  idx: 0,
  states: [],
  setup: null,
  matchSelected: null,
  fillActiveBlank: 0,
  sortOrder: []
};

function getQuestionPool(){
  if(window.QUESTION_BANK && Array.isArray(window.QUESTION_BANK.questions)) return window.QUESTION_BANK.questions;
  if(Array.isArray(window.QUESTION_POOL)) return window.QUESTION_POOL;
  return [];
}

function getTopics(){
  if(Array.isArray(window.QUESTION_TOPICS)) return window.QUESTION_TOPICS;
  const ids = new Set();
  getQuestionPool().forEach(q => (q.topics || ['core']).forEach(t => ids.add(t)));
  return [...ids].map(id => ({ id, label: id, desc: 'Question bank topic' }));
}

function randomIndex(max){
  if(window.crypto && window.crypto.getRandomValues){
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffleCopy(items){
  const arr = [...items];
  for(let i = arr.length - 1; i > 0; i--){
    const j = randomIndex(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandomQuestions(pool, requestedCount, shuffleEnabled = true){
  const limit = Math.min(MAX_QUESTION_COUNT, Math.max(1, requestedCount), pool.length);
  const source = shuffleEnabled ? shuffleCopy(pool) : [...pool];
  return source.slice(0, limit);
}

function normalize(text){ return String(text || '').trim().toLowerCase(); }
function byId(id){ return document.getElementById(id); }
function ss(id){ document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); byId(id).classList.add('active'); }
function currentQuestion(){ return G.incidents[G.idx]; }
function getState(index = G.idx){ if(!G.states[index]) G.states[index] = { answered:false }; return G.states[index]; }

window.addEventListener('DOMContentLoaded', () => {
  renderSetupScreen();
  updateHUD();
});

document.addEventListener('keydown', event => {
  if(!byId('game').classList.contains('active')) return;
  const inc = currentQuestion();
  const state = getState();
  if(!inc || state.answered || inc.type !== 'scenario') return;
  const keys = ['a','b','c','d'];
  const idx = keys.indexOf(event.key.toLowerCase());
  if(idx >= 0 && inc.choices[idx]) pickScenario(idx, inc);
});

function renderSetupScreen(){
  const pool = getQuestionPool();
  const topics = getTopics();
  const typeIds = Object.keys(TYPE_LABELS).filter(type => pool.some(q => q.type === type));

  byId('bank-summary').innerHTML = `
    <div class="summary-box"><b>${pool.length}</b><span>Total questions</span></div>
    <div class="summary-box"><b>${topics.length}</b><span>Topics</span></div>
    <div class="summary-box"><b>${typeIds.length}</b><span>Types</span></div>
  `;

  byId('topic-options').innerHTML = topics.map(topic => {
    const count = pool.filter(q => (q.topics || ['core']).includes(topic.id)).length;
    return `
      <label class="option-chip">
        <input type="checkbox" name="topic" value="${topic.id}" checked />
        <span><strong>${topic.label}</strong><small>${topic.desc || ''}</small></span>
        <span class="count-badge">${count}</span>
      </label>
    `;
  }).join('');

  byId('type-options').innerHTML = typeIds.map(type => {
    const count = pool.filter(q => q.type === type).length;
    const info = TYPE_LABELS[type] || { label:type, desc:'Question type' };
    return `
      <label class="option-chip">
        <input type="checkbox" name="qtype" value="${type}" checked />
        <span><strong>${info.label}</strong><small>${info.desc}</small></span>
        <span class="count-badge">${count}</span>
      </label>
    `;
  }).join('');

  const max = Math.max(1, Math.min(MAX_QUESTION_COUNT, pool.length));
  byId('question-count').max = String(max);
  byId('question-count').value = String(Math.min((window.GAME_CONFIG && window.GAME_CONFIG.questionCount) || 40, max));
  refreshSetupMessage();

  document.querySelectorAll('input[name="topic"], input[name="qtype"], #question-count').forEach(el => {
    el.addEventListener('change', refreshSetupMessage);
    el.addEventListener('input', refreshSetupMessage);
  });
}

function selectedValues(name){
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
}

function getFilteredPoolFromSetup(){
  const topics = selectedValues('topic');
  const types = selectedValues('qtype');
  const pool = getQuestionPool();
  return pool.filter(q => {
    const qTopics = q.topics || ['core'];
    const topicOk = topics.length > 0 && qTopics.some(t => topics.includes(t));
    const typeOk = types.length > 0 && types.includes(q.type);
    return topicOk && typeOk;
  });
}

function getSetupOptions(){
  const filtered = getFilteredPoolFromSetup();
  const rawCount = parseInt(byId('question-count').value, 10);
  const requested = Number.isFinite(rawCount) ? rawCount : 1;
  return {
    topics: selectedValues('topic'),
    types: selectedValues('qtype'),
    requestedCount: Math.min(MAX_QUESTION_COUNT, Math.max(1, requested)),
    shuffle: byId('shuffle-enabled').checked,
    availableCount: filtered.length
  };
}

function refreshSetupMessage(){
  const filtered = getFilteredPoolFromSetup();
  const msg = byId('setup-message');
  const input = byId('question-count');
  if(!msg || !input) return;
  const cappedAvailable = Math.min(MAX_QUESTION_COUNT, Math.max(1, filtered.length));
  input.max = String(cappedAvailable);
  const requested = Math.min(MAX_QUESTION_COUNT, Math.max(1, parseInt(input.value || '1', 10)));
  if(String(requested) !== input.value && parseInt(input.value || '1', 10) > MAX_QUESTION_COUNT) input.value = String(MAX_QUESTION_COUNT);
  if(filtered.length === 0){
    msg.className = 'setup-message error';
    msg.textContent = 'No questions match this selection. Choose at least one topic and one type.';
  } else if(requested > filtered.length){
    msg.className = 'setup-message error';
    msg.textContent = `Only ${filtered.length} question(s) match this selection. Reduce the question count or select more topics/types.`;
  } else {
    msg.className = 'setup-message ok';
    const limitText = filtered.length > MAX_QUESTION_COUNT ? ` Maximum per quiz is ${MAX_QUESTION_COUNT}.` : '';
    msg.textContent = `${filtered.length} question(s) available. The game will pull ${requested} question(s).${limitText}`;
  }
}

function selectAllTopics(){
  document.querySelectorAll('input[name="topic"]').forEach(i => i.checked = true);
  refreshSetupMessage();
}

function selectAllTypes(){
  document.querySelectorAll('input[name="qtype"]').forEach(i => i.checked = true);
  refreshSetupMessage();
}

function previewPool(){
  const filtered = getFilteredPoolFromSetup();
  const msg = byId('setup-message');
  if(!filtered.length){ refreshSetupMessage(); return; }
  msg.className = 'setup-message ok';
  msg.innerHTML = `<b>Selected pool:</b> ${filtered.map(q => q.title).join(' · ')}`;
}

function startGame(){
  const options = getSetupOptions();
  const filtered = getFilteredPoolFromSetup();
  if(filtered.length === 0 || options.requestedCount > filtered.length){
    refreshSetupMessage();
    return;
  }
  const picked = pickRandomQuestions(filtered, options.requestedCount, options.shuffle);

  G = {
    incidents: picked,
    idx: 0,
    states: [],
    setup: options,
    matchSelected: null,
    fillActiveBlank: 0,
    sortOrder: []
  };

  buildDots();
  ss('game');
  renderStage();
}

function restartCurrentQuiz(){
  if(G.setup){
    const filtered = getFilteredPoolFromSetup();
    G.incidents = pickRandomQuestions(filtered, G.setup.requestedCount, G.setup.shuffle);
    G.idx = 0;
    G.states = [];
    buildDots();
    ss('game');
    renderStage();
  } else {
    returnToSetup();
  }
}

function returnToSetup(){
  ss('setup');
  refreshSetupMessage();
  updateHUD();
}

function updateScoreFromStates(){
  const answered = G.states.filter(Boolean).filter(s => s.answered);
  G.correct = answered.filter(s => s.ok).length;
  G.wrong = answered.filter(s => !s.ok).length;
  G.score = G.correct * 100;
  updateHUD();
}

function updateHUD(){
  byId('hud-score').textContent = G.score || 0;
  byId('hud-q').textContent = G.incidents.length ? `${G.idx + 1}/${G.incidents.length}` : '0/0';
}

function buildDots(){
  const el = byId('prog-dots');
  el.innerHTML = '';
  G.incidents.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'p-dot' + (i === 0 ? ' active' : '');
    d.id = `dot-${i}`;
    el.appendChild(d);
  });
}

function refreshDots(){
  G.incidents.forEach((_, i) => {
    const d = byId(`dot-${i}`);
    if(!d) return;
    const s = G.states[i];
    d.className = 'p-dot';
    if(s && s.answered) d.classList.add(s.ok ? 'ok' : 'fail');
    if(i === G.idx) d.classList.add('active');
  });
}

function renderStage(){
  if(!G.incidents.length){
    byId('q-area').innerHTML = '<div class="incident-box"><div class="incident-label">No questions</div><div class="incident-text">Return to setup and select a valid pool.</div></div>';
    return;
  }

  G.matchSelected = null;
  G.fillActiveBlank = 0;
  G.sortOrder = [];
  const inc = currentQuestion();
  const state = getState();

  byId('stage-num').textContent = `${G.idx + 1} / ${G.incidents.length}`;
  byId('stage-title').textContent = inc.title;
  const badge = byId('stage-badge');
  badge.textContent = inc.badge || TYPE_LABELS[inc.type]?.label || inc.type;
  badge.className = `type-badge ${inc.badgeClass || ''}`;

  const nextBtn = byId('next-btn');
  nextBtn.className = state.answered ? 'next-btn show' : 'next-btn';
  nextBtn.disabled = !state.answered;
  nextBtn.textContent = G.idx === G.incidents.length - 1 ? 'View Results →' : 'Next Incident →';
  byId('back-btn').textContent = G.idx === 0 ? 'Back to Setup' : 'Back';
  byId('hint-btn').textContent = 'Hint';

  byId('q-area').innerHTML = '';
  byId('feedback').className = 'feedback-box';
  byId('feedback').innerHTML = '';

  if(inc.type === 'scenario') renderScenario(inc, state);
  else if(inc.type === 'match') renderMatch(inc, state);
  else if(inc.type === 'fill') renderFill(inc, state);
  else if(inc.type === 'sort') renderSort(inc, state);

  if(state.answered) showFeedback(state.ok, inc);
  updateScoreFromStates();
  refreshDots();
}

function mkBox(inc){
  const wrap = document.createElement('div');
  const box = document.createElement('div');
  box.className = 'incident-box';
  const label = inc.type === 'scenario' ? '⚡ Incident Report' : inc.type === 'match' ? '🔗 Match Concepts' : inc.type === 'fill' ? '✏️ Fill in the Blank' : '📶 Order Items';
  box.innerHTML = `<div class="incident-label">${label}</div><div class="incident-text">${inc.situation}</div><div class="iso-ref">📎 ${inc.iso}</div>`;
  const hint = document.createElement('div');
  hint.className = 'hint-box';
  hint.id = 'hint-box';
  hint.innerHTML = `<b>Hint:</b> ${getHint(inc)}`;
  wrap.appendChild(box);
  wrap.appendChild(hint);
  return wrap;
}

function getHint(inc){
  if(inc.hint) return inc.hint;
  if(inc.type === 'scenario') return 'Choose the option that keeps the ISO activity, task, and work-product relationship intact.';
  if(inc.type === 'match') return 'Match by clause ownership or hierarchy level, not by everyday wording.';
  if(inc.type === 'fill') return 'Use an exact term from the word bank. After checking, every correct answer will be shown.';
  return 'For hierarchy sorting, items with the same order value are accepted as a group.';
}

function toggleHint(){
  const h = byId('hint-box');
  if(!h) return;
  h.classList.toggle('show');
  byId('hint-btn').textContent = h.classList.contains('show') ? 'Hide hint' : 'Hint';
}

function renderScenario(inc, state){
  byId('q-area').appendChild(mkBox(inc));
  const choices = document.createElement('div');
  choices.className = 'choices';
  inc.choices.forEach((choice, i) => {
    const key = String.fromCharCode(65 + i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.innerHTML = `<span class="choice-key">${key}</span><span>${choice.text}</span>`;
    btn.onclick = () => pickScenario(i, inc);
    if(state.answered){
      btn.disabled = true;
      if(choice.correct) btn.classList.add('correct');
      if(state.selectedIndex === i && !choice.correct) btn.classList.add('wrong');
    }
    choices.appendChild(btn);
  });
  byId('q-area').appendChild(choices);
}

function pickScenario(index, inc){
  const state = getState();
  if(state.answered) return;
  Object.assign(state, { answered:true, ok:Boolean(inc.choices[index].correct), selectedIndex:index });
  renderStage();
}

function renderMatch(inc, state){
  byId('q-area').appendChild(mkBox(inc));
  if(!state.rights){
    state.rights = shuffleCopy(inc.pairs.map(p => p.right));
    state.matches = {};
    state.errors = 0;
  }
  const grid = document.createElement('div');
  grid.className = 'match-area';
  const leftCol = document.createElement('div');
  const rightCol = document.createElement('div');
  leftCol.innerHTML = '<div class="match-col-head">Concept</div>';
  rightCol.innerHTML = '<div class="match-col-head">Definition / Level</div>';

  inc.pairs.forEach((pair, i) => {
    const li = document.createElement('button');
    li.type = 'button';
    li.className = 'match-item';
    li.dataset.side = 'left';
    li.dataset.idx = String(i);
    li.textContent = pair.left;
    li.onclick = () => matchClick('left', i, inc);
    if(state.matches[i] !== undefined || state.answered){ li.disabled = true; li.classList.add('matched-ok'); }
    leftCol.appendChild(li);
  });

  state.rights.forEach((right, i) => {
    const ri = document.createElement('button');
    ri.type = 'button';
    ri.className = 'match-item';
    ri.dataset.side = 'right';
    ri.dataset.idx = String(i);
    ri.textContent = right;
    ri.onclick = () => matchClick('right', i, inc);
    const used = Object.values(state.matches).includes(i);
    if(used || state.answered){ ri.disabled = true; ri.classList.add('matched-ok'); }
    rightCol.appendChild(ri);
  });
  grid.appendChild(leftCol); grid.appendChild(rightCol); byId('q-area').appendChild(grid);
}

function matchClick(side, index, inc){
  const state = getState();
  if(state.answered) return;
  const el = document.querySelector(`.match-item[data-side="${side}"][data-idx="${index}"]`);
  if(!el || el.disabled) return;

  if(!G.matchSelected || G.matchSelected.side === side){
    document.querySelectorAll('.match-item.selected').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    G.matchSelected = { side, index };
    return;
  }

  const leftIndex = side === 'left' ? index : G.matchSelected.index;
  const rightIndex = side === 'right' ? index : G.matchSelected.index;
  const rightText = state.rights[rightIndex];
  const ok = inc.pairs[leftIndex].right === rightText;
  if(ok){
    state.matches[leftIndex] = rightIndex;
    const completed = Object.keys(state.matches).length === inc.pairs.length;
    if(completed){
      state.answered = true;
      state.ok = state.errors === 0;
    }
    G.matchSelected = null;
    renderStage();
  } else {
    state.errors += 1;
    const leftEl = document.querySelector(`.match-item[data-side="left"][data-idx="${leftIndex}"]`);
    const rightEl = document.querySelector(`.match-item[data-side="right"][data-idx="${rightIndex}"]`);
    [leftEl, rightEl].forEach(node => node && node.classList.add('matched-fail'));
    setTimeout(() => [leftEl, rightEl].forEach(node => node && node.classList.remove('matched-fail','selected')), 450);
    G.matchSelected = null;
  }
}

function renderFill(inc, state){
  byId('q-area').appendChild(mkBox(inc));
  if(!state.fillAnswers) state.fillAnswers = inc.sentences.map(() => '');

  const bank = document.createElement('div');
  bank.className = 'word-bank';
  bank.innerHTML = '<div class="wb-label">Word bank — click a word, then click a blank</div>';
  inc.wordBank.forEach(word => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'word-chip';
    chip.textContent = word;
    chip.onclick = () => fillWord(word, inc);
    if(state.answered){ chip.disabled = true; }
    if(state.fillAnswers.includes(word)) chip.classList.add('used');
    bank.appendChild(chip);
  });
  byId('q-area').appendChild(bank);

  inc.sentences.forEach((sentence, i) => {
    const line = document.createElement('div');
    line.className = 'fill-line';
    const inputClass = state.answered ? (normalize(state.fillAnswers[i]) === normalize(sentence.answer) ? 'correct' : 'wrong') : (i === G.fillActiveBlank ? 'active-blank' : '');
    line.innerHTML = `
      <div class="fill-sentence">${sentence.text.replace('[?]', `<input class="blank-input ${inputClass}" id="blank-${i}" readonly placeholder="______" value="${escapeAttr(state.fillAnswers[i])}" />`)}</div>
      <div id="fill-result-${i}"></div>
    `;
    line.querySelector('.blank-input').onclick = () => setActiveBlank(i);
    byId('q-area').appendChild(line);

    if(state.answered) renderFillResult(i, sentence.answer, state.fillAnswers[i]);
  });

  const btn = document.createElement('button');
  btn.className = 'submit-btn';
  btn.type = 'button';
  btn.textContent = state.answered ? 'Answers checked' : '✓ Check Answers';
  btn.disabled = state.answered;
  btn.onclick = () => checkFill(inc);
  byId('q-area').appendChild(btn);

  if(state.answered) addFillAnswerPanel(inc, state);
}

function escapeAttr(value){
  return String(value || '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function setActiveBlank(i){
  const state = getState();
  if(state.answered) return;
  G.fillActiveBlank = i;
  document.querySelectorAll('.blank-input').forEach((b, j) => b.classList.toggle('active-blank', j === i));
}

function fillWord(word, inc){
  const state = getState();
  if(state.answered) return;
  state.fillAnswers[G.fillActiveBlank] = word;
  renderStage();
  const next = state.fillAnswers.findIndex((v, j) => j > G.fillActiveBlank && !v);
  if(next >= 0) setActiveBlank(next);
}

function checkFill(inc){
  const state = getState();
  if(state.answered) return;
  const ok = inc.sentences.every((s, i) => normalize(state.fillAnswers[i]) === normalize(s.answer));
  Object.assign(state, { answered:true, ok });
  renderStage();
}

function renderFillResult(i, correctAnswer, userAnswer){
  const target = byId(`fill-result-${i}`);
  if(!target) return;
  const ok = normalize(userAnswer) === normalize(correctAnswer);
  target.className = `fill-result ${ok ? 'ok' : 'fail'}`;
  target.innerHTML = ok
    ? `✓ Correct: <b>${correctAnswer}</b>`
    : `✗ Your answer: <b>${userAnswer || 'blank'}</b><br>Correct answer: <b>${correctAnswer}</b>`;
}

function addFillAnswerPanel(inc, state){
  const panel = document.createElement('div');
  panel.className = 'answer-panel';
  panel.innerHTML = `<div class="answer-panel-title">Correct answers</div>` + inc.sentences.map((s, i) => {
    const user = state.fillAnswers[i] || 'blank';
    const ok = normalize(user) === normalize(s.answer);
    return `<div>${i + 1}. ${ok ? '✓' : '✗'} Your answer: <b>${user}</b> · Correct answer: <b>${s.answer}</b></div>`;
  }).join('');
  byId('q-area').appendChild(panel);
}

function renderSort(inc, state){
  byId('q-area').appendChild(mkBox(inc));
  if(!state.pool){ state.pool = shuffleCopy(inc.items.map((item, idx) => ({ ...item, originalIndex: idx }))); state.order = []; }

  const pool = document.createElement('div');
  pool.className = 'sort-pool';
  pool.innerHTML = '<div class="wb-label">Click items in the correct order</div>';
  state.pool.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'sort-chip';
    chip.textContent = item.text;
    chip.onclick = () => sortClick(item);
    if(state.order.some(x => x.originalIndex === item.originalIndex)) chip.classList.add('placed');
    if(state.answered) chip.disabled = true;
    pool.appendChild(chip);
  });
  byId('q-area').appendChild(pool);

  const slots = document.createElement('div');
  slots.className = 'sort-slots';
  inc.items.forEach((_, pos) => {
    const entry = state.order[pos];
    let cls = 'sort-slot' + (entry ? ' filled' : '');
    if(state.answered && entry){
      const expectedOrders = [...inc.items].map(x => x.order).sort((a, b) => a - b);
      cls += entry.order === expectedOrders[pos] ? ' correct-slot' : ' wrong-slot';
    }
    const labelClass = entry ? 'slot-content filled-text' : 'slot-content';
    const text = entry ? entry.text : '— select a card —';
    slots.innerHTML += `<div class="${cls}"><span class="slot-num">${pos + 1}</span><span class="${labelClass}">${text}</span></div>`;
  });
  byId('q-area').appendChild(slots);

  const btn = document.createElement('button');
  btn.className = 'submit-btn';
  btn.type = 'button';
  btn.textContent = state.answered ? 'Order checked' : '✓ Confirm Order';
  btn.disabled = state.answered || state.order.length !== inc.items.length;
  btn.onclick = () => checkSort(inc);
  byId('q-area').appendChild(btn);

  if(state.answered) addSortAnswerPanel(inc, state);
}

function sortClick(item){
  const state = getState();
  if(state.answered || state.order.some(x => x.originalIndex === item.originalIndex)) return;
  state.order.push(item);
  renderStage();
}

function checkSort(inc){
  const state = getState();
  const expectedOrders = [...inc.items].map(x => x.order).sort((a, b) => a - b);
  const ok = state.order.length === inc.items.length && state.order.every((entry, pos) => entry.order === expectedOrders[pos]);
  Object.assign(state, { answered:true, ok });
  renderStage();
}

function addSortAnswerPanel(inc, state){
  const expected = [...inc.items].sort((a, b) => a.order - b.order).map((i, idx) => `${idx + 1}. ${i.text} <small>(level/order ${i.order})</small>`).join('<br>');
  const chosen = state.order.map((i, idx) => `${idx + 1}. ${i.text}`).join('<br>');
  const panel = document.createElement('div');
  panel.className = 'answer-panel';
  panel.innerHTML = `<div class="answer-panel-title">Order review</div><b>Your order</b><br>${chosen}<br><br><b>Expected order</b><br>${expected}`;
  byId('q-area').appendChild(panel);
}

function showFeedback(ok, inc){
  const fb = byId('feedback');
  fb.className = `feedback-box show ${ok ? 'ok' : 'fail'}`;
  fb.innerHTML = `<div class="fb-header"><span>${ok ? '✅' : '❌'}</span><span class="fb-title">${ok ? 'Correct — incident resolved' : 'Review required'}</span></div><div class="fb-body">${inc.lesson}</div><div class="fb-iso-tag">📎 ${inc.iso}</div>`;
  const nextBtn = byId('next-btn');
  nextBtn.className = 'next-btn show';
  nextBtn.disabled = false;
}

function nextStage(){
  const state = getState();
  if(!state.answered) return;
  if(G.idx >= G.incidents.length - 1){ showResults(); return; }
  G.idx += 1;
  renderStage();
}

function previousStage(){
  if(G.idx === 0){ returnToSetup(); return; }
  G.idx -= 1;
  renderStage();
}

function showResults(){
  updateScoreFromStates();
  ss('results');
  const pct = G.incidents.length ? Math.round((G.correct / G.incidents.length) * 100) : 0;
  let grade, title, sub;
  if(pct >= 90){ grade = 'S'; title = 'Outstanding'; sub = 'Excellent ISO/IEC 29119 command.'; }
  else if(pct >= 75){ grade = 'A'; title = 'Proficient'; sub = 'Strong understanding — minor gaps remain.'; }
  else if(pct >= 60){ grade = 'B'; title = 'Competent'; sub = 'Good foundation — review the failed incidents.'; }
  else if(pct >= 40){ grade = 'C'; title = 'Developing'; sub = 'Key concepts still need practice.'; }
  else { grade = 'F'; title = 'Needs Training'; sub = 'Review the question bank and retry.'; }

  const bestKey = 'isoIncidentBestScore';
  const best = Math.max(Number(localStorage.getItem(bestKey) || 0), G.score || 0);
  localStorage.setItem(bestKey, String(best));

  byId('best-score-pill').textContent = `Best score: ${best}`;
  byId('res-grade').textContent = grade;
  byId('res-grade').className = `res-grade grade-${grade}`;
  byId('res-title').textContent = title;
  byId('res-sub').textContent = `${sub} · ${pct}% correct`;
  byId('rb-score').textContent = G.score;
  byId('rb-correct').textContent = G.correct;
  byId('rb-wrong').textContent = G.wrong;
  byId('res-learning').innerHTML = `<b>Key takeaways:</b><br>Process ⊃ Activities ⊃ Tasks is a containment hierarchy, not a time sequence. Test Strategy is organisation-level; Test Plan is project-specific. Test completion depends on defined completion conditions, not only on running all cases.`;

  const missed = G.incidents.map((q, i) => ({ q, s:G.states[i], i })).filter(x => x.s && x.s.answered && !x.s.ok);
  byId('review-list').innerHTML = missed.length
    ? `<div class="answer-panel-title">Questions to review</div>${missed.map(x => `<div class="review-item"><b>${x.i + 1}. ${x.q.title}</b><br>${x.q.lesson}</div>`).join('')}`
    : '<div class="review-item"><b>No missed questions.</b><br>Great work.</div>';
}

// 교사 규칙표(rules/교사규칙표.csv)를 앱이 읽는 파일로 바꾸고, 음성 제작용 대본 목록을 만든다.
// 표를 고친 뒤 실행한다: node tools/build-rules.js (Build-App.ps1도 실행한다)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TABLE = path.join(ROOT, 'rules', '교사규칙표.csv');
const VOICES = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'voices');
const OUTPUT = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'dait-rules.js');
const SCRIPT = path.join(ROOT, 'voice', '규칙-대본.csv');

const MODES = { 등교: 'morning', 하교: 'afternoon', 모두: 'both' };
const TYPES = { 확인: 'confirm', 이야기: 'story', 안내: 'notice', 질문: 'question' };
const TIMINGS = ['당일', '마지막날', '전날', '앞둔 기간', ''];
const LEVELS = { 전체: ['초', '중', '고'], 초: ['초'], 중: ['중'], 고: ['고'], 중고: ['중', '고'] };
const EXTRA_LINES = [{ id: 'rule_missing', text: '아직 못 챙겼군요. 주차한 뒤 보호자와 확인해요.', use: '준비물을 못 챙겼다고 답했을 때' }];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value.trim()));
}

function fail(line, message) {
  console.error(`규칙표 ${line}번째 줄: ${message}`);
  process.exit(1);
}

function readTable() {
  const rows = parseCsv(fs.readFileSync(TABLE, 'utf8').replace(/^﻿/, ''));
  const header = rows[0];
  if (!header.includes('번호') || !header.includes('첫 말')) {
    console.error('규칙표 첫 줄을 읽지 못했습니다. 엑셀에서 저장할 때 형식을 "CSV UTF-8"로 고르세요.');
    process.exit(1);
  }
  const seen = new Set();
  return rows.slice(1).map((cells, index) => {
    const line = index + 2;
    const get = name => (cells[header.indexOf(name)] || '').trim();
    const id = get('번호');
    if (!/^\d+$/.test(id) || seen.has(id)) fail(line, `번호 '${id}'를 쓸 수 없습니다. 겹치지 않는 숫자여야 합니다.`);
    seen.add(id);
    const mode = MODES[get('여정')];
    const type = TYPES[get('대화 방식')];
    const levels = LEVELS[get('학교급')];
    const when = get('시점');
    if (!mode) fail(line, `여정은 등교, 하교, 모두 중 하나여야 합니다.`);
    if (!type) fail(line, `대화 방식은 확인, 이야기, 안내, 질문 중 하나여야 합니다.`);
    if (!levels) fail(line, `학교급은 전체, 초, 중, 고, 중고 중 하나여야 합니다.`);
    if (!TIMINGS.includes(when)) fail(line, `시점은 당일, 마지막날, 전날, 앞둔 기간 중 하나여야 합니다.`);
    const words = get('일정 낱말').split('|').map(word => word.trim()).filter(Boolean);
    const subject = get('과목');
    if (!words.length && !subject) fail(line, '일정 낱말이나 과목 중 하나는 있어야 합니다.');
    if (words.length && !when) fail(line, '일정 낱말이 있으면 시점도 있어야 합니다.');
    const first = get('첫 말');
    if (type !== 'question' && !first) fail(line, '첫 말이 비어 있습니다.');
    if ((type === 'confirm' || type === 'story') && !get('끝 말')) fail(line, '확인·이야기 방식에는 끝 말이 필요합니다.');
    return {
      id: Number(id), rank: Number(get('순위')) || 99, name: get('이름'), mode, levels, words, when, subject,
      title: get('화면 제목'), desc: get('화면 설명'), prep: get('준비물 칸') === '없음' ? '' : get('준비물 칸'),
      type, first, last: get('끝 말')
    };
  });
}

// 팀 음원(nika)이 있으면 그것을, 없으면 임시 음성(temp)을 쓴다. 둘 다 없으면 빈 값이다.
function clipPath(id) {
  if (fs.existsSync(path.join(VOICES, 'nika', `${id}.wav`))) return id;
  if (fs.existsSync(path.join(VOICES, 'temp', `${id}.wav`))) return `temp/${id}`;
  return '';
}

function clipState(clip) {
  if (!clip) return '없음';
  return clip.startsWith('temp/') ? '임시 음성' : '완성';
}

const rules = readTable().map(rule => {
  if (rule.type === 'question') return rule;
  return { ...rule, firstClip: clipPath(`r${rule.id}_1`), lastClip: rule.last ? clipPath(`r${rule.id}_2`) : '' };
});
const extras = Object.fromEntries(EXTRA_LINES.map(line => [line.id, clipPath(line.id)]));

fs.writeFileSync(OUTPUT, `// tools/build-rules.js가 rules/교사규칙표.csv에서 만든 파일이다. 직접 고치지 않는다.
(function (root) {
  const data = ${JSON.stringify({ rules, extras }, null, 2)};
  root.DAIT_RULES = data;
  if (typeof module !== 'undefined') module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
`);

const lines = [];
rules.filter(rule => rule.type !== 'question').forEach(rule => {
  lines.push([`r${rule.id}_1`, rule.first, rule.name, clipState(rule.firstClip)]);
  if (rule.last) lines.push([`r${rule.id}_2`, rule.last, rule.name, clipState(rule.lastClip)]);
});
EXTRA_LINES.forEach(line => lines.push([line.id, line.text, line.use, clipState(extras[line.id])]));
const quote = value => `"${String(value).replace(/"/g, '""')}"`;
const csv = ['음원 이름,대사,쓰이는 곳,상태', ...lines.map(cells => cells.map(quote).join(','))].join('\r\n');
fs.writeFileSync(SCRIPT, `﻿${csv}\r\n`);

const missing = lines.filter(cells => cells[3] !== '완성').length;
console.log(`규칙 ${rules.length}개, 대사 ${lines.length}개 (팀 음원 필요 ${missing}개)`);

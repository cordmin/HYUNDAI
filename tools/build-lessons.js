// 수업 대본(lessons/*.csv)을 앱이 읽는 파일로 바꾸고, 음성 제작용 대본 목록을 만든다.
// 표를 고친 뒤 실행한다: node tools/build-lessons.js (Build-App.ps1도 실행한다)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LESSONS = path.join(ROOT, 'lessons');
const LENGTHS = path.join(LESSONS, '음원길이.csv');
const OUTPUT = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'dait-lessons.js');
const VOICES = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'voices');
const SCRIPT = path.join(ROOT, 'voice', '수업-대본.csv');
const KINDS = ['복습', '이음', '도입', '전개', '발문', '정리', '짧은정리']; // 이음: 시리즈 앞 편을 바로 들은 뒤에만 앞에 붙는 말
const LEVELS = ['', '기억', '이해', '적용', '분석', '평가', '창작'];

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
  return rows;
}

function readTable(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).filter(row => row.some(Boolean));
  const [head, ...body] = rows;
  return body.map(row => Object.fromEntries(head.map((name, i) => [name, (row[i] || '').trim()])));
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function readLengths() {
  if (!fs.existsSync(LENGTHS)) return {};
  return Object.fromEntries(readTable(LENGTHS).map(row => [row['음원'], Number(row['초'])]));
}

function buildPiece(lessonId, row, lengths, file) {
  const fail = message => { throw new Error(`${file} ${row['조각']}: ${message}`); };
  if (!KINDS.includes(row['구분'])) fail(`구분이 틀렸습니다: ${row['구분']}`);
  if (!['예', '아니오'].includes(row['필수'])) fail('필수는 예 또는 아니오로 씁니다');
  if (!LEVELS.includes(row['수준'])) fail(`수준이 틀렸습니다: ${row['수준']}`);
  if (!row['대사']) fail('대사가 없습니다');
  if (!['', '8', '15', '30'].includes(row['판'] || '')) fail('판은 8, 15, 30 가운데 하나로 씁니다');
  if (row['판'] === '8' && ['복습', '이음', '짧은정리'].includes(row['구분'])) fail('짧은 판(8)에는 복습·이음·짧은 정리를 두지 않습니다');
  const clip = `lesson/${lessonId}_${row['조각']}`;
  const piece = { id: row['조각'], kind: row['구분'], must: row['필수'] === '예', line: row['화면 문장'], text: row['대사'], clip };
  if (row['판'] === '30') piece.long = true;
  if (row['판'] === '8') piece.short = true; // 짧은 판 전용 조각. 15·30분 판에는 들어가지 않는다
  if (row['수준']) piece.level = row['수준'];
  if (row['기다림']) piece.wait = Number(row['기다림']);
  if (row['묶음']) piece.group = row['묶음']; // 같은 묶음(예: 발문과 그 답)은 앱이 함께 넣고 함께 뺀다
  if (lengths[clip]) piece.seconds = lengths[clip];
  const voice = path.join(VOICES, `${clip}.m4a`);
  if (fs.existsSync(voice) && fs.statSync(voice).size > 0) piece.voiced = true; // 빈 파일은 음원으로 치지 않는다
  return piece;
}

// 묶음: 둘 이상, 같은 판, 필수 여부도 같아야 한다. 복습·이음·짧은 정리는 따로 붙는 조각이라 묶지 않는다.
function checkGroups(file, pieces) {
  const groups = {};
  pieces.filter(piece => piece.group).forEach(piece => (groups[piece.group] = groups[piece.group] || []).push(piece));
  for (const [name, members] of Object.entries(groups)) {
    const fail = message => { throw new Error(`${file} 묶음 ${name}: ${message}`); };
    if (members.length < 2) fail('조각이 둘 이상이어야 합니다');
    if (members.some(piece => ['복습', '이음', '짧은정리'].includes(piece.kind))) fail('복습·이음·짧은 정리는 묶지 않습니다');
    if (new Set(members.map(piece => `${!!piece.short}${!!piece.long}`)).size > 1) fail('판이 같아야 합니다');
    if (new Set(members.map(piece => piece.must)).size > 1) fail('필수가 모두 같아야 합니다');
    const at = members.map(piece => pieces.indexOf(piece));
    if (at.some((index, n) => n > 0 && index !== at[n - 1] + 1)) fail('묶음 조각은 대본에서 붙어 있어야 합니다');
  }
}

function build() {
  const lengths = readLengths();
  const lessons = readTable(path.join(LESSONS, '목록.csv')).map(row => {
    const pieces = readTable(path.join(LESSONS, row['파일'])).map(line => buildPiece(row['이름'], line, lengths, row['파일']));
    if (new Set(pieces.map(piece => piece.id)).size !== pieces.length) throw new Error(`${row['파일']}: 조각 이름이 겹칩니다`);
    checkGroups(row['파일'], pieces);
    if (!row['질문']) throw new Error(`목록.csv ${row['이름']}: 첫 화면에 쓸 질문이 없습니다`);
    const lesson = { id: row['이름'], title: row['제목'], question: row['질문'], subject: row['과목'], field: row['분야'], intro: row['소개'], review: row['검수'], pieces };
    // 시리즈: 「시리즈」에 묶음 이름, 「편」에 1부터 차례. 비워 두면 시리즈가 아니다.
    if (row['시리즈'] || row['편']) {
      const part = Number(row['편']);
      if (!row['시리즈'] || !Number.isInteger(part) || part < 1) throw new Error(`목록.csv ${row['이름']}: 시리즈와 편(1부터)을 함께 씁니다`);
      Object.assign(lesson, { series: row['시리즈'], part });
    }
    if (pieces.some(piece => piece.kind === '이음') && !(lesson.part > 1)) throw new Error(`${row['파일']}: 이음은 시리즈 2편부터 둡니다`);
    return lesson;
  });
  const parts = lessons.filter(lesson => lesson.series).map(lesson => `${lesson.series} ${lesson.part}`);
  if (new Set(parts).size !== parts.length) throw new Error('목록.csv: 같은 시리즈에 같은 편이 둘 있습니다');
  fs.writeFileSync(OUTPUT, `// tools/build-lessons.js가 만든 파일입니다. lessons/*.csv를 고치세요.
(function (root) {
  const DAIT_LESSONS = ${JSON.stringify(lessons, null, 1)};
  root.DAIT_LESSONS = DAIT_LESSONS;
  if (typeof module !== 'undefined') module.exports = DAIT_LESSONS;
})(typeof window !== 'undefined' ? window : globalThis);
`);
  const script = [['음원 이름', '대사', '수업', '구분', '상태']];
  lessons.forEach(lesson => lesson.pieces.forEach(piece => script.push([piece.clip.replace('lesson/', ''), piece.text, lesson.title, piece.kind, piece.voiced ? '완성' : '대기'])));
  fs.writeFileSync(SCRIPT, '﻿' + script.map(row => row.map(csvCell).join(',')).join('\n') + '\n');
  return lessons;
}

const made = build();
console.log(`수업 ${made.length}개, 조각 ${made.reduce((sum, lesson) => sum + lesson.pieces.length, 0)}개를 만들었습니다.`);

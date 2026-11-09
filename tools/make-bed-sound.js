// 수업 중 말이 멈추는 동안(발문 뒤 생각할 틈, 교시 사이 쉬는 시간) 작게 까는 배경음을 만든다.
// 소리가 끊긴 것으로 오해하지 않게 하는 용도. 낮게 울리는 화음은 무섭게 들린다는 의견(2026-11-09)에 따라
// 높고 밝은 음을 오르골처럼 가볍게 튕기는 소리로 만든다(도 장조 5음, 느린 박자, 아래에 아주 옅은 화음).
// 다른 배경음으로 바꾸려면 같은 이름의 파일(wav, 끝과 처음이 이어지는 반복용)로 덮어쓰면 된다.
//   node tools/make-bed-sound.js
const fs = require('node:fs');
const path = require('node:path');

const RATE = 22050;
const LOOP_SECONDS = 20;
const PEAK = 0.5; // 약 -6 dBFS. 너무 작으면 들리지 않아 끊김 오해를 막지 못한다(2026-11-09). 앱은 수업 음량 설정만 따른다
const OUT = path.join(__dirname, '../android/app/src/main/assets/sounds/thinking-bed.wav');

const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5 };
// 한 음에 1.25초, 20초에 16음. 오르내리는 짧은 노래 두 마디를 되풀이한다
const melody = ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', 'G5', 'C6', 'A5', 'G5', 'E5', 'D5', 'E5'];
const STEP = LOOP_SECONDS / melody.length;
const n = RATE * LOOP_SECONDS;
const samples = new Float64Array(n);

// 튕긴 음: 짧게 올라갔다가 천천히 사라진다. 끝을 넘는 꼬리는 처음으로 돌려 이어지게 한다
melody.forEach((name, k) => {
  const hz = NOTE[name];
  const start = Math.round(k * STEP * RATE);
  const length = Math.round(2.4 * RATE);
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.55);
    const v = env * (Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(2 * Math.PI * 2 * hz * t) + 0.08 * Math.sin(2 * Math.PI * 3 * hz * t));
    samples[(start + i) % n] += v;
  }
});

// 아래에 아주 옅게 까는 밝은 화음(도·미·솔). 주파수를 1/20 Hz 배수로 맞춰 끝과 처음이 이어진다
const snap = hz => Math.round(hz * LOOP_SECONDS) / LOOP_SECONDS;
[261.63, 329.63, 392.0].map(snap).forEach(hz => {
  for (let i = 0; i < n; i++) samples[i] += 0.07 * Math.sin(2 * Math.PI * hz * i / RATE);
});

const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const data = Buffer.alloc(n * 2);
samples.forEach((v, i) => data.writeInt16LE(Math.round(v / max * PEAK * 32767), i * 2));

const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
head.write('data', 36); head.writeUInt32LE(data.length, 40);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([head, data]));
console.log(`${OUT} (${LOOP_SECONDS}초 반복, ${Math.round((44 + data.length) / 1024)}KB)`);

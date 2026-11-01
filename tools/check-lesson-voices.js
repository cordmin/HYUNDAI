// 제출용 앱을 만들기 전에 수업 조각마다 음원이 있는지 확인한다. 하나라도 없으면 멈춘다.
// Build-App.ps1 -Release가 실행한다. 개발용 빌드는 음원 없이도 그대로 만들어진다.
const path = require('path');
const Lesson = require('../android/app/src/main/assets/dait-lesson.js');

const file = process.argv[2] || path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'dait-lessons.js');
const lessons = require(path.resolve(file));
const missing = Lesson.unvoiced(lessons);
const pieces = lessons.reduce((sum, lesson) => sum + lesson.pieces.length, 0);

if (missing.length > 0) {
  console.error(`수업 음원이 ${pieces}개 가운데 ${missing.length}개 없어 제출용 앱을 만들지 않습니다.`);
  console.error(`없는 음원: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` 외 ${missing.length - 10}개` : ''}`);
  console.error('voice/수업-대본.csv의 이름대로 음원을 넣고 tools/Measure-Lesson-Voice.ps1을 실행하세요.');
  process.exit(1);
}
console.log(`수업 음원 ${pieces}개를 모두 확인했습니다.`);

// 제출용 앱을 만들기 전에 수업 조각마다 음원이 있는지 확인한다. 하나라도 없으면 멈춘다.
// Build-App.ps1 -Release가 실행한다. 개발용 빌드는 음원 없이도 그대로 만들어진다.
const path = require('path');
const fs = require('fs');
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

// Future approved series must not point at missing lessons or unrecorded bridge clips.
const seriesFile=process.argv[3]||path.join(__dirname,'../android/app/src/main/assets/dait-series.js');
const series=require(path.resolve(seriesFile)),ids=new Set(lessons.map(item=>item.id));
for(const item of series){
  if(!item.title||!Array.isArray(item.lessons)||item.lessons.length<2||new Set(item.lessons).size!==item.lessons.length||item.lessons.some(id=>!ids.has(id))){console.error('시리즈의 이름·수업 순서를 확인하세요.');process.exit(1)}
  for(const [id,cue] of Object.entries(item.outros||{})){
    if(!item.lessons.includes(id)||!/^lesson\/[a-z0-9_-]+$/.test(cue.clip)||!Number.isFinite(cue.seconds)||cue.seconds<=0||cue.seconds>30||!fs.existsSync(path.join(__dirname,'../android/app/src/main/assets/voices',cue.clip+'.m4a'))){console.error('시리즈 연결 음원의 파일·길이·수업을 확인하세요.');process.exit(1)}
  }
}
console.log(`확정 시리즈 ${series.length}개의 순서·연결 음원 참조를 확인했습니다.`);

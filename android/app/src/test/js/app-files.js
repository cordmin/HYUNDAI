// 화면 코드 파일. dait-preview.html이 불러오는 차례 그대로다.
const fs = require('node:fs');
const path = require('node:path');
const assets = path.join(__dirname, '../../main/assets');
const APP_FILES = ['dait-app-core.js', 'dait-app-audio.js', 'dait-app-home.js', 'dait-app-lesson.js', 'dait-app-player.js', 'dait-app-car.js', 'dait-app-start.js'];
const read = name => fs.readFileSync(path.join(assets, name), 'utf8');
// 파일마다 따로 돌린다. 브라우저처럼, 아직 안 불러온 다음 파일의 함수를 불러오는 중에 바로 부르면 시험이 깨진다.
const appScripts = () => APP_FILES.map(name => ({ name, code: read(name) }));
const appSource = () => APP_FILES.map(read).join('\n');
module.exports = { APP_FILES, appScripts, appSource };

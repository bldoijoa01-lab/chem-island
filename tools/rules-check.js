// database.rules.json 점검: JSON 문법 + 규칙 식에 쓴 함수·변수가 Firebase 규칙 언어에 있는 것뿐인지(없는 함수를 쓰면 콘솔 게시가 실패하거나 규칙이 통째로 거부된다).
// 실제 평가는 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(ARGON.md "규칙 시뮬레이터 점검 항목"). 사용: node tools/rules-check.js
const fs = require('fs'), path = require('path');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8'));   // 문법 오류면 여기서 예외
// Realtime Database 규칙 언어의 문자열·숫자·불리언·스냅샷 메서드(공식 문서 기준). 이 밖의 메서드는 쓰지 않는다
const OK_METHODS = new Set(['val', 'child', 'parent', 'hasChild', 'hasChildren', 'exists', 'getPriority', 'isNumber', 'isString', 'isBoolean', 'contains', 'beginsWith', 'endsWith', 'replace', 'toLowerCase', 'toUpperCase', 'matches']);
const OK_IDENT = new Set(['auth', 'uid', 'token', 'data', 'newData', 'root', 'now', 'query', 'true', 'false', 'null', 'length', 'provider', 'email', 'orderByKey']);
const bad = [], seen = new Set();
(function walk(o, p) {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (/^\.(read|write|validate)$/.test(k) && typeof v === 'string') {
      const expr = v.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/\/(?:[^/\\]|\\.)+\/(?=[,)])/g, '""');   // 문자열·정규식 리터럴 제거
      for (const m of expr.matchAll(/\.([A-Za-z_]\w*)\s*\(/g)) { seen.add(m[1]); if (!OK_METHODS.has(m[1])) bad.push(`${p}/${k}: 허용되지 않은 메서드 .${m[1]}()`); }
      for (const m of expr.matchAll(/(?<![\w$.'])([A-Za-z_]\w*)\b(?!\s*\()/g)) if (!OK_IDENT.has(m[1])) bad.push(`${p}/${k}: 알 수 없는 이름 ${m[1]}`);
      if (/\bMath\.|\bparseInt|\btoString|\bindexOf|\bsubstring|\bsplit\(|\.map\(|=>/.test(expr)) bad.push(`${p}/${k}: JavaScript 전용 문법`);
    } else if (typeof v === 'object') walk(v, p + '/' + k);
  }
})(rules.rules, '');
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('규칙 점검 통과: 사용한 메서드 ' + [...seen].sort().join(', '));

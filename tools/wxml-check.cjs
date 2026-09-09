const fs = require('fs');
const file = process.argv[2];
const wxml = fs.readFileSync(file, 'utf8');
const lines = wxml.split('\n');
const stack = [];
const errs = [];
const tagRe = /<(\/?)(view|block|text|image|scroll-view|ad|svg-icon|class-card|input|textarea|picker|swiper|swiper-item|movable|cover-image)\b([^>]*?)(\/?)>/g;

for (let i = 0; i < lines.length; i++) {
  let m;
  tagRe.lastIndex = 0;
  while ((m = tagRe.exec(lines[i]))) {
    const close = m[1];
    const tag = m[2];
    const self = m[4];
    if (self === '/' || tag === 'svg-icon' || tag === 'image' || tag === 'input' || tag === 'ad') continue;
    if (close === '/') {
      const top = stack.pop();
      if (top !== tag) errs.push(`L${i + 1}: 闭合 </${tag}> 不匹配栈顶 <${top || '空'}>`);
    } else {
      stack.push(tag);
    }
  }
}
console.log('文件:', file);
console.log('最终栈深度:', stack.length);
console.log('栈残留:', stack);
console.log('错误数:', errs.length);
errs.forEach(e => console.log('  ', e));
process.exit(errs.length || stack.length ? 1 : 0);

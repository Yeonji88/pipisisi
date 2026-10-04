import {Resvg} from '@resvg/resvg-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const source=await readFile(new URL('../assets/app-icon.svg',import.meta.url),'utf8');
const render=(svg,size)=>new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
const foreground=source.replace(/<rect[^>]+\/>/,'');
const round=source.replace('rx="24"','rx="54"');
for(const [density,scale]of Object.entries({mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4})){
  const root=new URL(`../android/app/src/main/res/mipmap-${density}/`,import.meta.url);
  await mkdir(root,{recursive:true});
  await writeFile(new URL('ic_launcher.png',root),render(source,48*scale));
  await writeFile(new URL('ic_launcher_round.png',root),render(round,48*scale));
  await writeFile(new URL('ic_launcher_foreground.png',root),render(foreground,108*scale));
}
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/app-icon.png',import.meta.url),render(source,432));
console.log('계란후라이 아이콘 생성 완료');

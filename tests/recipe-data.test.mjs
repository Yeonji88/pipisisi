import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipe, parseBackup, assertRevision, backupRecipe, recipeContent, backupDuplicates, sharedRecipe } from '../src/recipe-data.mjs';
const recipe={id:'a',name:'콩나물무침',servings:2,ingredients:'콩나물 200 g',photo:'data:image/jpeg;base64,AA=='};
test('공유 데이터는 개인 메모와 즐겨찾기 및 서버 메타데이터를 제외',()=>{
  const result=sharedRecipe({...recipe,memo:'개인 메모',favorite:true,revision:5,deleted:false,recipeDate:'2026-10-05'});
  assert.equal(result.memo,'');assert.equal(result.favorite,false);assert.equal(result.revision,undefined);assert.equal(result.photo,recipe.photo);assert.equal(result.recipeDate,'2026-10-05');
});
test('등록 날짜를 백업에서도 유지하고 잘못된 날짜를 차단',()=>{
  assert.equal(normalizeRecipe(recipe).recipeDate,'');
  assert.equal(parseBackup(JSON.stringify([{...recipe,recipeDate:'2026-10-05'}]))[0].recipeDate,'2026-10-05');
  assert.throws(()=>normalizeRecipe({...recipe,recipeDate:'2026-02-30'}));
});
test('다른 ID의 동일한 레시피를 인식하고 백업 복사본만 정리',()=>{
  assert.equal(recipeContent(recipe),recipeContent({...recipe,id:'other',revision:3}));
  const list=[{...recipe,id:'backup_one'},recipe,{...recipe,id:'backup_changed',memo:'다른 메모'},{...recipe,id:'other_original'},{...recipe,id:'backup_deleted',deleted:true}];
  const result=backupDuplicates(list);assert.equal(result.length,1);assert.equal(result[0].duplicate.id,'backup_one');assert.equal(result[0].original.id,'a');
});
test('Firebase 백업 ID는 같은 데이터에서 동일하고 변경된 데이터는 별도 보존',async()=>{
  const a=await backupRecipe(recipe),b=await backupRecipe({...recipe}),c=await backupRecipe({...recipe,memo:'변경'});
  assert.equal(a.id,b.id);assert.notEqual(a.id,c.id);assert.equal(a.photo,recipe.photo);assert.ok(/^backup_[a-f0-9]{64}$/.test(a.id));
});
test('기존 데이터 및 사진 보존, 안전하지 않은 필드 제거',()=>{
  const result=normalizeRecipe({...recipe,owner:'someone'});
  assert.equal(result.photo,recipe.photo);assert.equal(result.ingredients,recipe.ingredients);assert.equal(result.favorite,false);assert.equal(result.owner,undefined);
});
test('백업 및 기존 배열을 가져오되 기존 ID는 덮어쓰지 않음',()=>{
  assert.equal(parseBackup(JSON.stringify({format:'nyam-recipe-book',version:1,recipes:[recipe]}))[0].id,'import_0');
  assert.equal(parseBackup(JSON.stringify([recipe]))[0].photo,recipe.photo);
  assert.throws(()=>parseBackup('{"recipes":[]}'));
});
test('잘못된 수량, 외부 사진 URL, 큰 문서, 위험한 ID 차단',()=>{
  for(const change of [{servings:0},{photo:'https://example.com/x.jpg'},{photo:'data:image/svg+xml;base64,AA=='},{memo:'x'.repeat(20001)},{id:"a');alert(1);//"}])assert.throws(()=>normalizeRecipe({...recipe,...change}));
});
test('오래된 수정 및 삭제로 최신 버전 덮어쓰기 차단',()=>{
  assert.doesNotThrow(()=>assertRevision(2,2));assert.throws(()=>assertRevision(3,2));assert.throws(()=>assertRevision(3,0));
});

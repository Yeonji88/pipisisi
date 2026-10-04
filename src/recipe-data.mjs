export function normalizeRecipe(r, id = r?.id) {
  if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.name.trim()) throw Error('요리 이름이 없는 레시피입니다.');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error('레시피 ID가 올바르지 않습니다.');
  const text = (key, max, fallback = '') => {
    const value = r[key] ?? fallback;
    if (typeof value !== 'string' || value.length > max) throw Error(`${key} 항목이 너무 길거나 형식이 다릅니다.`);
    return value;
  };
  const servings = Number(r.servings ?? 2);
  if (!Number.isFinite(servings) || servings < 1 || servings > 10000) throw Error('인분은 1~10000 사이로 입력해주세요.');
  const photo = text('photo', 600000);
  const recipeDate = text('recipeDate', 10);
  if(recipeDate && (!/^\d{4}-\d{2}-\d{2}$/.test(recipeDate) || !Number.isFinite(Date.parse(recipeDate)) || new Date(recipeDate).toISOString().slice(0,10)!==recipeDate))throw Error('날짜를 올바르게 입력해주세요.');
  if (photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) throw Error('사진 형식이 올바르지 않습니다.');
  return { id, name: text('name', 200).trim(), emoji: text('emoji', 100, '🍽️'), category: text('category', 100, '기타'), servings,
    ingredients: text('ingredients', 20000), steps: text('steps', 40000), memo: text('memo', 20000), favorite: r.favorite === true, photo, recipeDate };
}
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) && (!data || data.format !== 'nyam-recipe-book' || data.version !== 1)) throw Error('냠냠 레시피북 백업 파일이 아닙니다.');
  const records = Array.isArray(data) ? data : data.recipes;
  if (!Array.isArray(records) || records.length > 2000) throw Error('백업 레시피 목록이 올바르지 않습니다.');
  // 가져오기는 새 ID로 추가해서 기존 레시피를 덮어쓰지 않는다.
  return records.map((r, i) => normalizeRecipe(r, `import_${i}`));
}
export function assertRevision(actual, expected) {
  if (actual !== expected) throw Error('다른 기기에서 이 레시피를 변경했어요. 최신 내용을 열어 다시 수정해주세요.');
}
export async function backupRecipe(r) {
  const normalized = normalizeRecipe(r);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalized)));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { ...normalized, id: `backup_${hash}` };
}
export function recipeContent(r) {
  const {id,...content}=normalizeRecipe(r,'content');
  return JSON.stringify(content);
}
export function sharedRecipe(r) {
  return {...normalizeRecipe(r),memo:'',favorite:false};
}
export function backupDuplicates(records) {
  const seen=new Map(),duplicates=[];
  // 원본을 우선 보존하고, 내용이 완전히 같은 백업 복사본만 정리한다.
  const ordered=[...records].sort((a,b)=>Number(a.id.startsWith('backup_'))-Number(b.id.startsWith('backup_')));
  for(const record of ordered){
    if(record.deleted)continue;
    const key=recipeContent(record),original=seen.get(key);
    if(original&&record.id.startsWith('backup_'))duplicates.push({original,duplicate:record});
    else if(!original)seen.set(key,record);
  }
  return duplicates;
}

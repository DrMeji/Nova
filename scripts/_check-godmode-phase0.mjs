import { looksLikeImageAsk, classifyChatIntent } from '../src/lib/chatIntent.ts';
import { selectSkillsForBrief } from '../src/lib/novaSkills.ts';

const recreate = 'Recreate and improve this image in higher resolution 4K: abstract soft red gradient square';
const okImage = looksLikeImageAsk(recreate) && classifyChatIntent(recreate) === 'media';
const skills = selectSkillsForBrief('jazz festival landing page velvet tickets', 'static-web', { forCreateBuild: true });
const okSkills = skills.some(s => s.id === 'design-taste') && skills.some(s => s.id === 'preview-contract');

console.log(JSON.stringify({ okImage, okSkills, skillIds: skills.map(s => s.id) }, null, 2));
process.exit(okImage && okSkills ? 0 : 1);

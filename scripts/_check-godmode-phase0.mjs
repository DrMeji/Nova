import { looksLikeImageAsk, classifyChatIntent } from '../src/lib/chatIntent.ts';
import { selectSkillsForBrief } from '../src/lib/arkSkills.ts';

const recreate = 'Recreate and improve this image in higher resolution 4K: abstract soft red gradient square';
const okImage = looksLikeImageAsk(recreate) && classifyChatIntent(recreate) === 'media';
const skills = selectSkillsForBrief('jazz festival landing page velvet tickets', 'static-web');
const okSkills = skills.some(s => s.id === 'design-taste');

console.log(JSON.stringify({ okImage, okSkills, skillIds: skills.map(s => s.id) }, null, 2));
process.exit(okImage && okSkills ? 0 : 1);

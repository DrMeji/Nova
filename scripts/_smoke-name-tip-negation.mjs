import { fallbackCreateProjectName, extractProjectName } from '@/lib/createProjectIntent';

const a =
  'Create a new website on disk for **CedarLoom 6ad8** — textile. Unique look — not a shop twin, not a tip calculator.';
console.log('extract', extractProjectName(a));
console.log('fallback', fallbackCreateProjectName(a));
const b = 'Create a tip calculator on disk called TipWise';
console.log('tipWanted', fallbackCreateProjectName(b));

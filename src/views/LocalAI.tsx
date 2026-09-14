/**
 * Local AI route — redirects into the unified Brain page (This PC tab).
 * Engine/catalog UI lives under Brain → Installed / Recommended / Cloud / This PC.
 */
import { BrainView } from '@/views/BrainView';

export function LocalAI() {
  return <BrainView initialTab="this-pc" />;
}

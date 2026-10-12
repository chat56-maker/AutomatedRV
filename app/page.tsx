import { requireChatGPTUser } from './chatgpt-auth';
import Lab from '@/components/lab';
export const dynamic = 'force-dynamic';
export default async function Page(){ const user=await requireChatGPTUser('/'); return <Lab user={{name:user.displayName,email:user.email}}/>; }

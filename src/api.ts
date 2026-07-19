const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'offline';
  reason?: string;
  ollama?: string;
  gemma4_available?: boolean;
}

export interface SkinProfile {
  skin_type: string;
  visible_conditions: string[];
  helpful_ingredient_categories: string[];
  avoid_ingredient_categories: string[];
  scar_regions: string[];
  stated_goal: string;
  scanned_at?: string;
}

export interface ProductAnalysis {
  product_name: string;
  ingredients_in_order: string[];
  verdict: string;
  flagged_ingredients: string[];
  beneficial_ingredients: string[];
  goal_alignment: string;
  goal_alignment_label: string;
  summary: string;
}

export interface MarketplaceProduct {
  name: string;
  brand: string;
  reason: string;
  concern_flag: string | null;
  match_score: number;
  price: number;
}

export interface ScanHistoryItem extends ProductAnalysis {
  scanned_at: string;
  face_id: string;
}

export interface ReportData {
  skin_health_score: number;
  score_trend: 'improving' | 'stable' | 'declining';
  total_products_scanned: number;
  improving_products: number;
  concerning_products: number;
  neutral_products: number;
  top_strength: string;
  top_weakness: string;
  recommendation: string;
}

function getFaceId(): string {
  return localStorage.getItem('hifu_face_id') || '';
}

function setFaceId(id: string) {
  localStorage.setItem('hifu_face_id', id);
}

export function getSessionToken(): string {
  return localStorage.getItem('hifu_session_token') || '';
}

export function getUserName(): string {
  return localStorage.getItem('hifu_user_name') || '';
}

export function isAuthenticated(): boolean {
  return !!getSessionToken();
}

export function clearAuth() {
  localStorage.removeItem('hifu_session_token');
  localStorage.removeItem('hifu_face_id');
  localStorage.removeItem('hifu_user_name');
}

export { getFaceId, setFaceId };

class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function handleResponse(r: Response): Promise<any> {
  const body = await r.json();
  if (!body.success) throw new ApiError(body.error || 'Unknown error', r.status);
  return body;
}

export async function healthCheck(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { status: 'offline', reason: body.reason || 'Unreachable' };
    }
    return await res.json();
  } catch {
    return { status: 'offline', reason: 'Cannot connect to backend' };
  }
}

export async function assessSkin(file: File, goal: string, faceId?: string): Promise<{ face_id: string; data: SkinProfile }> {
  const fd = new FormData();
  fd.append('image', file);
  if (goal) fd.append('goal', goal);
  if (faceId) fd.append('face_id', faceId);
  const res = await fetch(`${BASE}/api/assess-skin`, { method: 'POST', body: fd });
  const body = await handleResponse(res);
  setFaceId(body.face_id);
  return { face_id: body.face_id, data: body.data };
}

export async function analyzeProduct(file: File, assessment?: SkinProfile, faceId?: string): Promise<ProductAnalysis> {
  const fd = new FormData();
  fd.append('image', file);
  if (assessment) fd.append('assessment', JSON.stringify(assessment));
  if (faceId) fd.append('face_id', faceId);
  const res = await fetch(`${BASE}/api/analyze-product`, { method: 'POST', body: fd });
  const body = await handleResponse(res);
  return body.data;
}

export async function getProfile(faceId: string): Promise<SkinProfile> {
  const res = await fetch(`${BASE}/api/profile/${faceId}`);
  const body = await handleResponse(res);
  return body.data;
}

export async function getHistory(faceId: string): Promise<ScanHistoryItem[]> {
  const res = await fetch(`${BASE}/api/history/${faceId}`);
  const body = await handleResponse(res);
  return body.data;
}

export async function generateReport(faceId: string, profile?: SkinProfile, history?: ScanHistoryItem[]): Promise<ReportData> {
  const body = { face_id: faceId, profile: profile || null, history: history || [] };
  const res = await fetch(`${BASE}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await handleResponse(res);
  return data.data;
}

export async function marketplaceSearch(faceId: string, goal: string): Promise<MarketplaceProduct[]> {
  const fd = new FormData();
  fd.append('face_id', faceId);
  if (goal) fd.append('goal', goal);
  const res = await fetch(`${BASE}/api/marketplace-search`, { method: 'POST', body: fd });
  const body = await handleResponse(res);
  return body.results;
}

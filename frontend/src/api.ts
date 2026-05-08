const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const MIS_TIMEZONE_OFFSET = '+03:00'
const MIS_TIMEZONE = 'Europe/Moscow'

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
}

function toMisDayQuery(day: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MIS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(day)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  // Send day in clinic timezone to avoid device-local timezone shifts.
  return `${y}-${m}-${d}T12:00:00${MIS_TIMEZONE_OFFSET}`
}

export type Employee = {
  mis_id: string
  surname: string | null
  name: string | null
  patronymic: string | null
  phone: string | null
  specialty: string | null
  full_name: string
}

export type Branch = {
  mis_id: string
  title: string
}

export type Service = {
  mis_id: string
  name: string | null
  price: number | null
  clinic_id: string | null
}

export type FreeSlot = {
  start: string
  end: string
  clinic_mis_id: string | null
}

export type DaySlot = FreeSlot & {
  status: 'free' | 'busy'
  service_mis_id: string | null
  service_name: string | null
}

export type Appointment = {
  id: string
  mis_guid: string | null
  status: string
  slot_start: string
  employee_mis_id: string
}

export type SyncStatus = {
  last_sync_at: string | null
  last_ok: boolean | null
  message: string | null
}

export async function fetchDoctors(clinicMisId?: string): Promise<Employee[]> {
  const q = new URLSearchParams()
  if (clinicMisId) q.set('clinic_mis_id', clinicMisId)
  const res = await fetch(`${API_BASE}/doctors${q.toString() ? `?${q}` : ''}`)
  return parseJson(res)
}

export async function fetchBranches(): Promise<Branch[]> {
  const res = await fetch(`${API_BASE}/doctors/branches`)
  return parseJson(res)
}

export async function fetchServices(): Promise<Service[]> {
  const res = await fetch(`${API_BASE}/doctors/services`)
  return parseJson(res)
}

export async function fetchDoctorServices(employeeId: string): Promise<Service[]> {
  const res = await fetch(`${API_BASE}/doctors/${encodeURIComponent(employeeId)}/services`)
  return parseJson(res)
}

export async function fetchDoctorBranches(employeeId: string): Promise<Branch[]> {
  const res = await fetch(`${API_BASE}/doctors/${encodeURIComponent(employeeId)}/branches`)
  return parseJson(res)
}

export async function fetchFreeSlots(employeeId: string, day: Date, clinicMisId?: string): Promise<FreeSlot[]> {
  const q = new URLSearchParams({ day: toMisDayQuery(day) })
  if (clinicMisId) q.set('clinic_mis_id', clinicMisId)
  const res = await fetch(`${API_BASE}/slots/${encodeURIComponent(employeeId)}/free?${q}`)
  return parseJson(res)
}

export async function fetchDaySlots(employeeId: string, day: Date, clinicMisId?: string): Promise<DaySlot[]> {
  const q = new URLSearchParams({ day: toMisDayQuery(day) })
  if (clinicMisId) q.set('clinic_mis_id', clinicMisId)
  const res = await fetch(`${API_BASE}/slots/${encodeURIComponent(employeeId)}/day?${q}`)
  return parseJson(res)
}

export type BookPayload = {
  employee_mis_id: string
  slot_start: string
  slot_end?: string
  clinic_mis_id?: string
  service_mis_id?: string
  patient_surname: string
  patient_name: string
  patient_patronymic?: string
  birthday: string
  phone: string
}

export async function createAppointment(body: BookPayload): Promise<Appointment> {
  const res = await fetch(`${API_BASE}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function getAppointment(id: string): Promise<Appointment> {
  const res = await fetch(`${API_BASE}/appointments/${encodeURIComponent(id)}`)
  return parseJson(res)
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API_BASE}/sync/status`)
  return parseJson(res)
}

export type AdminTile = {
  id: string
  title: string
  tile_type: string
  size: string
  sort_order: number
  specialty_filters: string | null
  image_url: string | null
  image_fit?: string
  image_x?: number
  image_y?: number
  image_scale?: number
  is_active: boolean
}

export type AdminDocument = {
  id: string
  title: string
  file_url: string
  sort_order: number
  is_active: boolean
}

export type AdminBanner = {
  id: string
  title: string
  image_url: string
  description: string | null
  card_image_url: string | null
  card_image_fit?: string
  card_image_x?: number
  card_image_y?: number
  card_image_scale?: number
  list_image_url: string | null
  list_image_fit?: string
  list_image_x?: number
  list_image_y?: number
  list_image_scale?: number
  target_url: string | null
  sort_order: number
  is_active: boolean
}

export type AdminDoctorMedia = {
  id: string
  employee_mis_id: string
  photo_url: string
  experience_label: string | null
  badge1_label?: string | null
  badge2_label?: string | null
  badge3_label?: string | null
  show_in_sections?: boolean
  show_in_branch_filters?: boolean
  hidden_clinic_ids?: string[]
  show_specialty?: boolean
}

export type AdminCheckupItem = {
  id: string
  title: string
  subtitle: string | null
  group_title: string
  price_label: string | null
  list_image_url: string | null
  image_url: string | null
  image_fit?: string
  image_x?: number
  image_y?: number
  image_scale?: number
  description: string | null
  included_left?: string | null
  included_right?: string | null
  post_info_text?: string | null
  cta_text?: string | null
  registry_note?: string | null
  content_json?: string | null
  sort_order: number
  is_active: boolean
}

export type AdminCheckupGroupTile = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  image_fit?: string
  image_x?: number
  image_y?: number
  image_scale?: number
  sort_order: number
  is_active: boolean
}

export type FeatureFlag = {
  key: string
  enabled: boolean
}

export async function uploadAdminFile(file: File, folder: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/admin/upload?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    body: form,
  })
  const data = await parseJson<{ url: string }>(res)
  return data.url
}

export async function listAdminTiles(): Promise<AdminTile[]> {
  const res = await fetch(`${API_BASE}/admin/tiles`)
  return parseJson(res)
}

export async function createAdminTile(body: Omit<AdminTile, 'id'>): Promise<AdminTile> {
  const res = await fetch(`${API_BASE}/admin/tiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminTile(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/tiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function listAdminDocuments(): Promise<AdminDocument[]> {
  const res = await fetch(`${API_BASE}/admin/documents`)
  return parseJson(res)
}

export async function createAdminDocument(body: Omit<AdminDocument, 'id'>): Promise<AdminDocument> {
  const res = await fetch(`${API_BASE}/admin/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function listAdminBanners(): Promise<AdminBanner[]> {
  const res = await fetch(`${API_BASE}/admin/banners`)
  return parseJson(res)
}

export async function createAdminBanner(body: Omit<AdminBanner, 'id'>): Promise<AdminBanner> {
  const res = await fetch(`${API_BASE}/admin/banners`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function updateAdminBanner(id: string, body: Omit<AdminBanner, 'id'>): Promise<AdminBanner> {
  const res = await fetch(`${API_BASE}/admin/banners/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminBanner(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/banners/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function listAdminDoctorMedia(): Promise<AdminDoctorMedia[]> {
  const res = await fetch(`${API_BASE}/admin/doctor-media`)
  return parseJson(res)
}

export async function upsertAdminDoctorMedia(body: {
  employee_mis_id: string
  photo_url: string
  experience_label?: string | null
  badge1_label?: string | null
  badge2_label?: string | null
  badge3_label?: string | null
  show_in_sections?: boolean
  show_in_branch_filters?: boolean
  hidden_clinic_ids?: string[]
  show_specialty?: boolean
}): Promise<AdminDoctorMedia> {
  const res = await fetch(`${API_BASE}/admin/doctor-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminDoctorMedia(employeeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/doctor-media/${encodeURIComponent(employeeId)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function updateAdminDoctorName(employeeId: string, body: {
  surname: string
  name: string
  patronymic?: string | null
}): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/doctors/${encodeURIComponent(employeeId)}/name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await parseJson(res)
}

export async function listAdminCheckups(): Promise<AdminCheckupItem[]> {
  const res = await fetch(`${API_BASE}/admin/checkups`)
  return parseJson(res)
}

export async function createAdminCheckup(body: Omit<AdminCheckupItem, 'id'>): Promise<AdminCheckupItem> {
  const res = await fetch(`${API_BASE}/admin/checkups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function updateAdminCheckup(id: string, body: Omit<AdminCheckupItem, 'id'>): Promise<AdminCheckupItem> {
  const res = await fetch(`${API_BASE}/admin/checkups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminCheckup(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/checkups/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function listAdminCheckupGroups(): Promise<AdminCheckupGroupTile[]> {
  const res = await fetch(`${API_BASE}/admin/checkup-groups`)
  return parseJson(res)
}

export async function createAdminCheckupGroup(body: Omit<AdminCheckupGroupTile, 'id'>): Promise<AdminCheckupGroupTile> {
  const res = await fetch(`${API_BASE}/admin/checkup-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function updateAdminCheckupGroup(id: string, body: Omit<AdminCheckupGroupTile, 'id'>): Promise<AdminCheckupGroupTile> {
  const res = await fetch(`${API_BASE}/admin/checkup-groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteAdminCheckupGroup(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/checkup-groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseJson(res)
}

export async function getCheckupsFeatureFlag(): Promise<FeatureFlag> {
  const res = await fetch(`${API_BASE}/admin/features/checkups`)
  return parseJson(res)
}

export async function setCheckupsFeatureFlag(enabled: boolean): Promise<FeatureFlag> {
  const res = await fetch(`${API_BASE}/admin/features/checkups`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  return parseJson(res)
}

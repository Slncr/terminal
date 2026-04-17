const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
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

export async function fetchDoctors(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE}/doctors`)
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

export async function fetchFreeSlots(employeeId: string, day: Date): Promise<FreeSlot[]> {
  const q = new URLSearchParams({ day: day.toISOString() })
  const res = await fetch(`${API_BASE}/slots/${encodeURIComponent(employeeId)}/free?${q}`)
  return parseJson(res)
}

export async function fetchDaySlots(employeeId: string, day: Date): Promise<DaySlot[]> {
  const q = new URLSearchParams({ day: day.toISOString() })
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

export async function upsertAdminDoctorMedia(body: { employee_mis_id: string; photo_url: string }): Promise<AdminDoctorMedia> {
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

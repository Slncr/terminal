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

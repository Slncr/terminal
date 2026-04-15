import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAppointment,
  fetchDaySlots,
  fetchDoctorServices,
  fetchDoctors,
  fetchSyncStatus,
  getAppointment,
  type DaySlot,
  type Employee,
  type Service,
  type SyncStatus,
} from './api'

type DoctorGroup = {
  title: string
  specialties: string[]
}

type MainView =
  | { kind: 'home' }
  | { kind: 'doctors'; title: string; doctors: Employee[] }
  | { kind: 'doctor'; doctor: Employee }

const DIAGNOSTIC_GROUPS: DoctorGroup[] = [
  { title: 'МРТ', specialties: ['мрт', 'магнитно-резонанс'] },
  { title: 'КТ', specialties: ['кт', 'компьютерн'] },
  { title: 'Рентген', specialties: ['рентген'] },
  { title: 'УЗИ', specialties: ['узи', 'ультразвук'] },
  { title: 'Эндоскопия', specialties: ['эндоскоп'] },
  { title: 'Функциональная диагностика', specialties: ['функциональн', 'ээг', 'эхо'] },
]

function formatDayRu(d: Date): string {
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTimeRange(slot: DaySlot): string {
  const a = new Date(slot.start)
  const b = new Date(slot.end)
  const opt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return `${a.toLocaleTimeString('ru-RU', opt)} — ${b.toLocaleTimeString('ru-RU', opt)}`
}

export default function App() {
  const [view, setView] = useState<MainView>({ kind: 'home' })
  const [doctors, setDoctors] = useState<Employee[]>([])
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMeta = useCallback(async () => {
    try {
      const [d, st] = await Promise.all([fetchDoctors(), fetchSyncStatus()])
      setDoctors(d)
      setSync(st)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMeta()
    const id = window.setInterval(() => void refreshMeta(), 60_000)
    return () => window.clearInterval(id)
  }, [refreshMeta])

  const syncLabel = useMemo(() => {
    if (!sync?.last_sync_at) return 'Синхронизация ещё не выполнялась'
    const t = new Date(sync.last_sync_at).toLocaleString('ru-RU')
    if (sync.last_ok === false) return `Последняя синхронизация: ${t} (ошибка)`
    return `Обновлено: ${t}`
  }, [sync])

  return (
    <div className="app-shell">
      <main>
        {loadError && (
          <div className="empty-hint" style={{ marginBottom: '1rem', color: 'var(--danger)' }}>
            {loadError}
          </div>
        )}
        {loading && <div className="empty-hint">Загрузка…</div>}
        {!loading && view.kind === 'home' && (
          <HomeTiles
            doctors={doctors}
            syncLabel={syncLabel}
            onOpenDoctors={() => setView({ kind: 'doctors', title: 'Все врачи', doctors })}
            onOpenGroup={(title, doctorsInGroup) => setView({ kind: 'doctors', title, doctors: doctorsInGroup })}
          />
        )}
        {!loading && view.kind === 'doctors' && (
          <DoctorGrid
            title={view.title}
            doctors={view.doctors}
            onBack={() => setView({ kind: 'home' })}
            onPick={(d) => setView({ kind: 'doctor', doctor: d })}
          />
        )}
        {!loading && view.kind === 'doctor' && (
          <DoctorSchedule
            doctor={view.doctor}
            onBack={() => setView({ kind: 'doctors', title: 'Все врачи', doctors })}
            onBooked={() => void refreshMeta()}
          />
        )}
      </main>
    </div>
  )
}

function HomeTiles({
  doctors,
  syncLabel,
  onOpenDoctors,
  onOpenGroup,
}: {
  doctors: Employee[]
  syncLabel: string
  onOpenDoctors: () => void
  onOpenGroup: (title: string, doctorsInGroup: Employee[]) => void
}) {
  const specialtyGroups = useMemo(() => {
    const unique = new Set<string>()
    for (const d of doctors) {
      const s = (d.specialty ?? '').trim()
      if (s) unique.add(s)
    }
    return Array.from(unique).slice(0, 8)
  }, [doctors])

  const doctorsForSpecialty = useCallback(
    (needle: string) => {
      const q = needle.trim().toLowerCase()
      return doctors.filter((d) => (d.specialty ?? '').toLowerCase().includes(q))
    },
    [doctors],
  )

  const doctorsForAny = useCallback(
    (needles: string[]) => {
      const qs = needles.map((x) => x.trim().toLowerCase()).filter(Boolean)
      return doctors.filter((d) => {
        const s = (d.specialty ?? '').toLowerCase()
        return qs.some((q) => s.includes(q))
      })
    },
    [doctors],
  )

  return (
    <section className="home-layout">
      <button type="button" className="consumer-btn">
        Уголок потребителя
      </button>

      <div className="home-head">
        <div className="logo-mark">ЕВРОДОН</div>
        <h1>Добро пожаловать</h1>
        <p>{syncLabel}</p>
      </div>

      <div className="home-grid">
        <div className="home-left">
          <button type="button" className="home-tile home-tile-large tile-doctors" onClick={onOpenDoctors}>
            <span>Врачи</span>
          </button>
          <button
            type="button"
            className="home-tile home-tile-large tile-diagnostics"
            onClick={() =>
              onOpenGroup('Диагностика', doctorsForAny(DIAGNOSTIC_GROUPS.flatMap((g) => g.specialties)))
            }
          >
            <span>Диагностика</span>
          </button>
          <div className="specialties-grid">
            {specialtyGroups.map((s) => (
              <button
                key={s}
                type="button"
                className="home-tile home-tile-small"
                onClick={() =>
                  onOpenGroup(s, doctorsForSpecialty(s))
                }
              >
                {s}
              </button>
            ))}
            {specialtyGroups.length === 0 && (
              <div className="home-tile home-tile-small">Нет данных по специализациям</div>
            )}
          </div>
        </div>

        <div className="home-right">
          <button type="button" className="home-tile home-tile-side tile-vacancies">
            <span>Вакансии</span>
          </button>
          <button
            type="button"
            className="home-tile home-tile-side tile-cosmo"
            onClick={() =>
              onOpenGroup('Косметология', doctorsForAny(['косметолог', 'дерматолог', 'эстет']))
            }
          >
            <span>Косметология</span>
          </button>
          <button
            type="button"
            className="home-tile home-tile-side tile-pedia"
            onClick={() =>
              onOpenGroup('Педиатрия', doctorsForAny(['педиатр', 'детск']))
            }
          >
            <span>Педиатрия</span>
          </button>
        </div>
      </div>

      <div className="diagnostic-groups">
        {DIAGNOSTIC_GROUPS.map((g) => (
          <button
            key={g.title}
            type="button"
            className="diag-chip"
            onClick={() =>
              onOpenGroup(g.title, doctorsForAny(g.specialties))
            }
          >
            {g.title}
          </button>
        ))}
      </div>
    </section>
  )
}

function DoctorGrid({
  title,
  doctors,
  onBack,
  onPick,
}: {
  title: string
  doctors: Employee[]
  onBack: () => void
  onPick: (d: Employee) => void
}) {
  if (!doctors.length) {
    return (
      <div className="empty-hint">
        Список врачей пуст. Проверьте подключение к МИС и выполните синхронизацию на сервере.
      </div>
    )
  }
  return (
    <>
      <button type="button" className="back-btn" onClick={onBack}>
        ← На главный экран
      </button>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
      </div>
      <div className="grid-doctors">
        {doctors.map((d) => (
          <button
            key={d.mis_id}
            type="button"
            className="card interactive"
            onClick={() => onPick(d)}
            style={{ cursor: 'pointer' }}
          >
            <h2>{d.full_name}</h2>
            {d.specialty && <div className="meta">{d.specialty}</div>}
            {d.phone && <div className="meta">тел. {d.phone}</div>}
          </button>
        ))}
      </div>
    </>
  )
}

function DoctorSchedule({
  doctor,
  onBack,
  onBooked,
}: {
  doctor: Employee
  onBack: () => void
  onBooked: () => void
}) {
  const [day, setDay] = useState(() => {
    const n = new Date()
    n.setHours(12, 0, 0, 0)
    return n
  })
  const [slots, setSlots] = useState<DaySlot[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [picked, setPicked] = useState<DaySlot | null>(null)

  useEffect(() => {
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    fetchDaySlots(doctor.mis_id, day)
      .then((s) => {
        if (!cancelled) setSlots(s)
      })
      .catch((e) => {
        if (!cancelled) setSlotsError(e instanceof Error ? e.message : 'Ошибка')
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doctor.mis_id, day])

  useEffect(() => {
    let cancelled = false
    fetchDoctorServices(doctor.mis_id)
      .then((rows) => {
        if (!cancelled) setServices(rows)
      })
      .catch(() => {
        if (!cancelled) setServices([])
      })
    return () => {
      cancelled = true
    }
  }, [doctor.mis_id])

  const shiftDay = (delta: number) => {
    setDay((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() + delta)
      return n
    })
  }

  return (
    <>
      <button type="button" className="back-btn" onClick={onBack}>
        ← К списку врачей
      </button>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>{doctor.full_name}</h2>
        {doctor.specialty && <div className="meta">{doctor.specialty}</div>}
      </div>
      <div className="toolbar">
        <div className="date-nav">
          <button type="button" aria-label="Предыдущий день" onClick={() => shiftDay(-1)}>
            ‹
          </button>
          <span>{formatDayRu(day)}</span>
          <button type="button" aria-label="Следующий день" onClick={() => shiftDay(1)}>
            ›
          </button>
        </div>
      </div>
      {slotsLoading && <div className="empty-hint">Загрузка слотов…</div>}
      {slotsError && <div className="empty-hint">{slotsError}</div>}
      {!slotsLoading && !slotsError && slots.length === 0 && (
        <div className="empty-hint">На выбранный день нет свободных окон по данным терминала.</div>
      )}
      {!slotsLoading && !slotsError && slots.length > 0 && (
        <div className="slots-grid">
          {slots.map((s) => (
            <button
              key={`${s.start}-${s.status}`}
              type="button"
              className="slot-btn"
              disabled={s.status === 'busy'}
              onClick={() => setPicked(s)}
              title={s.status === 'busy' ? s.service_name ?? 'Занято' : 'Свободно'}
            >
              {s.status === 'busy' ? '❌ ' : '✅ '}
              {formatTimeRange(s)}
            </button>
          ))}
        </div>
      )}
      {picked && (
        <BookingModal
          doctor={doctor}
          slot={picked}
          services={services}
          onClose={() => setPicked(null)}
          onBooked={onBooked}
        />
      )}
    </>
  )
}

function BookingModal({
  doctor,
  slot,
  services,
  onClose,
  onBooked,
}: {
  doctor: Employee
  slot: DaySlot
  services: Service[]
  onClose: () => void
  onBooked: () => void
}) {
  const [surname, setSurname] = useState('')
  const [name, setName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [birthday, setBirthday] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    setOk(false)
    try {
      const appt = await createAppointment({
        employee_mis_id: doctor.mis_id,
        slot_start: slot.start,
        slot_end: slot.end,
        clinic_mis_id: slot.clinic_mis_id ?? undefined,
        service_mis_id: serviceId || undefined,
        patient_surname: surname,
        patient_name: name,
        patient_patronymic: patronymic || undefined,
        birthday,
        phone: phone.replace(/\D/g, ''),
      })
      let current = appt
      for (let i = 0; i < 20 && current.status === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        current = await getAppointment(appt.id)
      }
      if (current.status === 'success') {
        setOk(true)
        setMsg('Запись создана. Ждём вас в клинике.')
        onBooked()
      } else {
        setMsg(
          current.status === 'mis_error'
            ? 'МИС отклонила запись. Уточните данные на стойке регистрации.'
            : 'Не удалось завершить запись. Обратитесь к администратору.',
        )
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>Запись к {doctor.full_name}</h3>
        <p className="meta" style={{ marginTop: '-0.5rem' }}>
          {formatTimeRange(slot)} · {formatDayRu(new Date(slot.start))}
        </p>
        <div className="form-grid">
          <label>
            Фамилия
            <input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" />
          </label>
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </label>
          <label>
            Отчество
            <input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} />
          </label>
          <label>
            Дата рождения
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </label>
          <label>
            Телефон
            <input
              inputMode="tel"
              placeholder="79001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          {services.length > 0 && (
            <label>
              Услуга (необязательно)
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">— не выбрано —</option>
                {services.map((s) => (
                  <option key={s.mis_id} value={s.mis_id}>
                    {s.name ?? s.mis_id}
                    {s.price != null ? ` · ${s.price} ₽` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {msg && <div className={`status-msg ${ok ? 'ok' : 'err'}`}>{msg}</div>}
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !surname.trim() || !name.trim() || !birthday || phone.replace(/\D/g, '').length < 10}
            onClick={() => void submit()}
          >
            {busy ? 'Отправка…' : 'Записаться'}
          </button>
        </div>
      </div>
    </div>
  )
}

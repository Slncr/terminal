import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAppointment,
  createAdminBanner,
  createAdminCheckup,
  createAdminCheckupGroup,
  createAdminDocument,
  createAdminTile,
  deleteAdminBanner,
  deleteAdminCheckup,
  deleteAdminCheckupGroup,
  deleteAdminDocument,
  deleteAdminDoctorMedia,
  updateAdminDoctorName,
  deleteAdminTile,
  fetchDaySlots,
  fetchFreeSlots,
  fetchDoctorServices,
  fetchDoctors,
  fetchSyncStatus,
  getCheckupsFeatureFlag,
  getAppointment,
  listAdminBanners,
  listAdminCheckups,
  listAdminCheckupGroups,
  listAdminDoctorMedia,
  listAdminDocuments,
  listAdminTiles,
  uploadAdminFile,
  updateAdminBanner,
  updateAdminCheckup,
  updateAdminCheckupGroup,
  setCheckupsFeatureFlag,
  upsertAdminDoctorMedia,
  type AdminBanner,
  type AdminCheckupGroupTile,
  type AdminDoctorMedia,
  type AdminDocument,
  type AdminCheckupItem,
  type AdminTile,
  type DaySlot,
  type Employee,
  type Service,
  type SyncStatus,
} from './api'

type FixedTilePreset = {
  key: string
  title: string
  tile_type: 'main' | 'specialty' | 'side'
  size: 'large' | 'small' | 'side'
  sort_order: number
  specialty_filters: string | null
}

type TileImageMeta = {
  url: string | null
  fit: string
  x: number
  y: number
  scale: number
}

type MainView =
  | { kind: 'home' }
  | { kind: 'consumer' }
  | { kind: 'doctors'; title: string; doctors: Employee[] }
  | { kind: 'doctor'; doctor: Employee }
  | { kind: 'promos' }
  | { kind: 'promo'; banner: AdminBanner }
  | { kind: 'checkups' }
  | { kind: 'checkup-group'; groupTitle: string }
  | { kind: 'checkup'; item: AdminCheckupItem }

const FUNCTIONAL_COMMON_FILTERS = 'экг,ээг,экг социалистическая,мрт,магнитно-резонанс,кт,компьютерн,рентген'

const FIXED_TILE_PRESETS: FixedTilePreset[] = [
  { key: 'main-specialists', title: 'Услуги специалистов', tile_type: 'main', size: 'large', sort_order: -1000, specialty_filters: null },
  {
    key: 'main-instrumental',
    title: 'Инструментальная диагностика',
    tile_type: 'main',
    size: 'large',
    sort_order: -999,
    specialty_filters: FUNCTIONAL_COMMON_FILTERS,
  },
  { key: 'side-actions', title: 'Акции', tile_type: 'side', size: 'side', sort_order: -1000, specialty_filters: null },
  { key: 'side-cosmo', title: 'Косметология', tile_type: 'side', size: 'side', sort_order: -999, specialty_filters: 'косметолог,дерматолог,эстет' },
  { key: 'side-checkup', title: 'Программы check-up', tile_type: 'side', size: 'side', sort_order: -998, specialty_filters: 'check-up,чекап,чек-ап,программа' },
  { key: 'small-trauma', title: 'Травматолог-ортопед', tile_type: 'specialty', size: 'small', sort_order: -1000, specialty_filters: 'травматолог,ортопед' },
  { key: 'small-neuro', title: 'Невролог', tile_type: 'specialty', size: 'small', sort_order: -999, specialty_filters: 'невролог' },
  { key: 'small-lor', title: 'ЛОР-врач', tile_type: 'specialty', size: 'small', sort_order: -998, specialty_filters: 'лор,отоларинголог,отолоринголог,оториноларинголог' },
  { key: 'small-derma', title: 'Дерматолог', tile_type: 'specialty', size: 'small', sort_order: -997, specialty_filters: 'дерматолог' },
  { key: 'small-mrt', title: 'МРТ', tile_type: 'specialty', size: 'small', sort_order: -996, specialty_filters: 'мрт,магнитно-резонанс' },
  { key: 'small-xray', title: 'Рентген', tile_type: 'specialty', size: 'small', sort_order: -995, specialty_filters: 'рентген' },
  { key: 'small-ct', title: 'КТ', tile_type: 'specialty', size: 'small', sort_order: -994, specialty_filters: 'кт,компьютерн' },
  { key: 'small-us', title: 'УЗИ', tile_type: 'specialty', size: 'small', sort_order: -993, specialty_filters: 'узи,ультразвук' },
]

function formatDayRu(d: Date): string {
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function dateKeyMoscow(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function formatTimeMoscow(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  })
}

function formatDayMoscow(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  })
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function normalizeCheckupCategory(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('ru-RU')
}

function displayCheckupCategory(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed || 'Общий'
}

type CheckupContentBlock = {
  id: string
  type: 'heading' | 'subheading' | 'paragraph' | 'list'
  text: string
  font_size: number
  is_bold: boolean
}

function parseCheckupContentJson(raw: string | null | undefined): CheckupContentBlock[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x, idx) => ({
        id: String(x.id ?? `block-${idx}`),
        type: (['heading', 'subheading', 'paragraph', 'list'].includes(String(x.type))
          ? String(x.type)
          : 'paragraph') as CheckupContentBlock['type'],
        text: String(x.text ?? ''),
        font_size: Math.max(14, Math.min(64, Number(x.font_size ?? 24))),
        is_bold: Boolean(x.is_bold),
      }))
  } catch {
    return []
  }
}

function createCheckupContentBlock(type: CheckupContentBlock['type']): CheckupContentBlock {
  const textByType: Record<CheckupContentBlock['type'], string> = {
    heading: 'Новый заголовок',
    subheading: 'Новый подзаголовок',
    paragraph: 'Новый абзац',
    list: 'Пункт 1\nПункт 2\nПункт 3',
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text: textByType[type],
    font_size: type === 'heading' ? 44 : type === 'subheading' ? 34 : 28,
    is_bold: type !== 'paragraph',
  }
}

function makeLegacyCheckupBlocks(item: {
  title?: string | null
  description?: string | null
  included_left?: string | null
  included_right?: string | null
  post_info_text?: string | null
  cta_text?: string | null
  registry_note?: string | null
}): CheckupContentBlock[] {
  const out: CheckupContentBlock[] = []
  const push = (type: CheckupContentBlock['type'], text: string, fontSize: number, isBold: boolean) => {
    const value = text.trim()
    if (!value) return
    out.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text: value,
      font_size: fontSize,
      is_bold: isBold,
    })
  }
  push('heading', item.title ?? '', 50, false)
  push('subheading', 'Описание услуги', 42, false)
  push('paragraph', item.description ?? '', 30, false)
  push('subheading', 'В чекап входят:', 42, false)
  push('list', item.included_left ?? '', 28, false)
  push('list', item.included_right ?? '', 28, false)
  push('paragraph', item.post_info_text ?? '', 28, false)
  push('paragraph', item.cta_text ?? '', 30, true)
  push('paragraph', item.registry_note ?? '', 26, false)
  return out
}

export default function App() {
  const isAdminMode = window.location.pathname.startsWith('/admin')
  const lastSyncSeenRef = useRef<string | null>(null)
  const [view, setView] = useState<MainView>({ kind: 'home' })
  const [doctors, setDoctors] = useState<Employee[]>([])
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tiles, setTiles] = useState<AdminTile[]>([])
  const [documents, setDocuments] = useState<AdminDocument[]>([])
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [checkups, setCheckups] = useState<AdminCheckupItem[]>([])
  const [checkupGroups, setCheckupGroups] = useState<AdminCheckupGroupTile[]>([])
  const [checkupsEnabled, setCheckupsEnabled] = useState(true)
  const [doctorMedia, setDoctorMedia] = useState<Record<string, AdminDoctorMedia>>({})

  const refreshMeta = useCallback(async () => {
    try {
      const [d, st, t, docs, b, c, cg, dm, checkupFeature] = await Promise.all([
        fetchDoctors(),
        fetchSyncStatus(),
        listAdminTiles(),
        listAdminDocuments(),
        listAdminBanners(),
        listAdminCheckups(),
        listAdminCheckupGroups(),
        listAdminDoctorMedia(),
        getCheckupsFeatureFlag(),
      ])
      setDoctors(d)
      setSync(st)
      setTiles(t.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setDocuments(docs.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setBanners(b.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setCheckups(c.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setCheckupGroups(cg.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setCheckupsEnabled(checkupFeature.enabled)
      const map: Record<string, AdminDoctorMedia> = {}
      for (const row of dm) map[row.employee_mis_id] = row
      setDoctorMedia(map)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMeta()
    const id = window.setInterval(() => void refreshMeta(), 240_000)
    return () => window.clearInterval(id)
  }, [refreshMeta])

  useEffect(() => {
    if (isAdminMode) return
    if (!sync?.last_sync_at) return
    const marker = new Date(sync.last_sync_at).toISOString()
    if (!lastSyncSeenRef.current) {
      lastSyncSeenRef.current = marker
      return
    }
    if (marker !== lastSyncSeenRef.current) {
      window.location.reload()
    }
  }, [isAdminMode, sync?.last_sync_at])

  const syncLabel = useMemo(() => {
    if (!sync?.last_sync_at) return 'Синхронизация ещё не выполнялась'
    const t = new Date(sync.last_sync_at).toLocaleString('ru-RU')
    if (sync.last_ok === false) return `Последняя синхронизация: ${t} (ошибка)`
    return `Обновлено: ${t}`
  }, [sync])

  const sectionVisibleDoctors = useMemo(
    () => doctors.filter((d) => doctorMedia[d.mis_id]?.show_in_sections !== false),
    [doctors, doctorMedia],
  )

  if (isAdminMode) {
    return <AdminPanel doctors={doctors} syncLabel={syncLabel} />
  }

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
            doctors={sectionVisibleDoctors}
            doctorMedia={doctorMedia}
            onOpenConsumer={() => setView({ kind: 'consumer' })}
            onOpenDoctors={() => setView({ kind: 'doctors', title: 'Все врачи', doctors: sectionVisibleDoctors })}
            onOpenGroup={(title, doctorsInGroup) => setView({ kind: 'doctors', title, doctors: doctorsInGroup })}
            onOpenDoctor={(doctor) => setView({ kind: 'doctor', doctor })}
            onOpenPromos={() => setView({ kind: 'promos' })}
            onOpenCheckups={() => setView({ kind: 'checkups' })}
            tiles={tiles}
            banners={banners}
          />
        )}
        {!loading && view.kind === 'consumer' && (
          <ConsumerCornerScreen documents={documents} onBack={() => setView({ kind: 'home' })} />
        )}
        {!loading && view.kind === 'promos' && (
          <PromoGrid banners={banners} onBack={() => setView({ kind: 'home' })} onPick={(b) => setView({ kind: 'promo', banner: b })} />
        )}
        {!loading && view.kind === 'promo' && (
          <PromoDetails banner={view.banner} onBack={() => setView({ kind: 'promos' })} />
        )}
        {!loading && view.kind === 'checkups' && (
          checkupsEnabled ? (
            <CheckupGroups
              items={checkups}
              groupTiles={checkupGroups}
              onBack={() => setView({ kind: 'home' })}
              onPickGroup={(groupTitle) => setView({ kind: 'checkup-group', groupTitle })}
            />
          ) : (
            <div className="empty-hint">Раздел в разработке</div>
          )
        )}
        {!loading && view.kind === 'checkup-group' && (
          <CheckupGrid
            title={view.groupTitle}
            items={checkups.filter((x) => normalizeCheckupCategory(displayCheckupCategory(x.group_title)) === normalizeCheckupCategory(view.groupTitle))}
            onBack={() => setView({ kind: 'checkups' })}
            onPick={(item) => setView({ kind: 'checkup', item })}
          />
        )}
        {!loading && view.kind === 'checkup' && (
          <CheckupDetails
            item={view.item}
            onBack={() => {
              const fallback = displayCheckupCategory(view.item.group_title)
              const linked = checkupGroups.find((g) => normalizeCheckupCategory(g.title) === normalizeCheckupCategory(fallback))
              setView({ kind: 'checkup-group', groupTitle: linked?.title || fallback })
            }}
          />
        )}
        {!loading && view.kind === 'doctors' && (
          <DoctorGrid
            doctors={view.doctors}
            doctorMedia={doctorMedia}
            onBack={() => setView({ kind: 'home' })}
            onPick={(d) => setView({ kind: 'doctor', doctor: d })}
          />
        )}
        {!loading && view.kind === 'doctor' && (
          <DoctorSchedule
            doctor={view.doctor}
            doctorPhoto={doctorMedia[view.doctor.mis_id]?.photo_url}
            doctorMeta={doctorMedia[view.doctor.mis_id]}
            onBack={() => setView({ kind: 'doctors', title: 'Все врачи', doctors: sectionVisibleDoctors })}
            onBooked={() => {
              void refreshMeta()
              setView({ kind: 'home' })
            }}
          />
        )}
      </main>
    </div>
  )
}

function HomeTiles({
  doctors,
  doctorMedia,
  onOpenConsumer,
  onOpenDoctors,
  onOpenGroup,
  onOpenDoctor,
  onOpenPromos,
  onOpenCheckups,
  tiles,
  banners,
}: {
  doctors: Employee[]
  doctorMedia: Record<string, AdminDoctorMedia>
  onOpenConsumer: () => void
  onOpenDoctors: () => void
  onOpenGroup: (title: string, doctorsInGroup: Employee[]) => void
  onOpenDoctor: (doctor: Employee) => void
  onOpenPromos: () => void
  onOpenCheckups: () => void
  tiles: AdminTile[]
  banners: AdminBanner[]
}) {
  const consumerCornerEnabled = true
  const [promoIndex, setPromoIndex] = useState(0)
  const specialtyGroups = useMemo(() => {
    const unique = new Set<string>()
    for (const d of doctors) {
      const s = (d.specialty ?? '').trim()
      if (s) unique.add(s)
    }
    return Array.from(unique).slice(0, 8)
  }, [doctors])

  const doctorsForAny = useCallback(
    (needles: string[]) => {
      const qs = needles.map((x) => x.trim().toLowerCase()).filter(Boolean)
      return doctors.filter((d) => {
        if (doctorMedia[d.mis_id]?.show_in_sections === false) return false
        const s = (d.specialty ?? '').toLowerCase()
        const fio = (d.full_name ?? '').toLowerCase()
        const haystack = `${s} ${fio}`.trim()
        const tokens = haystack.split(/[^a-zа-я0-9]+/i).filter(Boolean)
        return qs.some((q) => {
          if (q.length <= 2) return tokens.includes(q)
          return haystack.includes(q)
        })
      })
    },
    [doctorMedia, doctors],
  )

  const parsedTiles = useMemo(() => {
    if (!tiles.length) return null
    const main = tiles.filter((t) => t.tile_type === 'main')
    const side = tiles.filter((t) => t.tile_type === 'side')
    const small = tiles.filter((t) => t.tile_type === 'specialty')
    return { main, side, small }
  }, [tiles])

  const defaultMainTiles: AdminTile[] = useMemo(
    () => [
      {
        id: 'default-main-doctors',
        title: 'Услуги специалистов',
        tile_type: 'main',
        size: 'large',
        sort_order: -1000,
        specialty_filters: null,
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-main-diag',
        title: 'Инструментальная диагностика',
        tile_type: 'main',
        size: 'large',
        sort_order: -999,
        specialty_filters: FUNCTIONAL_COMMON_FILTERS,
        image_url: null,
        is_active: true,
      },
    ],
    [],
  )

  const defaultSmallTiles: AdminTile[] = useMemo(
    () => [
      {
        id: 'default-small-trauma',
        title: 'Травматолог-ортопед',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -1000,
        specialty_filters: 'травматолог,ортопед',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-neuro',
        title: 'Невролог',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -999,
        specialty_filters: 'невролог',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-lor',
        title: 'ЛОР-врач',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -998,
        specialty_filters: 'лор,отоларинголог,отолоринголог,оториноларинголог',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-derma',
        title: 'Дерматолог',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -997,
        specialty_filters: 'дерматолог',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-mrt',
        title: 'МРТ',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -996,
        specialty_filters: 'мрт,магнитно-резонанс',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-xray',
        title: 'Рентген',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -995,
        specialty_filters: 'рентген',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-ct',
        title: 'КТ',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -994,
        specialty_filters: 'кт,компьютерн',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-small-us',
        title: 'УЗИ',
        tile_type: 'specialty',
        size: 'small',
        sort_order: -993,
        specialty_filters: 'узи,ультразвук',
        image_url: null,
        is_active: true,
      },
    ],
    [],
  )

  const defaultSideTiles: AdminTile[] = useMemo(
    () => [
      {
        id: 'default-side-actions',
        title: 'Акции',
        tile_type: 'side',
        size: 'side',
        sort_order: -1000,
        specialty_filters: null,
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-side-cos',
        title: 'Косметология',
        tile_type: 'side',
        size: 'side',
        sort_order: -999,
        specialty_filters: 'косметолог,дерматолог,эстет',
        image_url: null,
        is_active: true,
      },
      {
        id: 'default-side-checkup',
        title: 'Программы check-up',
        tile_type: 'side',
        size: 'side',
        sort_order: -998,
        specialty_filters: 'check-up,чекап,чек-ап,программа',
        image_url: null,
        is_active: true,
      },
    ],
    [],
  )

  const mergeTilesByTitle = useCallback((base: AdminTile[], extra: AdminTile[]) => {
    // Admin tiles take precedence, defaults fill only missing titles.
    const out = [...extra]
    const titles = new Set(extra.map((x) => x.title.trim().toLowerCase()))
    for (const row of base) {
      const key = row.title.trim().toLowerCase()
      if (titles.has(key)) continue
      titles.add(key)
      out.push(row)
    }
    return out.sort((a, b) => a.sort_order - b.sort_order)
  }, [])

  const mainTiles = useMemo(
    () => mergeTilesByTitle(defaultMainTiles, parsedTiles?.main ?? []),
    [defaultMainTiles, mergeTilesByTitle, parsedTiles?.main],
  )
  const smallTiles = useMemo(
    () => mergeTilesByTitle(defaultSmallTiles, parsedTiles?.small ?? []),
    [defaultSmallTiles, mergeTilesByTitle, parsedTiles?.small],
  )
  const sideTiles = useMemo(
    () => mergeTilesByTitle(defaultSideTiles, parsedTiles?.side ?? []),
    [defaultSideTiles, mergeTilesByTitle, parsedTiles?.side],
  )

  const openByFilters = useCallback(
    (title: string, filters: string | null, directSingle: boolean = false) => {
      const normalizedTitle = title.trim().toLocaleLowerCase('ru-RU')
      const effectiveFilters =
        normalizedTitle === 'инструментальная диагностика'
          ? FUNCTIONAL_COMMON_FILTERS
          : (filters ?? '')
      const needles = effectiveFilters
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      if (!needles.length) {
        onOpenDoctors()
        return
      }
      const matched = doctorsForAny(needles)
      if (directSingle && matched.length === 1) {
        onOpenDoctor(matched[0])
        return
      }
      onOpenGroup(title, matched)
    },
    [doctorsForAny, onOpenDoctor, onOpenDoctors, onOpenGroup],
  )

  useEffect(() => {
    if (banners.length <= 1) return
    const id = window.setInterval(() => {
      setPromoIndex((i) => (i + 1) % banners.length)
    }, 5000)
    return () => window.clearInterval(id)
  }, [banners.length])

  const getTileClassName = useCallback((tile: AdminTile, place: 'main' | 'side' | 'small') => {
    const title = tile.title.toLowerCase()
    if (place === 'main') {
      if (title.includes('услуги')) return 'tile-specialists'
      return 'tile-instrumental'
    }
    if (place === 'side') {
      if (title.includes('акци')) return 'tile-actions'
      if (title.includes('космет')) return 'tile-cosmo'
      return 'tile-checkup'
    }
    const isDiag = ['мрт', 'кт', 'рентген', 'узи'].some((x) => title.includes(x))
    return isDiag ? 'tile-small-diagnostics' : 'tile-small-specialists'
  }, [])

  const getTileImageMeta = useCallback(
    (tile: AdminTile): TileImageMeta => {
      const title = tile.title.toLowerCase()
      const activePromo = banners.length ? banners[promoIndex % banners.length] : null
      const promoUrl = activePromo ? activePromo.card_image_url || activePromo.image_url : null
      const promoFit = activePromo?.card_image_fit || 'cover'
      const promoX = Number(activePromo?.card_image_x ?? 0)
      const promoY = Number(activePromo?.card_image_y ?? 0)
      const promoScale = Number(activePromo?.card_image_scale ?? 100)
      const isActions = title.includes('акци')
      return {
        url: isActions ? promoUrl || tile.image_url : tile.image_url || null,
        fit: isActions ? promoFit : tile.image_fit || 'cover',
        x: isActions ? promoX : Number(tile.image_x ?? 0),
        y: isActions ? promoY : Number(tile.image_y ?? 0),
        scale: isActions ? promoScale : Number(tile.image_scale ?? 100),
      }
    },
    [banners, promoIndex],
  )

  const renderTileTitle = useCallback((title: string, splitSecondLine: boolean) => {
    if (!splitSecondLine) {
      return <span className="tile-title">{title}</span>
    }
    const parts = title.trim().split(/\s+/)
    if (parts.length < 2) {
      return <span className="tile-title">{title}</span>
    }
    const first = parts[0]
    const rest = parts.slice(1).join(' ')
    return (
      <span className="tile-title">
        <span className="tile-title-line">{first}</span>
        <span className="tile-title-line">{rest}</span>
      </span>
    )
  }, [])

  return (
    <section className="home-layout">
      {consumerCornerEnabled && (
        <button type="button" className="consumer-btn" onClick={onOpenConsumer}>
          Уголок потребителя
        </button>
      )}

      <div className="home-head">
        <div className="logo-mark">
          <img src="/logo.svg" alt="Евродон" className="logo-mark-img" decoding="async" />
        </div>
        <h1>Добро пожаловать</h1>
      </div>

      <div className="home-grid">
        <div className="home-left">
          <div className="home-left-main-grid">
            {mainTiles.slice(0, 2).map((t) => (
              (() => {
                const image = getTileImageMeta(t)
                return (
              <button
                key={t.id}
                type="button"
                className={`home-tile home-tile-large ${getTileClassName(t, 'main')}`}
                onClick={() => openByFilters(t.title, t.specialty_filters)}
              >
                {image.url && (
                  <img
                    src={image.url}
                    alt=""
                    className="tile-image tile-image-main"
                    aria-hidden
                    style={{
                      objectFit: image.fit === 'contain' ? 'contain' : 'cover',
                      transform: `translate(${image.x}px, ${image.y}px) scale(${Math.max(0.2, image.scale / 100)})`,
                    }}
                  />
                )}
                {renderTileTitle(t.title, true)}
                <span className="tile-more">Подробнее</span>
              </button>
                )
              })()
            ))}
          </div>
          <div className="specialties-grid home-left-small-scroll scroll-beauty">
            {smallTiles.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`home-tile home-tile-small ${getTileClassName(t, 'small')}`}
                onClick={() => {
                  const diagnosticFast = ['мрт', 'кт', 'рентген'].some((x) => t.title.toLowerCase().includes(x))
                  openByFilters(t.title, t.specialty_filters, diagnosticFast)
                }}
              >
                {renderTileTitle(t.title, false)}
                <span className="tile-more">Подробнее</span>
              </button>
            ))}
            {specialtyGroups.length === 0 && (
              <div className="home-tile home-tile-small">Нет данных по специализациям</div>
            )}
          </div>
        </div>

        <div className="home-right">
          <div className="home-right-scroll scroll-beauty">
            {sideTiles.map((t) => (
              (() => {
                const image = getTileImageMeta(t)
                const isActionsShuffling = t.title.toLowerCase().includes('акци') && banners.length > 0
                return (
              <button
                key={t.id}
                type="button"
                className={`home-tile home-tile-side ${getTileClassName(t, 'side')}`}
                onClick={() => {
                  if (t.title.toLowerCase().includes('акци')) {
                    onOpenPromos()
                    return
                  }
                  if (t.title.toLowerCase().includes('check-up') || t.title.toLowerCase().includes('чекап') || t.title.toLowerCase().includes('чек-ап')) {
                    onOpenCheckups()
                    return
                  }
                  openByFilters(t.title, t.specialty_filters)
                }}
              >
                {image.url && (
                  <img
                    src={image.url}
                    alt=""
                    className="tile-image tile-image-side"
                    aria-hidden
                    style={{
                      objectFit: image.fit === 'contain' ? 'contain' : 'cover',
                      transform: `translate(${image.x}px, ${image.y}px) scale(${Math.max(0.2, image.scale / 100)})`,
                    }}
                  />
                )}
                {!isActionsShuffling && renderTileTitle(t.title, true)}
                {!isActionsShuffling && <span className="tile-more">Подробнее</span>}
              </button>
                )
              })()
            ))}
          </div>
        </div>
      </div>

    </section>
  )
}

function PromoGrid({
  banners,
  onBack,
  onPick,
}: {
  banners: AdminBanner[]
  onBack: () => void
  onPick: (banner: AdminBanner) => void
}) {
  return (
    <>
      <div className="doctors-page-head promo-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Акции</h2>
      </div>
      {banners.length === 0 ? (
        <div className="empty-hint">Пока нет активных акций.</div>
      ) : (
        <div className="promo-grid">
          {banners.map((b) => (
            <button key={b.id} type="button" className="promo-card" onClick={() => onPick(b)}>
              <div className="promo-card-image-wrap">
                <img
                  src={b.list_image_url || b.image_url}
                  alt={b.title}
                  className="promo-card-image"
                  style={{
                    objectFit: b.list_image_fit === 'contain' ? 'contain' : 'cover',
                    transform: `translate(${Number(b.list_image_x ?? 0)}px, ${Number(b.list_image_y ?? 0)}px) scale(${Math.max(0.2, Number(b.list_image_scale ?? 100) / 100)})`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
      <PromoInfoNote />
    </>
  )
}

function PromoDetails({ banner, onBack }: { banner: AdminBanner; onBack: () => void }) {
  return (
    <>
      <div className="doctors-page-head promo-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Акции</h2>
      </div>
      <div className="promo-details-page">
        <section className="promo-details">
          <h3 className="promo-details-title">{banner.title}</h3>
          <div className="promo-details-body">
            <div className="promo-details-image-wrap promo-details-image-wrap-small">
              <img src={banner.image_url} alt={banner.title} className="promo-details-image" loading="lazy" decoding="async" />
            </div>
            <div className="promo-details-right">
              <div className="promo-details-text">{banner.description?.trim() || 'Описание акции скоро появится.'}</div>
            </div>
          </div>
        </section>
        <PromoInfoNote />
      </div>
    </>
  )
}

function PromoInfoNote() {
  return (
    <div className="promo-info-note">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <circle cx="13" cy="13" r="12.1" stroke="#0094F5" strokeWidth="1.8" />
        <line x1="13" y1="6" x2="13" y2="16" stroke="#0094F5" strokeWidth="2" strokeLinecap="round" />
        <circle cx="13" cy="20" r="1" fill="#0094F5" />
      </svg>
      <span>Все акции и предложения проводится в Евродон Социалистическая</span>
    </div>
  )
}

function CheckupGroups({
  items,
  groupTiles,
  onBack,
  onPickGroup,
}: {
  items: AdminCheckupItem[]
  groupTiles: AdminCheckupGroupTile[]
  onBack: () => void
  onPickGroup: (groupTitle: string) => void
}) {
  const defaultGroupOrder = ['Общий', 'Мужской', 'Женский', 'Детский', 'Госпитальный']
  const groups = useMemo(() => {
    const countMap = new Map<string, number>()
    for (const item of items) {
      const key = normalizeCheckupCategory(displayCheckupCategory(item.group_title))
      countMap.set(key, (countMap.get(key) ?? 0) + 1)
    }
    const normalized = groupTiles.map((x) => ({
      groupTitle: x.title,
      description: x.description ?? '',
      image: x.image_url ?? null,
      image_fit: x.image_fit ?? 'cover',
      image_x: Number(x.image_x ?? 0),
      image_y: Number(x.image_y ?? 0),
      image_scale: Number(x.image_scale ?? 100),
      count: countMap.get(normalizeCheckupCategory(x.title)) ?? 0,
      sort_order: x.sort_order,
    }))
    for (const key of defaultGroupOrder) {
      if (!normalized.some((x) => x.groupTitle.toLowerCase() === key.toLowerCase())) {
        normalized.push({
          groupTitle: key,
          description: '',
          image: null,
          image_fit: 'cover',
          image_x: 0,
          image_y: 0,
          image_scale: 100,
          count: countMap.get(normalizeCheckupCategory(key)) ?? 0,
          sort_order: 999,
        })
      }
    }
    return normalized.sort((a, b) => {
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      const ai = defaultGroupOrder.findIndex((x) => x.toLowerCase() === a.groupTitle.toLowerCase())
      const bi = defaultGroupOrder.findIndex((x) => x.toLowerCase() === b.groupTitle.toLowerCase())
      const av = ai === -1 ? 999 : ai
      const bv = bi === -1 ? 999 : bi
      return av - bv || a.groupTitle.localeCompare(b.groupTitle, 'ru')
    })
  }, [items, groupTiles])

  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Программы Check-up</h2>
      </div>
      <div className="checkup-groups-grid">
        <div className="checkup-groups-row checkup-groups-row-top">
          {groups.slice(0, 3).map((g) => (
            <button
              key={g.groupTitle}
              type="button"
              className={`checkup-group-card checkup-group-card--top ${g.groupTitle.toLowerCase().includes('муж') ? 'checkup-group-card--male' : ''} ${
                g.groupTitle.toLowerCase().includes('жен') ? 'checkup-group-card--female' : ''
              } ${g.groupTitle.toLowerCase().includes('дет') ? 'checkup-group-card--kids' : ''} ${
                g.groupTitle.toLowerCase().includes('госпитал') ? 'checkup-group-card--hospital' : ''
              }`}
              onClick={() => onPickGroup(g.groupTitle)}
            >
              <div className="checkup-group-card-title">{g.groupTitle}</div>
              <div className="checkup-group-card-subtitle">{g.description || `${g.count} программ`}</div>
              <span className="checkup-group-card-more">Подробнее</span>
              {g.image && (
                <img
                  src={g.image}
                  alt={g.groupTitle}
                  className="checkup-group-card-image"
                  style={{
                    objectFit: g.image_fit === 'contain' ? 'contain' : 'cover',
                    transform: `translate(${g.image_x}px, ${g.image_y}px) scale(${Math.max(0.2, g.image_scale / 100)})`,
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="checkup-groups-row checkup-groups-row-bottom">
          {groups.slice(3, 5).map((g) => (
          <button
            key={g.groupTitle}
            type="button"
            className={`checkup-group-card checkup-group-card--bottom ${g.groupTitle.toLowerCase().includes('муж') ? 'checkup-group-card--male' : ''} ${
              g.groupTitle.toLowerCase().includes('жен') ? 'checkup-group-card--female' : ''
            } ${g.groupTitle.toLowerCase().includes('дет') ? 'checkup-group-card--kids' : ''} ${
              g.groupTitle.toLowerCase().includes('госпитал') ? 'checkup-group-card--hospital' : ''
            }`}
            onClick={() => onPickGroup(g.groupTitle)}
          >
            <div className="checkup-group-card-title">{g.groupTitle}</div>
            <div className="checkup-group-card-subtitle">{g.description || `${g.count} программ`}</div>
            <span className="checkup-group-card-more">Подробнее</span>
            {g.image && (
              <img
                src={g.image}
                alt={g.groupTitle}
                className="checkup-group-card-image"
                style={{
                  objectFit: g.image_fit === 'contain' ? 'contain' : 'cover',
                  transform: `translate(${g.image_x}px, ${g.image_y}px) scale(${Math.max(0.2, g.image_scale / 100)})`,
                }}
              />
            )}
          </button>
        ))}
        </div>
      </div>
    </>
  )
}

function CheckupGrid({
  title,
  items,
  onBack,
  onPick,
}: {
  title: string
  items: AdminCheckupItem[]
  onBack: () => void
  onPick: (item: AdminCheckupItem) => void
}) {
  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>{`Программы Check-up (${title})`}</h2>
      </div>
      <div className="checkup-grid-cards">
        {items.map((item) => (
          <button key={item.id} type="button" className="checkup-list-card" onClick={() => onPick(item)}>
            <div className="checkup-list-card-image-wrap">
              {item.list_image_url || item.image_url ? (
                <img src={item.list_image_url || item.image_url || ''} alt={item.title} className="checkup-list-card-image" loading="lazy" decoding="async" />
              ) : (
                <div className="checkup-list-card-empty">Изображение</div>
              )}
            </div>
            <div className="checkup-list-card-title">{item.title}</div>
          </button>
        ))}
      </div>
    </>
  )
}

function CheckupDetails({ item, onBack }: { item: AdminCheckupItem; onBack: () => void }) {
  const defaultLeftBullets = [
    'Общий анализ крови (ОАК) - помогает определить уровень гемоглобина, воспалительные показатели и общее состояние организма.',
    'Общий анализ мочи (ОАМ) - оценивает работу почек и водно-солевой баланс, что особенно важно при интенсивных тренировках.',
    'Глюкоза (венозная) - контроль уровня сахара в крови для оценки энергетического обмена и устойчивости к физическим нагрузкам.',
    'Мочевина и креатинин - показатели эффективности работы почек и белкового обмена.',
  ]
  const defaultRightBullets = [
    'Холестерин - оценка липидного обмена и состояния сосудов, особенно при активных нагрузках.',
    'Билирубин общий - помогает выявить нарушения функции печени, которая активно участвует в обмене веществ.',
    'Мочевая кислота - показывает состояние белкового обмена и риск воспалительных процессов в суставах.',
    'АСТ (аспартатаминотрансфераза) - отражает состояние печени и мышечной ткани.',
  ]
  const leftBullets = (item.included_left ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
  const rightBullets = (item.included_right ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
  const footerText = item.post_info_text?.trim() || 'По итогам обследования врач даст рекомендации по питанию, режиму тренировок и восстановлению, чтобы спорт приносил только пользу.'
  const ctaText = item.cta_text?.trim() || `Запишитесь на чекап «${item.title}» в клинике Евродон – контролируйте здоровье и тренируйтесь с уверенностью!`
  const registryNote = item.registry_note?.trim() || 'Записаться можно на регистратуре'
  const hasManualLegacyExtras =
    Boolean(item.included_left?.trim()) ||
    Boolean(item.included_right?.trim()) ||
    Boolean(item.post_info_text?.trim()) ||
    Boolean(item.cta_text?.trim()) ||
    Boolean(item.registry_note?.trim())
  const contentBlocks = useMemo(() => {
    const explicit = parseCheckupContentJson(item.content_json)
    if (explicit.length) return explicit
    return makeLegacyCheckupBlocks(item)
  }, [item])
  const useArticleContent = contentBlocks.length > 0

  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>{`Чекап "${item.title}"`}</h2>
      </div>
      <section className="checkup-details">
        <div className="checkup-details-top">
          <div className="checkup-details-texts">
            <h3>Описание услуги</h3>
            <div className="promo-details-text">{item.description?.trim() || 'Описание программы скоро появится.'}</div>
            {item.price_label && <div className="checkup-details-price">{item.price_label}</div>}
          </div>
          {item.image_url && (
            <div className="checkup-details-image-wrap">
              <img
                src={item.image_url}
                alt={item.title}
                className="checkup-details-image"
                style={{
                  objectFit: item.image_fit === 'contain' ? 'contain' : 'cover',
                  transform: `translate(${Number(item.image_x ?? 0)}px, ${Number(item.image_y ?? 0)}px) scale(${Math.max(0.2, Number(item.image_scale ?? 100) / 100)})`,
                }}
              />
            </div>
          )}
        </div>
        {useArticleContent && (
          <div className="checkup-article-view">
            {contentBlocks.map((block) => {
              const style = {
                fontSize: `${block.font_size}px`,
                fontWeight: block.is_bold ? 600 : 400,
              }
              if (block.type === 'heading') {
                return (
                  <h3 key={block.id} className="checkup-article-heading" style={style}>
                    {block.text}
                  </h3>
                )
              }
              if (block.type === 'subheading') {
                return (
                  <h4 key={block.id} className="checkup-article-subheading" style={style}>
                    {block.text}
                  </h4>
                )
              }
              if (block.type === 'list') {
                const rows = block.text.split('\n').map((x) => x.trim()).filter(Boolean)
                return (
                  <ul key={block.id} className="checkup-article-list" style={style}>
                    {rows.map((row, idx) => <li key={`${block.id}-${idx}`}>{row}</li>)}
                  </ul>
                )
              }
              return (
                <p key={block.id} className="checkup-article-paragraph" style={style}>
                  {block.text}
                </p>
              )
            })}
          </div>
        )}
        {useArticleContent && hasManualLegacyExtras && (
          <div className="checkup-details-extra">
            <div className="checkup-details-bullets-box">
              <div className="checkup-details-extra-title">В чекап входят:</div>
              <div className="checkup-details-bullets">
                <ul className="checkup-bullet-list">
                  {leftBullets.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <ul className="checkup-bullet-list">
                  {rightBullets.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            </div>
            {!!item.post_info_text?.trim() && <div className="checkup-details-footer-text">{footerText}</div>}
            {(Boolean(item.cta_text?.trim()) || Boolean(item.registry_note?.trim())) && (
              <div className="checkup-details-bottom-row">
                {!!item.cta_text?.trim() && <div className="checkup-details-note-strong">{ctaText}</div>}
                {!!item.registry_note?.trim() && <div className="checkup-details-note-info">{registryNote}</div>}
              </div>
            )}
          </div>
        )}
        {!useArticleContent && (
          <>
            <div className="checkup-details-extra">
              <div className="checkup-details-bullets-box">
                <div className="checkup-details-extra-title">В чекап входят:</div>
                <div className="checkup-details-bullets">
                  <ul className="checkup-bullet-list">
                    {(leftBullets.length ? leftBullets : defaultLeftBullets).map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                  <ul className="checkup-bullet-list">
                    {(rightBullets.length ? rightBullets : defaultRightBullets).map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="checkup-details-footer-text">{footerText}</div>
              <div className="checkup-details-bottom-row">
                <div className="checkup-details-note-strong">{ctaText}</div>
                <div className="checkup-details-note-info">{registryNote}</div>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}

function DoctorGrid({
  doctors,
  doctorMedia,
  onBack,
  onPick,
}: {
  doctors: Employee[]
  doctorMedia: Record<string, AdminDoctorMedia>
  onBack: () => void
  onPick: (d: Employee) => void
}) {
  const [query, setQuery] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')

  if (!doctors.length) {
    return (
      <div className="empty-hint">
        Список врачей пуст. Проверьте подключение к МИС и выполните синхронизацию на сервере.
      </div>
    )
  }
  const specialties = Array.from(
    new Set(
      doctors
        .map((d) => (d.specialty ?? '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ru'))

  const filteredDoctors = doctors.filter((d) => {
    const fullName = (d.full_name ?? '').toLowerCase()
    const spec = (d.specialty ?? '').trim()
    const matchName = !query.trim() || fullName.includes(query.trim().toLowerCase())
    const matchSpec = !specialtyFilter || spec === specialtyFilter
    return matchName && matchSpec
  })

  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Записаться на прием</h2>
      </div>
      <div className="doctor-filters">
        <div className="doctor-filter-field">
          <div className="doctor-search-wrap">
            <span className="doctor-search-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18.3 18.3L25.5 25.5M20.7 11.1C20.7 16.4019 16.4019 20.7 11.1 20.7C5.79807 20.7 1.5 16.4019 1.5 11.1C1.5 5.79807 5.79807 1.5 11.1 1.5C16.4019 1.5 20.7 5.79807 20.7 11.1Z" stroke="#9AA2B3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти врача"
            />
          </div>
        </div>
        <div className="doctor-filter-field">
          <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
            <option value="">Все направления</option>
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {filteredDoctors.length === 0 && (
        <div className="empty-hint" style={{ marginBottom: '1rem' }}>
          По заданным параметрам врачи не найдены.
        </div>
      )}
      <div className="grid-doctors">
        {filteredDoctors.map((d) => (
          <article key={d.mis_id} className="doctor-card">
            <div className="doctor-card-info">
              <div
                className="doctor-card-photo"
                style={doctorMedia[d.mis_id]?.photo_url ? { backgroundImage: `url(${doctorMedia[d.mis_id].photo_url})` } : undefined}
              />
              <div className="doctor-card-text">
                {d.specialty && <div className="doctor-card-specialty">{d.specialty}</div>}
                <h2 className="doctor-card-name">{d.full_name}</h2>
                {doctorMedia[d.mis_id]?.experience_label && (
                  <div className="doctor-card-experience">{doctorMedia[d.mis_id].experience_label}</div>
                )}
                {(doctorMedia[d.mis_id]?.badge1_label || doctorMedia[d.mis_id]?.badge2_label || doctorMedia[d.mis_id]?.badge3_label) && (
                  <div className="doctor-card-badges">
                    {doctorMedia[d.mis_id]?.badge1_label && (
                      <span className="doctor-card-badge doctor-card-badge--1">{doctorMedia[d.mis_id].badge1_label}</span>
                    )}
                    {doctorMedia[d.mis_id]?.badge2_label && (
                      <span className="doctor-card-badge doctor-card-badge--2">{doctorMedia[d.mis_id].badge2_label}</span>
                    )}
                    {doctorMedia[d.mis_id]?.badge3_label && (
                      <span className="doctor-card-badge doctor-card-badge--3">{doctorMedia[d.mis_id].badge3_label}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button type="button" className="doctor-card-btn" onClick={() => onPick(d)}>
              Расписание онлайн
            </button>
          </article>
        ))}
      </div>
    </>
  )
}

function ConsumerDocPreviewModal({ docUrl, onClose }: { docUrl: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-consumer">
        <div className="consumer-preview-head">
          <button type="button" className="back-chip-btn" onClick={onClose}>
            <span aria-hidden>←</span> Закрыть
          </button>
        </div>
        <div className="consumer-doc-preview">
          <iframe title="Просмотр документа" src={docUrl} className="consumer-doc-frame" loading="lazy" />
        </div>
      </div>
    </div>
  )
}

function ConsumerCornerScreen({ documents, onBack }: { documents: AdminDocument[]; onBack: () => void }) {
  const [selectedDocUrl, setSelectedDocUrl] = useState<string>('')

  return (
    <>
      <div className="doctors-page-head consumer-screen-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Уголок потребителя</h2>
      </div>
      {documents.length === 0 ? (
        <div className="empty-hint">Документы не загружены</div>
      ) : (
        <div className="consumer-screen-grid">
          {documents.map((d) => (
            <button key={d.id} type="button" className="consumer-doc-card" onClick={() => setSelectedDocUrl(d.file_url)}>
              <span className="consumer-doc-icon" aria-hidden>
                <svg width="21" height="26" viewBox="0 0 21 26" fill="none">
                  <g clipPath="url(#clip0_consumer_doc)">
                    <path
                      d="M6.29977 7.92353H12.5998M6.29977 12.9635H11.3398M6.29977 18.0035H7.55976M3.77977 1.62354H16.3798C17.7716 1.62354 18.8998 2.75178 18.8998 4.14353V16.7435C18.8998 20.9188 15.515 24.3035 11.3398 24.3035H3.77977C2.38801 24.3035 1.25977 23.1753 1.25977 21.7835V4.14353C1.25977 2.75178 2.38801 1.62354 3.77977 1.62354Z"
                      stroke="#0094F5"
                      strokeWidth="1.89"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_consumer_doc">
                      <rect width="20.16" height="25.92" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </span>
              <span className="consumer-doc-title">{d.title}</span>
            </button>
          ))}
        </div>
      )}
      {selectedDocUrl && <ConsumerDocPreviewModal docUrl={selectedDocUrl} onClose={() => setSelectedDocUrl('')} />}
    </>
  )
}

function DoctorSchedule({
  doctor,
  doctorPhoto,
  doctorMeta,
  onBack,
  onBooked,
}: {
  doctor: Employee
  doctorPhoto?: string
  doctorMeta?: AdminDoctorMedia
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
  const [selectedSlot, setSelectedSlot] = useState<DaySlot | null>(null)
  const [picked, setPicked] = useState<DaySlot | null>(null)
  const [pickedServiceId, setPickedServiceId] = useState('')
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [monthOpen, setMonthOpen] = useState(false)
  const [monthCursor, setMonthCursor] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1))
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthAvailability, setMonthAvailability] = useState<Record<string, boolean>>({})
  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const todayKeyMoscow = useMemo(() => dateKeyMoscow(new Date()), [])

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
      if (dateKeyMoscow(n) < todayKeyMoscow) return new Date(todayStart)
      return n
    })
  }

  const weekDays = useMemo(() => {
    const base = new Date(day)
    const dow = (base.getDay() + 6) % 7
    base.setDate(base.getDate() - dow)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return d
    })
  }, [day])

  const calendarCells = useMemo(() => {
    const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
    const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0)
    const startOffset = (monthStart.getDay() + 6) % 7
    const totalDays = monthEnd.getDate()
    const out: Array<{ date: Date; inMonth: boolean }> = []
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(monthStart)
      d.setDate(monthStart.getDate() - (startOffset - i))
      out.push({ date: d, inMonth: false })
    }
    for (let i = 1; i <= totalDays; i++) {
      out.push({ date: new Date(monthCursor.getFullYear(), monthCursor.getMonth(), i), inMonth: true })
    }
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1].date
      const d = new Date(last)
      d.setDate(last.getDate() + 1)
      out.push({ date: d, inMonth: false })
    }
    return out
  }, [monthCursor])

  useEffect(() => {
    if (period !== 'month' || !monthOpen) return
    let cancelled = false
    setMonthLoading(true)
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(monthCursor.getFullYear(), monthCursor.getMonth(), i + 1, 12, 0, 0))
    Promise.all(
      days.map(async (d) => {
        try {
          const rows = await fetchFreeSlots(doctor.mis_id, d)
          const hasFree = dateKeyMoscow(d) >= todayKeyMoscow && rows.length > 0
          return [dateKeyMoscow(d), hasFree] as const
        } catch {
          return [dateKeyMoscow(d), false] as const
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return
        const map: Record<string, boolean> = {}
        for (const [k, v] of entries) map[k] = v
        setMonthAvailability(map)
      })
      .finally(() => {
        if (!cancelled) setMonthLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doctor.mis_id, monthCursor, monthOpen, period, todayKeyMoscow])

  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Записаться на прием</h2>
      </div>

      <section className="doctor-booking-card">
        <div className="doctor-booking-photo-wrap">
          {doctorPhoto ? (
            <img src={doctorPhoto} alt={doctor.full_name} className="doctor-booking-photo" loading="lazy" decoding="async" />
          ) : (
            <div className="doctor-booking-photo-fallback" />
          )}
        </div>

        <div className="doctor-booking-content">
          {doctor.specialty && <div className="doctor-booking-specialty">{doctor.specialty}</div>}
          <h2 className="doctor-booking-name">{doctor.full_name}</h2>
          {doctorMeta?.experience_label && <div className="doctor-booking-exp">{doctorMeta.experience_label}</div>}
          {(doctorMeta?.badge1_label || doctorMeta?.badge2_label || doctorMeta?.badge3_label) && (
            <div className="doctor-booking-badges">
              {doctorMeta?.badge1_label && (
                <span className="doctor-card-badge doctor-card-badge--1">{doctorMeta.badge1_label}</span>
              )}
              {doctorMeta?.badge2_label && (
                <span className="doctor-card-badge doctor-card-badge--2">{doctorMeta.badge2_label}</span>
              )}
              {doctorMeta?.badge3_label && (
                <span className="doctor-card-badge doctor-card-badge--3">{doctorMeta.badge3_label}</span>
              )}
            </div>
          )}

          {services.length > 0 && (
            <label className="doctor-service-label">
              Записаться на приём
              <select className="doctor-service-select" value={pickedServiceId} onChange={(e) => setPickedServiceId(e.target.value)}>
                <option value="">Выбрать услугу</option>
                {services.map((s) => (
                  <option key={s.mis_id} value={s.mis_id}>
                    {s.name ?? s.mis_id}
                    {s.price != null ? ` · ${s.price} ₽` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="doctor-schedule-header">
            <span>Расписание на</span>
            <div className="doctor-period-tabs">
              <button
                type="button"
                className={`doctor-period-tab ${period === 'week' ? 'active' : ''}`}
                onClick={() => {
                  setPeriod('week')
                  setMonthOpen(false)
                }}
              >
                Неделю
              </button>
              <button
                type="button"
                className={`doctor-period-tab ${period === 'month' ? 'active' : ''}`}
                onClick={() => {
                  setPeriod('month')
                  setMonthOpen((x) => !x)
                  setMonthCursor(new Date(day.getFullYear(), day.getMonth(), 1))
                }}
              >
                Месяц
              </button>
            </div>
          </div>

          {period === 'week' && (
            <>
              <div className="doctor-week-days">
                {weekDays.map((d) => (
                  (() => {
                    const isPastDay = dateKeyMoscow(d) < todayKeyMoscow
                    return (
                  <button
                    key={dateKeyMoscow(d)}
                    type="button"
                    className={`doctor-week-day ${dateKeyMoscow(d) === dateKeyMoscow(day) ? 'active' : ''}`}
                    disabled={isPastDay}
                    onClick={() => setDay(new Date(d))}
                  >
                    <span>{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                    <strong>{d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</strong>
                  </button>
                    )
                  })()
                ))}
              </div>
              <div className="doctor-slots-strip">
                <button type="button" className="doctor-strip-arrow" onClick={() => shiftDay(-1)}>
                  ‹
                </button>
                <div className="doctor-slots-inline">
                  {slots.map((s) => (
                    (() => {
                      const isPastSlot = new Date(s.start).getTime() < Date.now()
                      const disabled = s.status === 'busy' || isPastSlot
                      return (
                    <button
                      key={`${s.start}-${s.status}`}
                      type="button"
                      className={`doctor-slot-pill ${selectedSlot?.start === s.start ? 'selected' : ''}`}
                      disabled={disabled}
                      onClick={() => !disabled && setSelectedSlot(s)}
                      title={s.status === 'busy' ? s.service_name ?? 'Занято' : 'Свободно'}
                    >
                      {formatTimeMoscow(s.start)}
                    </button>
                      )
                    })()
                  ))}
                </div>
                <button type="button" className="doctor-strip-arrow" onClick={() => shiftDay(1)}>
                  ›
                </button>
              </div>
            </>
          )}

          {period === 'month' && monthOpen && (
            <div className="doctor-calendar-popup">
              <div className="doctor-calendar-head">
                <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>
                  ‹
                </button>
                <strong>{monthCursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</strong>
                <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>
                  ›
                </button>
              </div>
              <div className="doctor-calendar-weekdays">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              <div className="doctor-calendar-grid">
                {calendarCells.map((cell) => {
                  const key = dateKeyMoscow(cell.date)
                  const isPastDay = dateKeyMoscow(cell.date) < todayKeyMoscow
                  const available = !isPastDay && !!monthAvailability[key]
                  const selected = dateKeyMoscow(cell.date) === dateKeyMoscow(day)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`doctor-calendar-day ${cell.inMonth ? '' : 'muted'} ${available ? 'has-slots' : ''} ${selected ? 'selected' : ''}`}
                      disabled={isPastDay}
                      onClick={() => {
                        if (isPastDay) return
                        setDay(new Date(cell.date))
                        setPeriod('week')
                        setMonthOpen(false)
                      }}
                    >
                      {cell.date.getDate()}
                    </button>
                  )
                })}
              </div>
              {monthLoading && <div className="meta">Загрузка доступности...</div>}
            </div>
          )}

          {period === 'month' && !monthOpen && (
            <div className="doctor-date-nav-date">{formatDayRu(day)}</div>
          )}

          <div className="doctor-booking-actions">
            <button
              type="button"
              className="doctor-book-btn"
              disabled={!selectedSlot || selectedSlot.status === 'busy'}
              onClick={() => setPicked(selectedSlot)}
            >
              Записаться на прием
            </button>
          </div>
        </div>
      </section>
      {slotsLoading && <div className="empty-hint">Загрузка слотов…</div>}
      {slotsError && <div className="empty-hint">{slotsError}</div>}
      {!slotsLoading && !slotsError && slots.length === 0 && (
        <div className="empty-hint">На выбранный день нет свободных окон по данным терминала.</div>
      )}
      {picked && (
        <BookingModal
          doctor={doctor}
          doctorPhoto={doctorPhoto}
          slot={picked}
          services={services}
          initialServiceId={pickedServiceId}
          onClose={() => setPicked(null)}
          onBooked={onBooked}
        />
      )}
    </>
  )
}

function BookingModal({
  doctor,
  doctorPhoto,
  slot,
  services,
  initialServiceId,
  onClose,
  onBooked,
}: {
  doctor: Employee
  doctorPhoto?: string
  slot: DaySlot
  services: Service[]
  initialServiceId?: string
  onClose: () => void
  onBooked: () => void
}) {
  const [surname, setSurname] = useState('')
  const [name, setName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [birthday, setBirthday] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceId] = useState(initialServiceId ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const selectedService = services.find((s) => s.mis_id === serviceId)
  const clinicLabel = slot.clinic_mis_id ? 'Евродон Социалистическая' : 'Евродон'

  const formatBirthdayInput = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
  }

  const parseBirthday = (value: string): string | null => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
    if (!m) return null
    const dd = Number(m[1])
    const mm = Number(m[2])
    const yyyy = Number(m[3])
    const d = new Date(yyyy, mm - 1, dd)
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
    if (startOfDay(d) > startOfDay(new Date())) return null
    return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  useEffect(() => {
    if (!ok) return
    const timer = window.setTimeout(() => {
      onBooked()
      onClose()
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [ok, onBooked, onClose])

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    setOk(false)
    const normalizedBirthday = parseBirthday(birthday)
    if (!normalizedBirthday) {
      setBusy(false)
      setMsg('Введите дату рождения в формате ДД.ММ.ГГГГ')
      return
    }
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
        birthday: normalizedBirthday,
        phone: phone.replace(/\D/g, ''),
      })
      let current = appt
      for (let i = 0; i < 20 && current.status === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        current = await getAppointment(appt.id)
      }
      if (current.status === 'success') {
        setOk(true)
        setMsg('Вы записаны на прием')
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
    <div className="booking-screen-backdrop" role="dialog" aria-modal>
      <div className="booking-screen-shell">
        <div className="doctors-page-head booking-screen-head">
          <button type="button" className="back-chip-btn" onClick={onClose} disabled={busy}>
            <span aria-hidden>←</span> Назад
          </button>
          <h2>Введите ваши данные</h2>
        </div>

        <div className="booking-screen-grid">
          <section className="booking-side-card">
            <div className="booking-side-label">Дата и время</div>
            <div className="booking-side-value">{formatDayMoscow(slot.start)}, {formatTimeMoscow(slot.start)}</div>

            <div className="booking-doctor-row">
              <div className="booking-doctor-avatar">
                {doctorPhoto ? (
                  <img src={doctorPhoto} alt={doctor.full_name} className="booking-doctor-avatar-img" loading="lazy" decoding="async" />
                ) : (
                  <div className="booking-doctor-avatar-fallback" />
                )}
              </div>
              <div>
                <div>{doctor.surname}</div>
                <div>{doctor.name} {doctor.patronymic}</div>
                <div className="booking-doctor-spec">{doctor.specialty}</div>
              </div>
            </div>

            <div className="booking-side-label">Услуга</div>
            <div className="booking-side-value">
              {selectedService ? `${selectedService.name ?? selectedService.mis_id}${selectedService.price != null ? `, ${selectedService.price} ₽` : ''}` : 'Не выбрана'}
            </div>

            <div className="booking-side-label">Филиал</div>
            <div className="booking-side-value">{clinicLabel}</div>
          </section>

          <section className="booking-form-card">
            <div className="booking-inputs">
              <input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" placeholder="Фамилия" />
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Имя" />
              <input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} placeholder="Отчество" />
              <input
                inputMode="numeric"
                placeholder="Дата рождения (ДД.ММ.ГГГГ)"
                value={birthday}
                onChange={(e) => setBirthday(formatBirthdayInput(e.target.value))}
              />
              <input
                inputMode="tel"
                placeholder="Телефон"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="booking-note-box">
              <strong>Для записи необходимо иметь</strong>
              <ul>
                <li>Паспорт</li>
                <li>СНИЛС</li>
                <li>Результаты анализов при наличии</li>
              </ul>
            </div>

            {msg && <div className={`status-msg ${ok ? 'ok' : 'err'}`}>{msg}</div>}

            <div className="booking-submit-row">
              <button
                type="button"
                className="doctor-book-btn"
                disabled={busy || !surname.trim() || !name.trim() || !parseBirthday(birthday) || phone.replace(/\D/g, '').length < 10}
                onClick={() => void submit()}
              >
                {busy ? 'Отправка…' : 'Записаться на прием'}
              </button>
            </div>
          </section>
        </div>
        {ok && (
          <div className="booking-success-overlay">
            <div className="booking-success-check" aria-hidden>
              ✓
            </div>
            <div className="booking-success-text">Вы записаны на прием</div>
          </div>
        )}
      </div>
    </div>
  )
}

function AdminPanel({ doctors, syncLabel }: { doctors: Employee[]; syncLabel: string }) {
  const [adminTab, setAdminTab] = useState<'tiles' | 'documents' | 'banners' | 'checkups' | 'doctors'>('tiles')
  const [tiles, setTiles] = useState<AdminTile[]>([])
  const [documents, setDocuments] = useState<AdminDocument[]>([])
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [checkups, setCheckups] = useState<AdminCheckupItem[]>([])
  const [checkupGroupTiles, setCheckupGroupTiles] = useState<AdminCheckupGroupTile[]>([])
  const [checkupsFeatureEnabled, setCheckupsFeatureEnabled] = useState(true)
  const [media, setMedia] = useState<AdminDoctorMedia[]>([])
  const [status, setStatus] = useState<string>('')

  const [tilePresetKey, setTilePresetKey] = useState(FIXED_TILE_PRESETS[0].key)
  const [tileImage, setTileImage] = useState('')
  const [tileFit, setTileFit] = useState<'cover' | 'contain'>('cover')
  const [tileX, setTileX] = useState(0)
  const [tileY, setTileY] = useState(0)
  const [tileScale, setTileScale] = useState(100)
  const [draggingPreview, setDraggingPreview] = useState(false)

  const [docTitle, setDocTitle] = useState('')
  const [docUrl, setDocUrl] = useState('')

  const [bannerTitle, setBannerTitle] = useState('')
  const [bannerImage, setBannerImage] = useState('')
  const [bannerDescription, setBannerDescription] = useState('')
  const [bannerPresetId, setBannerPresetId] = useState('')
  const [bannerCardImage, setBannerCardImage] = useState('')
  const [bannerCardFit, setBannerCardFit] = useState<'cover' | 'contain'>('cover')
  const [bannerCardX, setBannerCardX] = useState(0)
  const [bannerCardY, setBannerCardY] = useState(0)
  const [bannerCardScale, setBannerCardScale] = useState(100)
  const [bannerListImage, setBannerListImage] = useState('')
  const [bannerListFit, setBannerListFit] = useState<'cover' | 'contain'>('cover')
  const [bannerListX, setBannerListX] = useState(0)
  const [bannerListY, setBannerListY] = useState(0)
  const [bannerListScale, setBannerListScale] = useState(100)

  const [checkupTitle, setCheckupTitle] = useState('')
  const [checkupSubtitle, setCheckupSubtitle] = useState('')
  const [checkupGroupTitle, setCheckupGroupTitle] = useState('Общий')
  const [checkupPrice, setCheckupPrice] = useState('')
  const [checkupListImage, setCheckupListImage] = useState('')
  const [checkupImage, setCheckupImage] = useState('')
  const [checkupImageFit, setCheckupImageFit] = useState<'cover' | 'contain'>('cover')
  const [checkupImageX, setCheckupImageX] = useState(0)
  const [checkupImageY, setCheckupImageY] = useState(0)
  const [checkupImageScale, setCheckupImageScale] = useState(100)
  const [checkupDescription, setCheckupDescription] = useState('')
  const [checkupIncludedLeft, setCheckupIncludedLeft] = useState('')
  const [checkupIncludedRight, setCheckupIncludedRight] = useState('')
  const [checkupPostInfoText, setCheckupPostInfoText] = useState('')
  const [checkupCtaText, setCheckupCtaText] = useState('')
  const [checkupRegistryNote, setCheckupRegistryNote] = useState('')
  const [checkupContentBlocks, setCheckupContentBlocks] = useState<CheckupContentBlock[]>([])
  const [checkupSort, setCheckupSort] = useState(0)
  const [checkupEditId, setCheckupEditId] = useState('')
  const [checkupGroupEditId, setCheckupGroupEditId] = useState('')
  const [checkupGroupTileTitle, setCheckupGroupTileTitle] = useState('Общий')
  const [checkupGroupTileDescription, setCheckupGroupTileDescription] = useState('')
  const [checkupGroupTileImage, setCheckupGroupTileImage] = useState('')
  const [checkupGroupTileFit, setCheckupGroupTileFit] = useState<'cover' | 'contain'>('cover')
  const [checkupGroupTileX, setCheckupGroupTileX] = useState(0)
  const [checkupGroupTileY, setCheckupGroupTileY] = useState(0)
  const [checkupGroupTileScale, setCheckupGroupTileScale] = useState(100)
  const [checkupGroupTileSort, setCheckupGroupTileSort] = useState(0)

  const [doctorId, setDoctorId] = useState('')
  const [doctorPhoto, setDoctorPhoto] = useState('')
  const [doctorExperience, setDoctorExperience] = useState('')
  const [doctorBadge1, setDoctorBadge1] = useState('')
  const [doctorBadge2, setDoctorBadge2] = useState('')
  const [doctorBadge3, setDoctorBadge3] = useState('')
  const [doctorShowInSections, setDoctorShowInSections] = useState(true)
  const [doctorSurname, setDoctorSurname] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorPatronymic, setDoctorPatronymic] = useState('')

  const reload = useCallback(async () => {
    const [t, d, b, c, cg, m, feature] = await Promise.all([
      listAdminTiles(),
      listAdminDocuments(),
      listAdminBanners(),
      listAdminCheckups(),
      listAdminCheckupGroups(),
      listAdminDoctorMedia(),
      getCheckupsFeatureFlag(),
    ])
    setTiles(t)
    setDocuments(d)
    setBanners(b)
    setCheckups(c)
    setCheckupGroupTiles(cg)
    setMedia(m)
    setCheckupsFeatureEnabled(feature.enabled)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!banners.length) {
      setBannerPresetId('')
      return
    }
    setBannerPresetId((prev) => (prev && banners.some((b) => b.id === prev) ? prev : banners[0].id))
  }, [banners])

  const selectedBanner = useMemo(
    () => banners.find((b) => b.id === bannerPresetId) ?? null,
    [banners, bannerPresetId],
  )

  useEffect(() => {
    if (!selectedBanner) return
    setBannerCardImage(selectedBanner.card_image_url ?? '')
    setBannerCardFit(selectedBanner.card_image_fit === 'contain' ? 'contain' : 'cover')
    setBannerCardX(Number(selectedBanner.card_image_x ?? 0))
    setBannerCardY(Number(selectedBanner.card_image_y ?? 0))
    setBannerCardScale(Number(selectedBanner.card_image_scale ?? 100))
    setBannerListImage(selectedBanner.list_image_url ?? '')
    setBannerListFit(selectedBanner.list_image_fit === 'contain' ? 'contain' : 'cover')
    setBannerListX(Number(selectedBanner.list_image_x ?? 0))
    setBannerListY(Number(selectedBanner.list_image_y ?? 0))
    setBannerListScale(Number(selectedBanner.list_image_scale ?? 100))
  }, [selectedBanner?.id])

  const selectedCheckup = useMemo(
    () => checkups.find((x) => x.id === checkupEditId) ?? null,
    [checkups, checkupEditId],
  )
  const selectedCheckupGroupTile = useMemo(
    () => checkupGroupTiles.find((x) => x.id === checkupGroupEditId) ?? null,
    [checkupGroupTiles, checkupGroupEditId],
  )
  const checkupCategoryOptions = useMemo(() => {
    const options: string[] = []
    const seen = new Set<string>()
    const pushUnique = (value: string | null | undefined) => {
      const label = displayCheckupCategory(value)
      const key = normalizeCheckupCategory(label)
      if (seen.has(key)) return
      seen.add(key)
      options.push(label)
    }
    for (const g of checkupGroupTiles) pushUnique(g.title)
    for (const c of checkups) pushUnique(c.group_title)
    if (!options.length) pushUnique('Общий')
    return options
  }, [checkupGroupTiles, checkups])

  useEffect(() => {
    if (!selectedCheckup) return
    setCheckupTitle(selectedCheckup.title)
    setCheckupSubtitle(selectedCheckup.subtitle ?? '')
    setCheckupGroupTitle(selectedCheckup.group_title || 'Общий')
    setCheckupPrice(selectedCheckup.price_label ?? '')
    setCheckupListImage(selectedCheckup.list_image_url ?? '')
    setCheckupImage(selectedCheckup.image_url ?? '')
    setCheckupImageFit(selectedCheckup.image_fit === 'contain' ? 'contain' : 'cover')
    setCheckupImageX(Number(selectedCheckup.image_x ?? 0))
    setCheckupImageY(Number(selectedCheckup.image_y ?? 0))
    setCheckupImageScale(Number(selectedCheckup.image_scale ?? 100))
    setCheckupDescription(selectedCheckup.description ?? '')
    setCheckupIncludedLeft(selectedCheckup.included_left ?? '')
    setCheckupIncludedRight(selectedCheckup.included_right ?? '')
    setCheckupPostInfoText(selectedCheckup.post_info_text ?? '')
    setCheckupCtaText(selectedCheckup.cta_text ?? '')
    setCheckupRegistryNote(selectedCheckup.registry_note ?? '')
    {
      const explicit = parseCheckupContentJson(selectedCheckup.content_json)
      setCheckupContentBlocks(explicit.length ? explicit : makeLegacyCheckupBlocks(selectedCheckup))
    }
    setCheckupSort(Number(selectedCheckup.sort_order ?? 0))
  }, [selectedCheckup?.id])
  useEffect(() => {
    if (!selectedCheckupGroupTile) return
    setCheckupGroupTileTitle(selectedCheckupGroupTile.title)
    setCheckupGroupTileDescription(selectedCheckupGroupTile.description ?? '')
    setCheckupGroupTileImage(selectedCheckupGroupTile.image_url ?? '')
    setCheckupGroupTileFit(selectedCheckupGroupTile.image_fit === 'contain' ? 'contain' : 'cover')
    setCheckupGroupTileX(Number(selectedCheckupGroupTile.image_x ?? 0))
    setCheckupGroupTileY(Number(selectedCheckupGroupTile.image_y ?? 0))
    setCheckupGroupTileScale(Number(selectedCheckupGroupTile.image_scale ?? 100))
    setCheckupGroupTileSort(Number(selectedCheckupGroupTile.sort_order ?? 0))
  }, [selectedCheckupGroupTile?.id])

  const tilePreset = useMemo(
    () => FIXED_TILE_PRESETS.find((x) => x.key === tilePresetKey) ?? FIXED_TILE_PRESETS[0],
    [tilePresetKey],
  )
  const existingTileImage = useMemo(
    () => tiles.find((x) => x.title.trim().toLowerCase() === tilePreset.title.trim().toLowerCase()),
    [tilePreset, tiles],
  )
  const previewTileImage = tileImage || existingTileImage?.image_url || ''
  const previewPlace: 'main' | 'side' | 'small' =
    tilePreset.tile_type === 'main' ? 'main' : tilePreset.tile_type === 'side' ? 'side' : 'small'
  const previewTileClassName = (() => {
    const title = tilePreset.title.toLowerCase()
    if (previewPlace === 'main') {
      if (title.includes('услуги')) return 'tile-specialists'
      return 'tile-instrumental'
    }
    if (previewPlace === 'side') {
      if (title.includes('акци')) return 'tile-actions'
      if (title.includes('космет')) return 'tile-cosmo'
      return 'tile-checkup'
    }
    return 'tile-small-specialty'
  })()

  useEffect(() => {
    setTileFit(existingTileImage?.image_fit === 'contain' ? 'contain' : 'cover')
    setTileX(existingTileImage?.image_x ?? 0)
    setTileY(existingTileImage?.image_y ?? 0)
    setTileScale(existingTileImage?.image_scale ?? 100)
    setTileImage('')
  }, [tilePresetKey, existingTileImage?.id])

  useEffect(() => {
    if (!doctorId) {
      setDoctorPhoto('')
      setDoctorExperience('')
      setDoctorBadge1('')
      setDoctorBadge2('')
      setDoctorBadge3('')
      setDoctorShowInSections(true)
      setDoctorSurname('')
      setDoctorName('')
      setDoctorPatronymic('')
      return
    }
    const selected = media.find((m) => m.employee_mis_id === doctorId)
    const doc = doctors.find((d) => d.mis_id === doctorId)
    setDoctorPhoto(selected?.photo_url ?? '')
    setDoctorExperience(selected?.experience_label ?? '')
    setDoctorBadge1(selected?.badge1_label ?? '')
    setDoctorBadge2(selected?.badge2_label ?? '')
    setDoctorBadge3(selected?.badge3_label ?? '')
    setDoctorShowInSections(selected?.show_in_sections !== false)
    setDoctorSurname(doc?.surname ?? '')
    setDoctorName(doc?.name ?? '')
    setDoctorPatronymic(doc?.patronymic ?? '')
  }, [doctorId, media, doctors])

  return (
    <main className="admin-shell">
      <h1>Админ модуль</h1>
      <p className="meta">Настройка контента главной страницы и медиа</p>
      <div className="card admin-card" style={{ marginBottom: '1rem' }}>
        <strong>Статус синхронизации</strong>
        <div className="meta">{syncLabel}</div>
      </div>

      <div className="admin-tabs">
        <button type="button" className={`admin-tab ${adminTab === 'tiles' ? 'active' : ''}`} onClick={() => setAdminTab('tiles')}>Плитки</button>
        <button type="button" className={`admin-tab ${adminTab === 'documents' ? 'active' : ''}`} onClick={() => setAdminTab('documents')}>Документы</button>
        <button type="button" className={`admin-tab ${adminTab === 'banners' ? 'active' : ''}`} onClick={() => setAdminTab('banners')}>Акции</button>
        <button type="button" className={`admin-tab ${adminTab === 'checkups' ? 'active' : ''}`} onClick={() => setAdminTab('checkups')}>Check-up</button>
        <button type="button" className={`admin-tab ${adminTab === 'doctors' ? 'active' : ''}`} onClick={() => setAdminTab('doctors')}>Врачи</button>
      </div>

      {adminTab === 'tiles' && (
      <div className="card admin-card" style={{ marginBottom: '1rem' }}>
        <h2>Картинки фиксированных плиток</h2>
        <p className="meta">
          Состав плиток фиксированный. Здесь можно только заменить изображение для нужной плитки.
        </p>
        <div className="form-grid">
          <label>
            Плитка
            <select value={tilePresetKey} onChange={(e) => setTilePresetKey(e.target.value)}>
              {FIXED_TILE_PRESETS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Подгонка
            <select value={tileFit} onChange={(e) => setTileFit(e.target.value as 'cover' | 'contain')}>
              <option value="cover">Заполнить (cover)</option>
              <option value="contain">Вписать (contain)</option>
            </select>
          </label>
          <input placeholder="URL картинки" value={tileImage} onChange={(e) => setTileImage(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'tiles')
              setTileImage(url)
            }}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              if (!previewTileImage.trim()) return
              await createAdminTile({
                title: tilePreset.title,
                tile_type: tilePreset.tile_type,
                size: tilePreset.size,
                sort_order: tilePreset.sort_order,
                specialty_filters: tilePreset.specialty_filters,
                image_url: previewTileImage,
                image_fit: tileFit,
                image_x: tileX,
                image_y: tileY,
                image_scale: tileScale,
                is_active: true,
              })
              setStatus(`Изображение обновлено: ${tilePreset.title}`)
              setTileImage('')
              await reload()
            }}
          >
            Сохранить изображение
          </button>
        </div>
        <div className="form-grid" style={{ marginTop: '0.5rem' }}>
          <label>
            Смещение X: {tileX}px
            <input type="range" min={-300} max={300} value={tileX} onChange={(e) => setTileX(Number(e.target.value))} />
          </label>
          <label>
            Смещение Y: {tileY}px
            <input type="range" min={-300} max={300} value={tileY} onChange={(e) => setTileY(Number(e.target.value))} />
          </label>
          <label>
            Масштаб: {tileScale}%
            <input type="range" min={40} max={220} value={tileScale} onChange={(e) => setTileScale(Number(e.target.value))} />
          </label>
        </div>
        <div className="tile-preview-wrap">
          <div className="meta">Демо просмотр</div>
          <div
            className={`tile-preview home-tile tile-preview-${tilePreset.size} ${previewTileClassName} ${draggingPreview ? 'dragging' : ''}`}
            onPointerDown={(e) => {
              if (!previewTileImage) return
              const startX = e.clientX
              const startY = e.clientY
              const baseX = tileX
              const baseY = tileY
              setDraggingPreview(true)
              const move = (ev: PointerEvent) => {
                setTileX(baseX + Math.round(ev.clientX - startX))
                setTileY(baseY + Math.round(ev.clientY - startY))
              }
              const up = () => {
                setDraggingPreview(false)
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
          >
            {previewTileImage ? (
              <img
                src={previewTileImage}
                alt=""
                className={`tile-image ${previewPlace === 'main' ? 'tile-image-main' : 'tile-image-side'}`}
                style={{
                  objectFit: tileFit,
                  transform: `translate(${tileX}px, ${tileY}px) scale(${Math.max(0.2, tileScale / 100)})`,
                }}
              />
            ) : (
              <div className="tile-preview-empty">Изображение не выбрано</div>
            )}
            {tilePreset.size === 'small' ? (
              <span className="tile-title">{tilePreset.title}</span>
            ) : (
              <span className="tile-title">
                <span className="tile-title-line">{tilePreset.title.split(/\s+/)[0] ?? tilePreset.title}</span>
                <span className="tile-title-line">{tilePreset.title.split(/\s+/).slice(1).join(' ')}</span>
              </span>
            )}
            {tilePreset.size !== 'small' && <span className="tile-more">Подробнее</span>}
          </div>
          <div className="meta">Потяните плитку мышью/пальцем для позиционирования</div>
        </div>
        <div className="meta">Загружено изображений плиток: {tiles.length}</div>
        {tiles.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {tiles.map((t) => (
              <div key={t.id} className="admin-row">
                <div>
                  <strong>{t.title}</strong>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await deleteAdminTile(t.id)
                    setStatus('Плитка удалена')
                    await reload()
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {adminTab === 'documents' && (
      <div className="card admin-card" style={{ marginBottom: '1rem' }}>
        <h2>Уголок потребителя (документы)</h2>
        <div className="form-grid">
          <input placeholder="Название документа" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          <input placeholder="URL файла" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
          <input
            type="file"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'documents')
              setDocUrl(url)
            }}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              await createAdminDocument({ title: docTitle, file_url: docUrl, sort_order: 0, is_active: true })
              setStatus('Документ добавлен')
              setDocTitle('')
              setDocUrl('')
              await reload()
            }}
          >
            Добавить документ
          </button>
        </div>
        <div className="meta">Документов: {documents.length}</div>
        {documents.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {documents.map((d) => (
              <div key={d.id} className="admin-row">
                <a href={d.file_url} target="_blank" rel="noreferrer" className="doc-link">
                  {d.title}
                </a>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await deleteAdminDocument(d.id)
                    setStatus('Документ удалён')
                    await reload()
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {adminTab === 'banners' && (
      <div className="card admin-card" style={{ marginBottom: '1rem' }}>
        <h2>Рекламные баннеры</h2>
        <div className="admin-subtitle">Создание акции</div>
        <div className="form-grid admin-grid admin-grid--banner-create">
          <input placeholder="Заголовок баннера" value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} />
          <input placeholder="URL баннера" value={bannerImage} onChange={(e) => setBannerImage(e.target.value)} />
          <textarea placeholder="Описание акции" value={bannerDescription} onChange={(e) => setBannerDescription(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'banners')
              setBannerImage(url)
            }}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              await createAdminBanner({
                title: bannerTitle,
                image_url: bannerImage,
                description: bannerDescription || null,
                card_image_url: null,
                card_image_fit: 'cover',
                card_image_x: 0,
                card_image_y: 0,
                card_image_scale: 100,
                list_image_url: null,
                list_image_fit: 'cover',
                list_image_x: 0,
                list_image_y: 0,
                list_image_scale: 100,
                target_url: null,
                sort_order: 0,
                is_active: true,
              })
              setStatus('Баннер добавлен')
              setBannerTitle('')
              setBannerImage('')
              setBannerDescription('')
              await reload()
            }}
          >
            Добавить баннер
          </button>
        </div>
        {banners.length > 0 && selectedBanner && (
          <>
          <div className="admin-subtitle" style={{ marginTop: '1rem' }}>Главная плитка "Акции"</div>
          <div className="form-grid admin-grid admin-grid--banner-tune" style={{ marginTop: '0.55rem' }}>
            <label>
              Баннер для главной плитки "Акции"
              <select value={bannerPresetId} onChange={(e) => setBannerPresetId(e.target.value)}>
                {banners.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Подгонка
              <select value={bannerCardFit} onChange={(e) => setBannerCardFit(e.target.value as 'cover' | 'contain')}>
                <option value="cover">Заполнить (cover)</option>
                <option value="contain">Вписать (contain)</option>
              </select>
            </label>
            <input placeholder="URL картинки для главной плитки Акции" value={bannerCardImage} onChange={(e) => setBannerCardImage(e.target.value)} />
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = await uploadAdminFile(file, 'banners')
                setBannerCardImage(url)
              }}
            />
            <button
              className="btn-primary"
              onClick={async () => {
                if (!selectedBanner) return
                await updateAdminBanner(selectedBanner.id, {
                  title: selectedBanner.title,
                  image_url: selectedBanner.image_url,
                  description: selectedBanner.description ?? null,
                  card_image_url: bannerCardImage.trim() || null,
                  card_image_fit: bannerCardFit,
                  card_image_x: bannerCardX,
                  card_image_y: bannerCardY,
                  card_image_scale: bannerCardScale,
                  list_image_url: selectedBanner.list_image_url ?? null,
                  list_image_fit: selectedBanner.list_image_fit ?? 'cover',
                  list_image_x: Number(selectedBanner.list_image_x ?? 0),
                  list_image_y: Number(selectedBanner.list_image_y ?? 0),
                  list_image_scale: Number(selectedBanner.list_image_scale ?? 100),
                  target_url: selectedBanner.target_url,
                  sort_order: selectedBanner.sort_order,
                  is_active: selectedBanner.is_active,
                })
                setStatus('Плитка акции обновлена')
                await reload()
              }}
            >
              Сохранить плитку акции
            </button>
            <label>
              Смещение X: {bannerCardX}px
              <input type="range" min={-300} max={300} value={bannerCardX} onChange={(e) => setBannerCardX(Number(e.target.value))} />
            </label>
            <label>
              Смещение Y: {bannerCardY}px
              <input type="range" min={-300} max={300} value={bannerCardY} onChange={(e) => setBannerCardY(Number(e.target.value))} />
            </label>
            <label>
              Масштаб: {bannerCardScale}%
              <input type="range" min={40} max={220} value={bannerCardScale} onChange={(e) => setBannerCardScale(Number(e.target.value))} />
            </label>
          </div>
          </>
        )}
        {banners.length > 0 && selectedBanner && (
          <>
          <div className="admin-subtitle" style={{ marginTop: '0.75rem' }}>Карточка общего экрана акций</div>
          <div className="form-grid admin-grid admin-grid--banner-tune" style={{ marginTop: '0.55rem' }}>
            <label>
              Карточка на общем экране акций
              <select value={bannerPresetId} onChange={(e) => setBannerPresetId(e.target.value)}>
                {banners.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Подгонка карточки
              <select value={bannerListFit} onChange={(e) => setBannerListFit(e.target.value as 'cover' | 'contain')}>
                <option value="cover">Заполнить (cover)</option>
                <option value="contain">Вписать (contain)</option>
              </select>
            </label>
            <input placeholder="URL картинки для общего экрана акций" value={bannerListImage} onChange={(e) => setBannerListImage(e.target.value)} />
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = await uploadAdminFile(file, 'banners')
                setBannerListImage(url)
              }}
            />
            <button
              className="btn-primary"
              onClick={async () => {
                if (!selectedBanner) return
                await updateAdminBanner(selectedBanner.id, {
                  title: selectedBanner.title,
                  image_url: selectedBanner.image_url,
                  description: selectedBanner.description ?? null,
                  card_image_url: selectedBanner.card_image_url ?? null,
                  card_image_fit: selectedBanner.card_image_fit ?? 'cover',
                  card_image_x: Number(selectedBanner.card_image_x ?? 0),
                  card_image_y: Number(selectedBanner.card_image_y ?? 0),
                  card_image_scale: Number(selectedBanner.card_image_scale ?? 100),
                  list_image_url: bannerListImage.trim() || null,
                  list_image_fit: bannerListFit,
                  list_image_x: bannerListX,
                  list_image_y: bannerListY,
                  list_image_scale: bannerListScale,
                  target_url: selectedBanner.target_url,
                  sort_order: selectedBanner.sort_order,
                  is_active: selectedBanner.is_active,
                })
                setStatus('Карточка на общем экране акций обновлена')
                await reload()
              }}
            >
              Сохранить карточку общего экрана
            </button>
            <label>
              Смещение X: {bannerListX}px
              <input type="range" min={-300} max={300} value={bannerListX} onChange={(e) => setBannerListX(Number(e.target.value))} />
            </label>
            <label>
              Смещение Y: {bannerListY}px
              <input type="range" min={-300} max={300} value={bannerListY} onChange={(e) => setBannerListY(Number(e.target.value))} />
            </label>
            <label>
              Масштаб: {bannerListScale}%
              <input type="range" min={40} max={220} value={bannerListScale} onChange={(e) => setBannerListScale(Number(e.target.value))} />
            </label>
          </div>
          </>
        )}
        {selectedBanner && (
          <div className="tile-preview-wrap" style={{ marginTop: '0.75rem' }}>
            <div className="meta">Предпросмотр плитки на главной</div>
            <div className="promo-card promo-card-preview">
              <div className="promo-card-image-wrap">
                <img
                  src={(bannerCardImage.trim() || selectedBanner.card_image_url || selectedBanner.image_url)}
                  alt={selectedBanner.title}
                  className="promo-card-image"
                  style={{
                    objectFit: bannerCardFit,
                    transform: `translate(${bannerCardX}px, ${bannerCardY}px) scale(${Math.max(0.2, bannerCardScale / 100)})`,
                  }}
                />
              </div>
              <div className="promo-card-title">{selectedBanner.title}</div>
            </div>
          </div>
        )}
        {selectedBanner && (
          <div className="tile-preview-wrap" style={{ marginTop: '0.75rem' }}>
            <div className="meta">Предпросмотр карточки общего экрана</div>
            <div className="promo-card promo-card-preview">
              <div className="promo-card-image-wrap">
                <img
                  src={(bannerListImage.trim() || selectedBanner.list_image_url || selectedBanner.image_url)}
                  alt={selectedBanner.title}
                  className="promo-card-image"
                  style={{
                    objectFit: bannerListFit,
                    transform: `translate(${bannerListX}px, ${bannerListY}px) scale(${Math.max(0.2, bannerListScale / 100)})`,
                  }}
                />
              </div>
              <div className="promo-card-title">{selectedBanner.title}</div>
            </div>
          </div>
        )}
        <div className="meta">Баннеров: {banners.length}</div>
        {banners.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {banners.map((b) => (
              <div key={b.id} className="admin-row">
                <div>
                  <strong>{b.title}</strong>
                  {b.description && <div className="meta">{b.description}</div>}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await deleteAdminBanner(b.id)
                    setStatus('Баннер удалён')
                    await reload()
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {adminTab === 'checkups' && (
      <div className="card admin-card" style={{ marginBottom: '1rem' }}>
        <h2>Контент страницы Check-up</h2>
        <div className="admin-row" style={{ marginBottom: '0.75rem' }}>
          <div>
            <strong>Общий экран Check-up</strong>
            <div className="meta">Если выключено, пользователи увидят заглушку "Раздел в разработке".</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="checkbox"
              checked={checkupsFeatureEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked
                setCheckupsFeatureEnabled(enabled)
                await setCheckupsFeatureFlag(enabled)
                setStatus(enabled ? 'Раздел Check-up включен' : 'Раздел Check-up скрыт (в разработке)')
              }}
            />
            <span>{checkupsFeatureEnabled ? 'Включено' : 'Выключено'}</span>
          </label>
        </div>
        <div className="admin-subtitle">Плитки главного экрана Check-up</div>
        <div className="form-grid admin-grid admin-grid--checkups" style={{ marginBottom: '0.85rem' }}>
          <label>
            Плитка для редактирования
            <select value={checkupGroupEditId} onChange={(e) => setCheckupGroupEditId(e.target.value)}>
              <option value="">Новая плитка</option>
              {checkupGroupTiles.map((x) => (
                <option key={x.id} value={x.id}>{x.title}</option>
              ))}
            </select>
          </label>
          <input placeholder="Заголовок плитки" value={checkupGroupTileTitle} onChange={(e) => setCheckupGroupTileTitle(e.target.value)} />
          <input placeholder="Описание плитки" value={checkupGroupTileDescription} onChange={(e) => setCheckupGroupTileDescription(e.target.value)} />
          <label>
            Подгонка картинки плитки
            <select value={checkupGroupTileFit} onChange={(e) => setCheckupGroupTileFit(e.target.value as 'cover' | 'contain')}>
              <option value="cover">Заполнить (cover)</option>
              <option value="contain">Вписать (contain)</option>
            </select>
          </label>
          <input placeholder="URL картинки плитки" value={checkupGroupTileImage} onChange={(e) => setCheckupGroupTileImage(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'checkups')
              setCheckupGroupTileImage(url)
            }}
          />
          <input
            type="number"
            placeholder="Порядок"
            value={checkupGroupTileSort}
            onChange={(e) => setCheckupGroupTileSort(Number(e.target.value) || 0)}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              const payload = {
                title: checkupGroupTileTitle.trim() || 'Общий',
                description: checkupGroupTileDescription || null,
                image_url: checkupGroupTileImage || null,
                image_fit: checkupGroupTileFit,
                image_x: checkupGroupTileX,
                image_y: checkupGroupTileY,
                image_scale: checkupGroupTileScale,
                sort_order: checkupGroupTileSort,
                is_active: true,
              }
              if (checkupGroupEditId) {
                await updateAdminCheckupGroup(checkupGroupEditId, payload)
                setStatus('Плитка главного экрана Check-up обновлена')
              } else {
                await createAdminCheckupGroup(payload)
                setStatus('Плитка главного экрана Check-up добавлена')
              }
              setCheckupGroupEditId('')
              setCheckupGroupTileTitle('Общий')
              setCheckupGroupTileDescription('')
              setCheckupGroupTileImage('')
              setCheckupGroupTileFit('cover')
              setCheckupGroupTileX(0)
              setCheckupGroupTileY(0)
              setCheckupGroupTileScale(100)
              setCheckupGroupTileSort(0)
              await reload()
            }}
            disabled={!checkupGroupTileTitle.trim()}
          >
            {checkupGroupEditId ? 'Сохранить плитку' : 'Добавить плитку'}
          </button>
          <label>
            Смещение X: {checkupGroupTileX}px
            <input type="range" min={-300} max={300} value={checkupGroupTileX} onChange={(e) => setCheckupGroupTileX(Number(e.target.value))} />
          </label>
          <label>
            Смещение Y: {checkupGroupTileY}px
            <input type="range" min={-300} max={300} value={checkupGroupTileY} onChange={(e) => setCheckupGroupTileY(Number(e.target.value))} />
          </label>
          <label>
            Масштаб: {checkupGroupTileScale}%
            <input type="range" min={40} max={220} value={checkupGroupTileScale} onChange={(e) => setCheckupGroupTileScale(Number(e.target.value))} />
          </label>
        </div>
        <div className="tile-preview-wrap" style={{ marginTop: '0.55rem' }}>
          <div className="meta">Предпросмотр плитки главного экрана Check-up</div>
          <button type="button" className="checkup-group-card checkup-group-card--top" style={{ pointerEvents: 'none' }}>
            <div className="checkup-group-card-title">{checkupGroupTileTitle || 'Заголовок'}</div>
            <div className="checkup-group-card-subtitle">{checkupGroupTileDescription || 'Описание плитки'}</div>
            <span className="checkup-group-card-more">Подробнее</span>
            {checkupGroupTileImage && (
              <img
                src={checkupGroupTileImage}
                alt=""
                className="checkup-group-card-image"
                style={{
                  objectFit: checkupGroupTileFit,
                  transform: `translate(${checkupGroupTileX}px, ${checkupGroupTileY}px) scale(${Math.max(0.2, checkupGroupTileScale / 100)})`,
                }}
              />
            )}
          </button>
        </div>
        <div className="meta">Плиток главного экрана: {checkupGroupTiles.length}</div>
        {checkupGroupTiles.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.55rem', marginBottom: '0.75rem' }}>
            {checkupGroupTiles.map((x) => (
              <div key={x.id} className="admin-row">
                <div>
                  <strong>{x.title}</strong>
                  {x.description && <div className="meta">{x.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-ghost" onClick={() => setCheckupGroupEditId(x.id)}>Редактировать</button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      await deleteAdminCheckupGroup(x.id)
                      setStatus('Плитка главного экрана удалена')
                      if (checkupGroupEditId === x.id) setCheckupGroupEditId('')
                      await reload()
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="admin-subtitle">Список программ внутри плиток</div>
        <div className="form-grid admin-grid admin-grid--checkups">
          <label>
            Запись для редактирования
            <select value={checkupEditId} onChange={(e) => setCheckupEditId(e.target.value)}>
              <option value="">Новая запись</option>
              {checkups.map((x) => (
                <option key={x.id} value={x.id}>{x.title}</option>
              ))}
            </select>
          </label>
          <input placeholder="Заголовок" value={checkupTitle} onChange={(e) => setCheckupTitle(e.target.value)} />
          <input placeholder="Подзаголовок (необязательно)" value={checkupSubtitle} onChange={(e) => setCheckupSubtitle(e.target.value)} />
          <label>
            Категория (флаг для плитки)
            <select value={checkupGroupTitle} onChange={(e) => setCheckupGroupTitle(e.target.value)}>
              {checkupCategoryOptions.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <input placeholder="Цена / подпись справа" value={checkupPrice} onChange={(e) => setCheckupPrice(e.target.value)} />
          <input placeholder="URL картинки карточки на общем экране" value={checkupListImage} onChange={(e) => setCheckupListImage(e.target.value)} />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'checkups')
              setCheckupListImage(url)
            }}
          />
          <input placeholder="URL картинки для детальной страницы" value={checkupImage} onChange={(e) => setCheckupImage(e.target.value)} />
          <label>
            Подгонка картинки детальной страницы
            <select value={checkupImageFit} onChange={(e) => setCheckupImageFit(e.target.value as 'cover' | 'contain')}>
              <option value="cover">Заполнить (cover)</option>
              <option value="contain">Вписать (contain)</option>
            </select>
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'checkups')
              setCheckupImage(url)
            }}
          />
          <input
            type="number"
            placeholder="Порядок"
            value={checkupSort}
            onChange={(e) => setCheckupSort(Number(e.target.value) || 0)}
          />
          <textarea placeholder="Описание программы" value={checkupDescription} onChange={(e) => setCheckupDescription(e.target.value)} />
          <textarea
            placeholder="Левый список (каждый пункт с новой строки)"
            value={checkupIncludedLeft}
            onChange={(e) => setCheckupIncludedLeft(e.target.value)}
          />
          <textarea
            placeholder="Правый список (каждый пункт с новой строки)"
            value={checkupIncludedRight}
            onChange={(e) => setCheckupIncludedRight(e.target.value)}
          />
          <textarea
            placeholder="Абзац под списками"
            value={checkupPostInfoText}
            onChange={(e) => setCheckupPostInfoText(e.target.value)}
          />
          <textarea
            placeholder="Жирная подпись внизу"
            value={checkupCtaText}
            onChange={(e) => setCheckupCtaText(e.target.value)}
          />
          <input
            placeholder="Правое информационное сообщение"
            value={checkupRegistryNote}
            onChange={(e) => setCheckupRegistryNote(e.target.value)}
          />
          <div className="admin-checkup-blocks-editor">
            <div className="admin-subtitle">Контент внутри страницы (заголовки, абзацы, списки)</div>
            <div className="admin-builder-tools">
              <button type="button" className="btn-ghost" onClick={() => setCheckupContentBlocks((prev) => [...prev, createCheckupContentBlock('heading')])}>+ Заголовок</button>
              <button type="button" className="btn-ghost" onClick={() => setCheckupContentBlocks((prev) => [...prev, createCheckupContentBlock('subheading')])}>+ Подзаголовок</button>
              <button type="button" className="btn-ghost" onClick={() => setCheckupContentBlocks((prev) => [...prev, createCheckupContentBlock('paragraph')])}>+ Абзац</button>
              <button type="button" className="btn-ghost" onClick={() => setCheckupContentBlocks((prev) => [...prev, createCheckupContentBlock('list')])}>+ Список</button>
            </div>
            <div className="admin-list" style={{ marginTop: '0.5rem' }}>
              {checkupContentBlocks.map((block) => (
                <div key={block.id} className="admin-builder-item">
                  <div className="admin-builder-item-head">
                    <strong>{block.type === 'heading' ? 'Заголовок' : block.type === 'subheading' ? 'Подзаголовок' : block.type === 'list' ? 'Список' : 'Абзац'}</strong>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setCheckupContentBlocks((prev) => prev.filter((x) => x.id !== block.id))}
                    >
                      Удалить
                    </button>
                  </div>
                  <textarea
                    value={block.text}
                    onChange={(e) =>
                      setCheckupContentBlocks((prev) => prev.map((x) => (x.id === block.id ? { ...x, text: e.target.value } : x)))
                    }
                    placeholder={block.type === 'list' ? 'Каждый пункт с новой строки' : 'Текст блока'}
                  />
                  <div className="admin-builder-tools">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        setCheckupContentBlocks((prev) =>
                          prev.map((x) => (x.id === block.id ? { ...x, font_size: Math.max(14, x.font_size - 2) } : x)),
                        )
                      }
                    >
                      A-
                    </button>
                    <span className="meta">Размер: {block.font_size}px</span>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        setCheckupContentBlocks((prev) =>
                          prev.map((x) => (x.id === block.id ? { ...x, font_size: Math.min(64, x.font_size + 2) } : x)),
                        )
                      }
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${block.is_bold ? 'active' : ''}`}
                      onClick={() =>
                        setCheckupContentBlocks((prev) =>
                          prev.map((x) => (x.id === block.id ? { ...x, is_bold: !x.is_bold } : x)),
                        )
                      }
                    >
                      Жирный
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={async () => {
              const payload = {
                title: checkupTitle,
                subtitle: checkupSubtitle || null,
                group_title: displayCheckupCategory(checkupGroupTitle),
                price_label: checkupPrice || null,
                list_image_url: checkupListImage || null,
                image_url: checkupImage || null,
                image_fit: checkupImageFit,
                image_x: checkupImageX,
                image_y: checkupImageY,
                image_scale: checkupImageScale,
                description: checkupDescription || null,
                included_left: checkupIncludedLeft || null,
                included_right: checkupIncludedRight || null,
                post_info_text: checkupPostInfoText || null,
                cta_text: checkupCtaText || null,
                registry_note: checkupRegistryNote || null,
                content_json: checkupContentBlocks.length ? JSON.stringify(checkupContentBlocks) : null,
                sort_order: checkupSort,
                is_active: true,
              }
              if (checkupEditId) {
                await updateAdminCheckup(checkupEditId, payload)
                setStatus('Программа Check-up обновлена')
              } else {
                await createAdminCheckup(payload)
                setStatus('Программа Check-up добавлена')
              }
              setCheckupEditId('')
              setCheckupTitle('')
              setCheckupSubtitle('')
              setCheckupGroupTitle(checkupCategoryOptions[0] ?? 'Общий')
              setCheckupPrice('')
              setCheckupListImage('')
              setCheckupImage('')
              setCheckupImageFit('cover')
              setCheckupImageX(0)
              setCheckupImageY(0)
              setCheckupImageScale(100)
              setCheckupDescription('')
              setCheckupIncludedLeft('')
              setCheckupIncludedRight('')
              setCheckupPostInfoText('')
              setCheckupCtaText('')
              setCheckupRegistryNote('')
              setCheckupContentBlocks([])
              setCheckupSort(0)
              await reload()
            }}
            disabled={!checkupTitle.trim() || !checkupGroupTitle.trim()}
          >
            {checkupEditId ? 'Сохранить изменения' : 'Добавить программу'}
          </button>
          <label>
            Смещение X (детальная): {checkupImageX}px
            <input type="range" min={-300} max={300} value={checkupImageX} onChange={(e) => setCheckupImageX(Number(e.target.value))} />
          </label>
          <label>
            Смещение Y (детальная): {checkupImageY}px
            <input type="range" min={-300} max={300} value={checkupImageY} onChange={(e) => setCheckupImageY(Number(e.target.value))} />
          </label>
          <label>
            Масштаб (детальная): {checkupImageScale}%
            <input type="range" min={40} max={220} value={checkupImageScale} onChange={(e) => setCheckupImageScale(Number(e.target.value))} />
          </label>
        </div>
        <div className="tile-preview-wrap" style={{ marginTop: '0.75rem' }}>
          <div className="meta">Полный предпросмотр страницы чекапа</div>
          <div className="checkup-preview-full">
            <div className="doctors-page-head">
              <button type="button" className="back-chip-btn" disabled>
                <span aria-hidden>←</span> Назад
              </button>
              <h2>{`Чекап "${checkupTitle || 'Новый'}"`}</h2>
            </div>
            <section className="checkup-details">
              <div className="checkup-details-top">
                <div className="checkup-details-texts">
                  <h3>Описание услуги</h3>
                  <div className="promo-details-text">{checkupDescription || 'Описание программы'}</div>
                  {checkupPrice && <div className="checkup-details-price">{checkupPrice}</div>}
                </div>
                {(checkupImage || checkupListImage) && (
                  <div className="checkup-details-image-wrap">
                    <img
                      src={checkupImage || checkupListImage}
                      alt=""
                      className="checkup-details-image"
                      style={{
                        objectFit: checkupImageFit,
                        transform: `translate(${checkupImageX}px, ${checkupImageY}px) scale(${Math.max(0.2, checkupImageScale / 100)})`,
                      }}
                    />
                  </div>
                )}
              </div>
              {checkupContentBlocks.length > 0 ? (
                <div className="checkup-article-view">
                  {checkupContentBlocks.map((block) => (
                    <div key={block.id} style={{ fontSize: `${block.font_size}px`, fontWeight: block.is_bold ? 600 : 400 }}>
                      {block.type === 'list' ? (
                        <ul className="checkup-article-list">
                          {block.text.split('\n').map((x) => x.trim()).filter(Boolean).map((row, idx) => (
                            <li key={`${block.id}-${idx}`}>{row}</li>
                          ))}
                        </ul>
                      ) : block.text}
                    </div>
                  ))}
                </div>
              ) : null}
              {(checkupContentBlocks.length === 0 ||
                Boolean(checkupIncludedLeft.trim()) ||
                Boolean(checkupIncludedRight.trim()) ||
                Boolean(checkupPostInfoText.trim()) ||
                Boolean(checkupCtaText.trim()) ||
                Boolean(checkupRegistryNote.trim())) && (
                <div className="checkup-details-extra">
                  <div className="checkup-details-bullets-box">
                    <div className="checkup-details-extra-title">В чекап входят:</div>
                    <div className="checkup-details-bullets">
                      <ul className="checkup-bullet-list">
                        {(checkupIncludedLeft.trim() ? checkupIncludedLeft.split('\n').map((x) => x.trim()).filter(Boolean) : []).map((text) => (
                          <li key={`preview-left-${text}`}>{text}</li>
                        ))}
                      </ul>
                      <ul className="checkup-bullet-list">
                        {(checkupIncludedRight.trim() ? checkupIncludedRight.split('\n').map((x) => x.trim()).filter(Boolean) : []).map((text) => (
                          <li key={`preview-right-${text}`}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {!!checkupPostInfoText.trim() && <div className="checkup-details-footer-text">{checkupPostInfoText}</div>}
                  {(Boolean(checkupCtaText.trim()) || Boolean(checkupRegistryNote.trim())) && (
                    <div className="checkup-details-bottom-row">
                      {!!checkupCtaText.trim() && <div className="checkup-details-note-strong">{checkupCtaText}</div>}
                      {!!checkupRegistryNote.trim() && <div className="checkup-details-note-info">{checkupRegistryNote}</div>}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
        <div className="meta">Программ: {checkups.length}</div>
        {checkups.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {checkups.map((x) => (
              <div key={x.id} className="admin-row">
                <div>
                  <strong>{x.title}</strong>
                  <div className="meta">{x.group_title}</div>
                  {x.price_label && <div className="meta">{x.price_label}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-ghost" onClick={() => setCheckupEditId(x.id)}>Редактировать</button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      await deleteAdminCheckup(x.id)
                      setStatus('Программа удалена')
                      if (checkupEditId === x.id) setCheckupEditId('')
                      await reload()
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {adminTab === 'doctors' && (
      <div className="card admin-card">
        <h2>Карточки врачей</h2>
        <div className="form-grid admin-grid admin-grid--doctors">
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">Выберите врача</option>
            {doctors.map((d) => (
              <option key={d.mis_id} value={d.mis_id}>
                {d.full_name}
              </option>
            ))}
          </select>
          <input placeholder="URL фото" value={doctorPhoto} onChange={(e) => setDoctorPhoto(e.target.value)} />
          <input placeholder="Фамилия" value={doctorSurname} onChange={(e) => setDoctorSurname(e.target.value)} />
          <input placeholder="Имя" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
          <input placeholder="Отчество" value={doctorPatronymic} onChange={(e) => setDoctorPatronymic(e.target.value)} />
          <input
            placeholder="Серая приписка"
            value={doctorExperience}
            onChange={(e) => setDoctorExperience(e.target.value)}
          />
          <input placeholder="Приписка 1 (зеленая)" value={doctorBadge1} onChange={(e) => setDoctorBadge1(e.target.value)} />
          <input placeholder="Приписка 2 (фиолетовая)" value={doctorBadge2} onChange={(e) => setDoctorBadge2(e.target.value)} />
          <input placeholder="Приписка 3 (желтая)" value={doctorBadge3} onChange={(e) => setDoctorBadge3(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="checkbox"
              checked={doctorShowInSections}
              onChange={(e) => setDoctorShowInSections(e.target.checked)}
            />
            <span>Показывать в разделах по врачам</span>
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const url = await uploadAdminFile(file, 'doctors')
              setDoctorPhoto(url)
            }}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              if (!doctorId) return
              if (!doctorSurname.trim() || !doctorName.trim()) {
                setStatus('Для ФИО заполните фамилию и имя')
                return
              }
              await updateAdminDoctorName(doctorId, {
                surname: doctorSurname.trim(),
                name: doctorName.trim(),
                patronymic: doctorPatronymic.trim() || null,
              })
              await upsertAdminDoctorMedia({
                employee_mis_id: doctorId,
                photo_url: doctorPhoto,
                experience_label: doctorExperience.trim() || null,
                badge1_label: doctorBadge1.trim() || null,
                badge2_label: doctorBadge2.trim() || null,
                badge3_label: doctorBadge3.trim() || null,
                show_in_sections: doctorShowInSections,
              })
              setStatus('ФИО и данные врача сохранены')
              await reload()
            }}
          >
            Сохранить данные врача
          </button>
        </div>
        <div className="meta">Карточек с данными: {media.length}</div>
        {media.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {media.map((m) => (
              <div key={m.id} className="admin-row">
                <div>
                  <div className="meta">{m.employee_mis_id}</div>
                  {m.experience_label && <div className="meta">Стаж: {m.experience_label}</div>}
                  {m.badge1_label && <div className="meta">Приписка 1: {m.badge1_label}</div>}
                  {m.badge2_label && <div className="meta">Приписка 2: {m.badge2_label}</div>}
                  {m.badge3_label && <div className="meta">Приписка 3: {m.badge3_label}</div>}
                  <div className="meta">В разделах по врачам: {m.show_in_sections === false ? 'скрыт' : 'показан'}</div>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await deleteAdminDoctorMedia(m.employee_mis_id)
                    setStatus('Данные удалены')
                    await reload()
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {status && <div className="status-msg ok">{status}</div>}
    </main>
  )
}

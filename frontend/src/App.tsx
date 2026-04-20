import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAppointment,
  createAdminBanner,
  createAdminCheckup,
  createAdminDocument,
  createAdminTile,
  deleteAdminBanner,
  deleteAdminCheckup,
  deleteAdminDocument,
  deleteAdminDoctorMedia,
  deleteAdminTile,
  fetchDaySlots,
  fetchFreeSlots,
  fetchDoctorServices,
  fetchDoctors,
  fetchSyncStatus,
  getAppointment,
  listAdminBanners,
  listAdminCheckups,
  listAdminDoctorMedia,
  listAdminDocuments,
  listAdminTiles,
  uploadAdminFile,
  updateAdminBanner,
  updateAdminCheckup,
  upsertAdminDoctorMedia,
  type AdminBanner,
  type AdminDoctorMedia,
  type AdminDocument,
  type AdminCheckupItem,
  type AdminTile,
  type DaySlot,
  type Employee,
  type Service,
  type SyncStatus,
} from './api'

type DoctorGroup = {
  title: string
  specialties: string[]
}

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
  | { kind: 'doctors'; title: string; doctors: Employee[] }
  | { kind: 'doctor'; doctor: Employee }
  | { kind: 'promos' }
  | { kind: 'promo'; banner: AdminBanner }
  | { kind: 'checkups' }
  | { kind: 'checkup'; item: AdminCheckupItem }

const DIAGNOSTIC_GROUPS: DoctorGroup[] = [
  { title: 'МРТ', specialties: ['мрт', 'магнитно-резонанс'] },
  { title: 'КТ', specialties: ['кт', 'компьютерн'] },
  { title: 'Рентген', specialties: ['рентген'] },
  { title: 'УЗИ', specialties: ['узи', 'ультразвук'] },
  { title: 'Эндоскопия', specialties: ['эндоскоп'] },
  { title: 'Функциональная диагностика', specialties: ['функциональн', 'ээг', 'эхо'] },
]

const FIXED_TILE_PRESETS: FixedTilePreset[] = [
  { key: 'main-specialists', title: 'Услуги специалистов', tile_type: 'main', size: 'large', sort_order: -1000, specialty_filters: null },
  {
    key: 'main-instrumental',
    title: 'Инструментальная диагностика',
    tile_type: 'main',
    size: 'large',
    sort_order: -999,
    specialty_filters: DIAGNOSTIC_GROUPS.flatMap((g) => g.specialties).join(','),
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

function dateKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  const [doctorMedia, setDoctorMedia] = useState<Record<string, string>>({})

  const refreshMeta = useCallback(async () => {
    try {
      const [d, st, t, docs, b, c, dm] = await Promise.all([
        fetchDoctors(),
        fetchSyncStatus(),
        listAdminTiles(),
        listAdminDocuments(),
        listAdminBanners(),
        listAdminCheckups(),
        listAdminDoctorMedia(),
      ])
      setDoctors(d)
      setSync(st)
      setTiles(t.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setDocuments(docs.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setBanners(b.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      setCheckups(c.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order))
      const map: Record<string, string> = {}
      for (const row of dm) map[row.employee_mis_id] = row.photo_url
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
    const id = window.setInterval(() => void refreshMeta(), 60_000)
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
            doctors={doctors}
            onOpenDoctors={() => setView({ kind: 'doctors', title: 'Все врачи', doctors })}
            onOpenGroup={(title, doctorsInGroup) => setView({ kind: 'doctors', title, doctors: doctorsInGroup })}
            onOpenDoctor={(doctor) => setView({ kind: 'doctor', doctor })}
            onOpenPromos={() => setView({ kind: 'promos' })}
            onOpenCheckups={() => setView({ kind: 'checkups' })}
            tiles={tiles}
            documents={documents}
            banners={banners}
          />
        )}
        {!loading && view.kind === 'promos' && (
          <PromoGrid banners={banners} onBack={() => setView({ kind: 'home' })} onPick={(b) => setView({ kind: 'promo', banner: b })} />
        )}
        {!loading && view.kind === 'promo' && (
          <PromoDetails banner={view.banner} onBack={() => setView({ kind: 'promos' })} />
        )}
        {!loading && view.kind === 'checkups' && (
          <CheckupGrid items={checkups} onBack={() => setView({ kind: 'home' })} onPick={(item) => setView({ kind: 'checkup', item })} />
        )}
        {!loading && view.kind === 'checkup' && (
          <CheckupDetails item={view.item} onBack={() => setView({ kind: 'checkups' })} />
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
            doctorPhoto={doctorMedia[view.doctor.mis_id]}
            onBack={() => setView({ kind: 'doctors', title: 'Все врачи', doctors })}
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
  onOpenDoctors,
  onOpenGroup,
  onOpenDoctor,
  onOpenPromos,
  onOpenCheckups,
  tiles,
  documents,
  banners,
}: {
  doctors: Employee[]
  onOpenDoctors: () => void
  onOpenGroup: (title: string, doctorsInGroup: Employee[]) => void
  onOpenDoctor: (doctor: Employee) => void
  onOpenPromos: () => void
  onOpenCheckups: () => void
  tiles: AdminTile[]
  documents: AdminDocument[]
  banners: AdminBanner[]
}) {
  const [consumerOpen, setConsumerOpen] = useState(false)
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
        const s = (d.specialty ?? '').toLowerCase()
        const tokens = s.split(/[^a-zа-я0-9]+/i).filter(Boolean)
        return qs.some((q) => {
          if (q.length <= 2) return tokens.includes(q)
          return s.includes(q)
        })
      })
    },
    [doctors],
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
        specialty_filters: DIAGNOSTIC_GROUPS.flatMap((g) => g.specialties).join(','),
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
      const needles = (filters ?? '')
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
      <button type="button" className="consumer-btn" onClick={() => setConsumerOpen(true)}>
        Уголок потребителя
      </button>

      <div className="home-head">
        <div className="logo-mark">
          <img src="/logo.svg" alt="Евродон" className="logo-mark-img" />
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

      {consumerOpen && (
        <ConsumerCornerModal documents={documents} onClose={() => setConsumerOpen(false)} />
      )}
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
              <div className="promo-card-title">{b.title}</div>
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
      <section className="promo-details">
        <h3 className="promo-details-title">{banner.title}</h3>
        <div className="promo-details-body">
          <div className="promo-details-image-wrap promo-details-image-wrap-small">
            <img src={banner.image_url} alt={banner.title} className="promo-details-image" />
          </div>
          <div className="promo-details-text">{banner.description?.trim() || 'Описание акции скоро появится.'}</div>
        </div>
      </section>
    </>
  )
}

function CheckupGrid({
  items,
  onBack,
  onPick,
}: {
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
        <h2>Программы Check-up</h2>
      </div>
      <div className="checkup-group-title">Общий</div>
      <div className="checkup-grid">
        {items.map((item) => (
          <button key={item.id} type="button" className="checkup-row" onClick={() => onPick(item)}>
            <span className="checkup-icon">◧</span>
            <span className="checkup-name">{item.title}</span>
            <span className="checkup-price">{item.price_label || ''}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function CheckupDetails({ item, onBack }: { item: AdminCheckupItem; onBack: () => void }) {
  return (
    <>
      <div className="doctors-page-head">
        <button type="button" className="back-chip-btn" onClick={onBack}>
          <span aria-hidden>←</span> Назад
        </button>
        <h2>Программы Check-up</h2>
      </div>
      <section className="promo-details">
        <h3>{item.title}</h3>
        {item.image_url && (
          <div className="promo-details-image-wrap">
            <img src={item.image_url} alt={item.title} className="promo-details-image" />
          </div>
        )}
        {item.price_label && <div className="meta" style={{ marginBottom: '0.6rem' }}>{item.price_label}</div>}
        <div className="promo-details-text">{item.description?.trim() || 'Описание программы скоро появится.'}</div>
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
  doctorMedia: Record<string, string>
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
              🔍
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
            <option value="">Направления</option>
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
                style={doctorMedia[d.mis_id] ? { backgroundImage: `url(${doctorMedia[d.mis_id]})` } : undefined}
              />
              <div className="doctor-card-text">
                {d.specialty && <div className="doctor-card-specialty">{d.specialty}</div>}
                <h2 className="doctor-card-name">{d.full_name}</h2>
                <div className="doctor-card-exp">Стаж работы</div>
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

function ConsumerCornerModal({ documents, onClose }: { documents: AdminDocument[]; onClose: () => void }) {
  const [selectedDocUrl, setSelectedDocUrl] = useState<string>('')

  useEffect(() => {
    if (!documents.length) {
      setSelectedDocUrl('')
      return
    }
    if (!selectedDocUrl || !documents.some((d) => d.file_url === selectedDocUrl)) {
      setSelectedDocUrl(documents[0].file_url)
    }
  }, [documents, selectedDocUrl])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-consumer">
        <h3>Уголок потребителя</h3>
        {documents.length === 0 ? (
          <div className="empty-hint">Документы не загружены</div>
        ) : (
          <>
          <div className="form-grid consumer-doc-list">
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`doc-link ${selectedDocUrl === d.file_url ? 'active' : ''}`}
                onClick={() => setSelectedDocUrl(d.file_url)}
              >
                {d.title}
              </button>
            ))}
          </div>
          {selectedDocUrl && (
            <div className="consumer-doc-preview">
              <iframe
                title="Просмотр документа"
                src={selectedDocUrl}
                className="consumer-doc-frame"
              />
            </div>
          )}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function DoctorSchedule({
  doctor,
  doctorPhoto,
  onBack,
  onBooked,
}: {
  doctor: Employee
  doctorPhoto?: string
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
          const hasFree = rows.length > 0
          return [dateKeyLocal(d), hasFree] as const
        } catch {
          return [dateKeyLocal(d), false] as const
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
  }, [doctor.mis_id, monthCursor, monthOpen, period])

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
          <div className="doctor-booking-photo-shape doctor-booking-photo-shape-a" />
          <div className="doctor-booking-photo-shape doctor-booking-photo-shape-b" />
          {doctorPhoto ? (
            <img src={doctorPhoto} alt={doctor.full_name} className="doctor-booking-photo" />
          ) : (
            <div className="doctor-booking-photo-fallback" />
          )}
        </div>

        <div className="doctor-booking-content">
          {doctor.specialty && <div className="doctor-booking-specialty">{doctor.specialty}</div>}
          <h2 className="doctor-booking-name">{doctor.full_name}</h2>
          <div className="doctor-booking-exp">Стаж работы с 2020 года</div>

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
                  <button
                    key={dateKeyLocal(d)}
                    type="button"
                    className={`doctor-week-day ${dateKeyLocal(d) === dateKeyLocal(day) ? 'active' : ''}`}
                    onClick={() => setDay(new Date(d))}
                  >
                    <span>{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                    <strong>{d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</strong>
                  </button>
                ))}
              </div>
              <div className="doctor-slots-strip">
                <button type="button" className="doctor-strip-arrow" onClick={() => shiftDay(-1)}>
                  ‹
                </button>
                <div className="doctor-slots-inline">
                  {slots.map((s) => (
                    <button
                      key={`${s.start}-${s.status}`}
                      type="button"
                      className={`doctor-slot-pill ${selectedSlot?.start === s.start ? 'selected' : ''}`}
                      disabled={s.status === 'busy'}
                      onClick={() => setSelectedSlot(s)}
                      title={s.status === 'busy' ? s.service_name ?? 'Занято' : 'Свободно'}
                    >
                      {new Date(s.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </button>
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
                  const key = dateKeyLocal(cell.date)
                  const available = !!monthAvailability[key]
                  const selected = dateKeyLocal(cell.date) === dateKeyLocal(day)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`doctor-calendar-day ${cell.inMonth ? '' : 'muted'} ${available ? 'has-slots' : ''} ${selected ? 'selected' : ''}`}
                      onClick={() => {
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
            <div className="booking-side-value">{formatDayRu(new Date(slot.start))}, {new Date(slot.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>

            <div className="booking-doctor-row">
              <div className="booking-doctor-avatar">
                {doctorPhoto ? (
                  <img src={doctorPhoto} alt={doctor.full_name} className="booking-doctor-avatar-img" />
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
              <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
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
                disabled={busy || !surname.trim() || !name.trim() || !birthday || phone.replace(/\D/g, '').length < 10}
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
  const [checkupPrice, setCheckupPrice] = useState('')
  const [checkupImage, setCheckupImage] = useState('')
  const [checkupDescription, setCheckupDescription] = useState('')
  const [checkupSort, setCheckupSort] = useState(0)
  const [checkupEditId, setCheckupEditId] = useState('')

  const [doctorId, setDoctorId] = useState('')
  const [doctorPhoto, setDoctorPhoto] = useState('')

  const reload = useCallback(async () => {
    const [t, d, b, c, m] = await Promise.all([
      listAdminTiles(),
      listAdminDocuments(),
      listAdminBanners(),
      listAdminCheckups(),
      listAdminDoctorMedia(),
    ])
    setTiles(t)
    setDocuments(d)
    setBanners(b)
    setCheckups(c)
    setMedia(m)
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

  useEffect(() => {
    if (!selectedCheckup) return
    setCheckupTitle(selectedCheckup.title)
    setCheckupSubtitle(selectedCheckup.subtitle ?? '')
    setCheckupPrice(selectedCheckup.price_label ?? '')
    setCheckupImage(selectedCheckup.image_url ?? '')
    setCheckupDescription(selectedCheckup.description ?? '')
    setCheckupSort(Number(selectedCheckup.sort_order ?? 0))
  }, [selectedCheckup?.id])

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
        <button type="button" className={`admin-tab ${adminTab === 'doctors' ? 'active' : ''}`} onClick={() => setAdminTab('doctors')}>Фото врачей</button>
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
          <input placeholder="Цена / подпись справа" value={checkupPrice} onChange={(e) => setCheckupPrice(e.target.value)} />
          <input placeholder="URL картинки для детальной страницы" value={checkupImage} onChange={(e) => setCheckupImage(e.target.value)} />
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
          <button
            className="btn-primary"
            onClick={async () => {
              const payload = {
                title: checkupTitle,
                subtitle: checkupSubtitle || null,
                price_label: checkupPrice || null,
                image_url: checkupImage || null,
                description: checkupDescription || null,
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
              setCheckupPrice('')
              setCheckupImage('')
              setCheckupDescription('')
              setCheckupSort(0)
              await reload()
            }}
            disabled={!checkupTitle.trim()}
          >
            {checkupEditId ? 'Сохранить изменения' : 'Добавить программу'}
          </button>
        </div>
        <div className="meta">Программ: {checkups.length}</div>
        {checkups.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {checkups.map((x) => (
              <div key={x.id} className="admin-row">
                <div>
                  <strong>{x.title}</strong>
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
        <h2>Фото в карточках врачей</h2>
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
              await upsertAdminDoctorMedia({ employee_mis_id: doctorId, photo_url: doctorPhoto })
              setStatus('Фото врача сохранено')
              await reload()
            }}
          >
            Сохранить фото врача
          </button>
        </div>
        <div className="meta">Фото врачей: {media.length}</div>
        {media.length > 0 && (
          <div className="admin-list" style={{ marginTop: '0.75rem' }}>
            {media.map((m) => (
              <div key={m.id} className="admin-row">
                <div className="meta">{m.employee_mis_id}</div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await deleteAdminDoctorMedia(m.employee_mis_id)
                    setStatus('Фото удалено')
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

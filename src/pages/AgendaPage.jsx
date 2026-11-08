import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import themePlugin from '@fullcalendar/react/themes/monarch'
import esLocale from '@fullcalendar/react/locales/es'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/monarch/theme.css'
import '@fullcalendar/react/themes/monarch/palettes/green.css'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const statusLabels = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_espera: 'En espera',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
}
const statusOptions = Object.entries(statusLabels)
const statusColors = {
  agendada: { color: '#cfe3f7', contrastColor: '#21496b' },
  confirmada: { color: '#cfe9d8', contrastColor: '#215438' },
  en_espera: { color: '#f5e4bd', contrastColor: '#694d15' },
  atendida: { color: '#dfdeee', contrastColor: '#4f4b76' },
  cancelada: { color: '#f3d8d5', contrastColor: '#7f2f2a' },
}

function localDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

function appointmentConflict(error) {
  if (error.code === '23P01') return 'Ese odontólogo o box ya tiene una cita en ese horario. Elige otro bloque.'
  if (error.code === '23514') return error.message
  return error.message || 'No se pudo guardar la cita.'
}

function formatAppointmentDate(value) {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

function formatAppointmentTime(value) {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

export default function AgendaPage() {
  const { profile } = useAuth()
  const calendarRef = useRef(null)
  const [doctors, setDoctors] = useState([])
  const [boxes, setBoxes] = useState([])
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingAppointments, setLoadingAppointments] = useState(true)
  const [doctorFilter, setDoctorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [patientQuery, setPatientQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  const doctorsById = useMemo(() => Object.fromEntries(doctors.map((doctor) => [doctor.id, doctor.full_name])), [doctors])

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    const [doctorResult, boxResult, patientResult] = await Promise.all([
      supabase.rpc('list_active_odontologists'),
      supabase.from('dental_boxes').select('id, name').eq('active', true).order('name'),
      supabase.from('patients').select('id, full_name, rut').order('full_name').limit(500),
    ])
    if (doctorResult.error) setNotice({ kind: 'error', text: 'No se pudo consultar el listado de odontólogos. Ejecuta la migración de agenda en Supabase.' })
    else setDoctors(doctorResult.data ?? [])
    if (boxResult.error) setNotice({ kind: 'error', text: `No se pudieron cargar los boxes: ${boxResult.error.message}` })
    else setBoxes(boxResult.data ?? [])
    if (patientResult.error) setNotice({ kind: 'error', text: `No se pudieron cargar los pacientes: ${patientResult.error.message}` })
    else setPatients(patientResult.data ?? [])
    setLoadingCatalog(false)
  }, [])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  const loadAppointmentList = useCallback(async () => {
    setLoadingAppointments(true)
    const { data, error } = await supabase.from('appointments')
      .select('id, patient_id, odontologist_id, box_id, starts_at, ends_at, status, reason, patient:patients!appointments_patient_id_fkey(full_name, rut), box:dental_boxes!appointments_box_id_fkey(name)')
      .order('starts_at', { ascending: true })
      .limit(500)
    if (error) setNotice({ kind: 'error', text: `No se pudieron cargar las citas: ${error.message}` })
    else setAppointments(data ?? [])
    setLoadingAppointments(false)
  }, [])

  useEffect(() => { loadAppointmentList() }, [loadAppointmentList])

  const filteredAppointments = useMemo(() => {
    const needle = patientQuery.trim().toLocaleLowerCase('es')
    const visibleAppointments = appointments.filter((appointment) => {
      if (doctorFilter && appointment.odontologist_id !== doctorFilter) return false
      if (statusFilter && appointment.status !== statusFilter) return false
      if (dateFilter && localDateTime(new Date(appointment.starts_at)).date !== dateFilter) return false
      if (!needle) return true
      const searchable = [appointment.patient?.full_name, appointment.patient?.rut, appointment.reason, appointment.box?.name, doctorsById[appointment.odontologist_id]]
        .filter(Boolean).join(' ').toLocaleLowerCase('es')
      return searchable.includes(needle)
    })
    const now = Date.now()
    return visibleAppointments.sort((first, second) => {
      const firstTime = new Date(first.starts_at).getTime()
      const secondTime = new Date(second.starts_at).getTime()
      const firstUpcoming = firstTime >= now
      const secondUpcoming = secondTime >= now
      if (firstUpcoming !== secondUpcoming) return firstUpcoming ? -1 : 1
      return firstUpcoming ? firstTime - secondTime : secondTime - firstTime
    })
  }, [appointments, dateFilter, doctorFilter, doctorsById, patientQuery, statusFilter])

  const loadEvents = useCallback(async (fetchInfo) => {
    let query = supabase.from('appointments')
      .select('id, patient_id, odontologist_id, box_id, starts_at, ends_at, status, reason, patient:patients!appointments_patient_id_fkey(full_name), box:dental_boxes!appointments_box_id_fkey(name)')
      .lt('starts_at', fetchInfo.endStr)
      .gt('ends_at', fetchInfo.startStr)
      .order('starts_at')
    if (doctorFilter) query = query.eq('odontologist_id', doctorFilter)
    const { data, error } = await query
    if (error) {
      setNotice({ kind: 'error', text: `No se pudieron cargar las citas: ${error.message}` })
      return []
    }
    return (data ?? []).map((appointment) => ({
      id: appointment.id,
      title: appointment.patient?.full_name || 'Paciente',
      start: appointment.starts_at,
      end: appointment.ends_at,
      className: `status-${appointment.status}`,
      ...statusColors[appointment.status],
      extendedProps: {
        patient_id: appointment.patient_id,
        odontologist_id: appointment.odontologist_id,
        box_id: appointment.box_id,
        status: appointment.status,
        reason: appointment.reason ?? '',
        patient_name: appointment.patient?.full_name ?? 'Paciente',
        box_name: appointment.box?.name ?? 'Box',
      },
    }))
  }, [doctorFilter])

  function openCreate(date, allDay = false) {
    setCalendarOpen(false)
    const start = new Date(date)
    if (allDay) start.setHours(9, 0, 0, 0)
    const { date: visitDate, time } = localDateTime(start)
    setDraft({ id: null, date: visitDate, time, duration: 30, patient_id: '', odontologist_id: doctors[0]?.id ?? '', box_id: boxes[0]?.id ?? '', status: 'agendada', reason: '' })
    setNotice(null)
  }

  function openEdit(event) {
    setCalendarOpen(false)
    const { date, time } = localDateTime(event.start ?? new Date())
    const duration = Math.max(15, Math.round(((event.end?.getTime() ?? event.start.getTime() + 30 * 60000) - event.start.getTime()) / 60000))
    setDraft({
      id: event.id,
      date,
      time,
      duration,
      patient_id: event.extendedProps.patient_id,
      odontologist_id: event.extendedProps.odontologist_id,
      box_id: event.extendedProps.box_id,
      status: event.extendedProps.status,
      reason: event.extendedProps.reason,
    })
    setNotice(null)
  }

  function openEditAppointment(appointment) {
    setNotice(null)
    const { date, time } = localDateTime(new Date(appointment.starts_at))
    const duration = Math.max(15, Math.round((new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60000))
    setDraft({
      id: appointment.id,
      date,
      time,
      duration,
      patient_id: appointment.patient_id,
      odontologist_id: appointment.odontologist_id,
      box_id: appointment.box_id,
      status: appointment.status,
      reason: appointment.reason ?? '',
    })
    setNotice(null)
  }

  async function saveAppointment(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const startsAt = new Date(`${draft.date}T${draft.time}:00`)
    const endsAt = new Date(startsAt.getTime() + Number(draft.duration) * 60000)
    if (Number.isNaN(startsAt.getTime()) || endsAt <= startsAt) {
      setSaving(false)
      setNotice({ kind: 'error', text: 'Revisa la fecha, la hora y la duración.' })
      return
    }
    const appointment = {
      patient_id: draft.patient_id,
      odontologist_id: draft.odontologist_id,
      box_id: draft.box_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: draft.status,
      reason: draft.reason.trim() || null,
    }
    const result = draft.id
      ? await supabase.from('appointments').update(appointment).eq('id', draft.id)
      : await supabase.from('appointments').insert(appointment)
    setSaving(false)
    if (result.error) {
      setNotice({ kind: 'error', text: appointmentConflict(result.error) })
      return
    }
    setDraft(null)
    setNotice({ kind: 'success', text: draft.id ? 'Cita actualizada.' : 'Cita agendada.' })
    calendarRef.current?.getApi().refetchEvents()
    await loadAppointmentList()
  }

  const canCreate = doctors.length > 0 && boxes.length > 0 && patients.length > 0

  return (
    <main className="agenda-shell">
      <header className="agenda-topbar">
        <Link to="/" className="back-link">← Volver al panel</Link>
        <div className="staff-account"><span className="user-avatar">{(profile.full_name || 'U').charAt(0).toUpperCase()}</span><span>{profile.full_name || 'Personal'}</span></div>
      </header>

      <section className="agenda-heading">
        <div><p className="eyebrow">Clínica · Organización diaria</p><h1>Agenda</h1><p>Coordina pacientes, odontólogos y boxes en un solo calendario.</p></div>
        <div className="agenda-heading-actions">
          <button className="secondary-button" type="button" onClick={() => setCalendarOpen(true)}>▦ Ver calendario</button>
          <button className="primary-button agenda-new-button" disabled={loadingCatalog || !canCreate} onClick={() => openCreate(new Date())}>＋ Agendar cita</button>
        </div>
      </section>

      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}
      {!loadingCatalog && !canCreate && <div className="agenda-setup-note">
        <strong>Falta completar datos para agendar.</strong>
        <span>{patients.length === 0 && <>Registra un paciente en <Link to="/patients">Pacientes</Link>. </>}{doctors.length === 0 && 'Debe existir al menos un usuario activo con rol Odontólogo. '}{boxes.length === 0 && 'No hay boxes activos.'}</span>
      </div>}

      <section className="agenda-appointments-section" aria-labelledby="appointments-heading">
        <div className="agenda-appointments-toolbar">
          <div className="agenda-appointments-title"><h2 id="appointments-heading">Citas</h2><p>{filteredAppointments.length} {filteredAppointments.length === 1 ? 'cita' : 'citas'}{dateFilter ? ' para la fecha seleccionada' : ' registradas'}</p></div>
          <div className="agenda-filters">
            <label className="agenda-search-field">Buscar paciente<input type="search" value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Nombre o RUT" /></label>
            <label>Fecha<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
            <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Odontólogo<select value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}><option value="">Todo el equipo</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || 'Odontólogo'}</option>)}</select></label>
          </div>
        </div>
        {loadingAppointments ? <p className="staff-empty">Cargando citas…</p> : filteredAppointments.length === 0 ? (
          <div className="agenda-empty-state"><strong>{appointments.length ? 'No encontramos citas con esos filtros.' : 'Todavía no hay citas registradas.'}</strong><p>{appointments.length ? 'Prueba con otra fecha, estado o búsqueda.' : 'Agenda una cita nueva o revisa el calendario.'}</p></div>
        ) : (
          <div className="appointment-card-grid">{filteredAppointments.map((appointment) => <article className={`appointment-card status-${appointment.status}`} key={appointment.id}>
            <div className="appointment-card-top"><span className={`appointment-status-pill status-${appointment.status}`}>{statusLabels[appointment.status]}</span><time dateTime={appointment.starts_at}>{formatAppointmentDate(appointment.starts_at)}</time></div>
            <h3>{appointment.patient?.full_name || 'Paciente'}</h3>
            {appointment.patient?.rut && <p className="appointment-card-rut">RUT {appointment.patient.rut}</p>}
            <div className="appointment-card-details">
              <div><span>Horario</span><strong>{formatAppointmentTime(appointment.starts_at)}–{formatAppointmentTime(appointment.ends_at)}</strong></div>
              <div><span>Odontólogo</span><strong>{doctorsById[appointment.odontologist_id] || 'Odontólogo inactivo'}</strong></div>
              <div><span>Box</span><strong>{appointment.box?.name || 'Box'}</strong></div>
            </div>
            {appointment.reason && <p className="appointment-card-reason">{appointment.reason}</p>}
            <button className="appointment-card-action" type="button" onClick={() => openEditAppointment(appointment)}>Ver o gestionar cita <span aria-hidden="true">→</span></button>
          </article>)}</div>
        )}
      </section>

      {calendarOpen && <div className="agenda-modal-backdrop calendar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarOpen(false) }}>
        <section className="agenda-modal agenda-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
          <div className="agenda-modal-heading"><div><p className="eyebrow">Disponibilidad</p><h2 id="calendar-modal-title">Calendario de citas</h2></div><button type="button" className="modal-close" aria-label="Cerrar calendario" onClick={() => setCalendarOpen(false)}>×</button></div>
          <div className="agenda-controls">
            <div className="agenda-legend" aria-label="Estados de cita">{Object.entries(statusLabels).map(([status, label]) => <span key={status}><i className={`legend-dot status-${status}`} />{label}</span>)}</div>
            <label className="doctor-filter">Odontólogo<select value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}><option value="">Todo el equipo</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || 'Odontólogo'}</option>)}</select></label>
          </div>
          <div className="calendar-wrap"><FullCalendar
            ref={calendarRef}
            plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
            themeSystem="monarch"
            locale={esLocale}
            firstDay={1}
            initialView="timeGridWeek"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }}
            buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana', month: 'Mes' }}
            events={loadEvents}
            selectable
            selectMirror
            select={(selection) => { openCreate(selection.start, selection.allDay); calendarRef.current?.getApi().unselect() }}
            dateClick={(info) => openCreate(info.date, info.allDay)}
            eventClick={(info) => openEdit(info.event)}
            eventContent={(info) => <div className={`agenda-event-content status-${info.event.extendedProps.status}`}><strong className="agenda-event-title">{info.event.title}</strong><span className="agenda-event-state">{statusLabels[info.event.extendedProps.status]}</span></div>}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            slotDuration="00:15:00"
            nowIndicator
            height="auto"
            expandRows
            weekends
            businessHours={{ daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: '08:00', endTime: '20:00' }}
            dayMaxEvents
            noEventsContent="Sin citas para este período"
          /></div>
        </section>
      </div>}

      {draft && <div className="agenda-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null) }}>
        <section className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title">
          <div className="agenda-modal-heading"><div><p className="eyebrow">{draft.id ? 'Detalle de cita' : 'Nueva reserva'}</p><h2 id="appointment-title">{draft.id ? 'Editar cita' : 'Agendar cita'}</h2></div><button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setDraft(null)}>×</button></div>
          <form className="appointment-form" onSubmit={saveAppointment}>
            <label className="appointment-full">Paciente<select required value={draft.patient_id} onChange={(event) => setDraft({ ...draft, patient_id: event.target.value })}><option value="">Selecciona un paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.rut}</option>)}</select></label>
            <label>Odontólogo<select required value={draft.odontologist_id} onChange={(event) => setDraft({ ...draft, odontologist_id: event.target.value })}><option value="">Selecciona</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || 'Odontólogo'}</option>)}</select></label>
            <label>Box<select required value={draft.box_id} onChange={(event) => setDraft({ ...draft, box_id: event.target.value })}><option value="">Selecciona</option>{boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}</select></label>
            <label>Fecha<input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
            <label>Hora de inicio<input type="time" required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
            <label>Duración<select value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: Number(event.target.value) })}><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={45}>45 minutos</option><option value={60}>1 hora</option><option value={90}>1 hora 30 min</option><option value={120}>2 horas</option></select></label>
            {draft.id && <label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            <label className="appointment-full">Motivo o nota<input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Ej. Control, evaluación…" /></label>
            <div className="appointment-modal-actions"><button className="cancel-button" type="button" onClick={() => setDraft(null)}>Cerrar</button><button className="primary-button" type="submit" disabled={saving || loadingCatalog}>{saving ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Confirmar cita'}</button></div>
          </form>
          {draft.id && <p className="appointment-meta">Atiende: {doctorsById[draft.odontologist_id] || 'Odontólogo inactivo'} · Los cambios de estado quedan registrados.</p>}
        </section>
      </div>}
    </main>
  )
}

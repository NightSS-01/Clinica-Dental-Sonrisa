import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const roles = ['administrador', 'recepcionista', 'odontologo', 'asistente_dental']
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sesión requerida' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  let publishableKey: string
  let secretKey: string
  try {
    publishableKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default
    secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
  } catch {
    return json({ error: 'No se pudieron leer las claves del servidor' }, 500)
  }
  if (!url || !publishableKey || !secretKey) return json({ error: 'Configuración del servidor incompleta' }, 500)

  const authClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return json({ error: 'Sesión inválida o vencida' }, 401)

  const { data: actor, error: actorError } = await adminClient
    .from('profiles').select('role, active, must_change_password').eq('id', user.id).maybeSingle()
  if (actorError) return json({ error: 'No se pudo verificar el perfil' }, 500)
  if (!actor?.active) return json({ error: 'La cuenta no está activa' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Solicitud JSON inválida' }, 400)
  }

  if (payload.action === 'complete-password-setup') {
    const { error } = await adminClient.from('profiles')
      .update({ must_change_password: false }).eq('id', user.id)
    if (error) return json({ error: 'La contraseña se guardó, pero no se pudo completar la activación' }, 500)
    return json({ ok: true, message: 'Contraseña configurada' })
  }

  if (actor.role !== 'administrador') return json({ error: 'Se requiere rol administrador' }, 403)

  if (payload.action === 'invite') {
    const email = String(payload.email ?? '').trim().toLowerCase()
    const fullName = String(payload.full_name ?? '').trim()
    const rut = String(payload.rut ?? '').trim() || null
    const role = String(payload.role ?? '')
    if (!email || !fullName || !roles.includes(role)) return json({ error: 'Completa correo, nombre y rol válido' }, 400)

    const origin = request.headers.get('origin')
    const redirectTo = origin ? new URL('/update-password', origin).toString() : undefined
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, rut },
      redirectTo,
    })
    if (error || !data.user) return json({ error: error?.message ?? 'No se pudo crear la invitación' }, 400)

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      rut,
      role,
      active: true,
      must_change_password: true,
    })
    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id)
      return json({ error: `No se pudo guardar el perfil: ${profileError.message}` }, 500)
    }
    return json({ ok: true, message: 'Invitación enviada' })
  }

  if (payload.action === 'update') {
    const id = String(payload.id ?? '')
    const role = String(payload.role ?? '')
    const fullName = String(payload.full_name ?? '').trim()
    const rut = String(payload.rut ?? '').trim() || null
    if (!id || !fullName || !roles.includes(role)) return json({ error: 'Datos de perfil inválidos' }, 400)
    const { error } = await adminClient.from('profiles')
      .update({ role, full_name: fullName, rut }).eq('id', id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, message: 'Perfil actualizado' })
  }

  if (payload.action === 'set-active') {
    const id = String(payload.id ?? '')
    const active = payload.active
    if (!id || typeof active !== 'boolean') return json({ error: 'Datos de estado inválidos' }, 400)
    if (id === user.id && !active) return json({ error: 'No puedes desactivar tu propia cuenta' }, 400)
    const { error } = await adminClient.from('profiles').update({ active }).eq('id', id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, message: active ? 'Cuenta activada' : 'Cuenta desactivada' })
  }

  if (payload.action === 'delete') {
    const id = String(payload.id ?? '')
    if (!id) return json({ error: 'Falta identificar la cuenta' }, 400)
    if (id === user.id) return json({ error: 'No puedes eliminar tu propia cuenta' }, 400)

    const { data: target, error: targetError } = await adminClient
      .from('profiles').select('id, role, active, full_name').eq('id', id).maybeSingle()
    if (targetError) return json({ error: 'No se pudo consultar la cuenta' }, 500)
    if (!target) return json({ error: 'La cuenta ya no existe' }, 404)

    if (target.role === 'administrador' && target.active) {
      const { count, error } = await adminClient.from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'administrador').eq('active', true).neq('id', id)
      if (error) return json({ error: 'No se pudo comprobar el resto de administradores' }, 500)
      if (!count) return json({ error: 'No puedes eliminar al último administrador activo' }, 400)
    }

    const { count: appointmentCount, error: appointmentError } = await adminClient
      .from('appointments').select('id', { count: 'exact', head: true }).eq('odontologist_id', id)
    if (appointmentError) return json({ error: 'No se pudieron comprobar las citas asociadas' }, 500)
    const { count: recordCount, error: recordError } = await adminClient
      .from('clinical_records').select('id', { count: 'exact', head: true }).eq('odontologist_id', id)
    if (recordError) return json({ error: 'No se pudieron comprobar las fichas asociadas' }, 500)
    if ((appointmentCount ?? 0) > 0 || (recordCount ?? 0) > 0) {
      return json({ error: 'La cuenta tiene citas o fichas clínicas asignadas. Desactívala para conservar el historial.' }, 409)
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id)
    if (deleteError) return json({ error: `No se pudo eliminar la cuenta: ${deleteError.message}` }, 400)
    return json({ ok: true, message: 'Cuenta eliminada permanentemente' })
  }

  return json({ error: 'Acción desconocida' }, 400)
})

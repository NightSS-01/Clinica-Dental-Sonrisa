# Clínica Dental Sonrisa

MVP académico para la gestión de una clínica dental. Base técnica: React + Vite, Supabase (Auth, PostgreSQL, Storage y RLS) y despliegue futuro en Vercel.

## Requisitos

- Node.js 20.19+ o 22.12+ (incluye npm)
- Git

## Desarrollo local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Completa `.env.local` con la URL y la clave pública (anon/publishable) del proyecto Supabase cuando esté creado. No guardes claves `service_role` ni secretos en variables `VITE_*`.

La URL y la clave pública están en el panel Supabase del proyecto, en **Project Settings → API**. Reinicia el servidor de Vite después de editar `.env.local`. El acceso público/registro de usuarios debe permanecer desactivado; las cuentas son del personal y se crean desde administración.

## Autenticación

La pantalla `/login` usa Supabase Auth con correo y contraseña. Las demás rutas requieren una sesión válida y un registro asociado en `public.profiles`. La aplicación lee el rol del perfil para mostrarlo; los permisos reales de datos se aplican en PostgreSQL mediante RLS.

## Administración de personal

El módulo `/staff` permite invitar usuarios, cambiar su rol y desactivar/reactivar cuentas. Ejecuta `supabase/migrations/202611030001_staff_management.sql` en SQL Editor después de los cambios del módulo; es idempotente y añade a `profiles` los campos de email, estado y contraseña inicial pendiente. La función privilegiada `supabase/functions/manage-staff` valida el JWT y confirma los permisos antes de cada operación; solo usa claves secretas desde el entorno administrado por Supabase.

Para desplegar la función desde PowerShell en la raíz del proyecto:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref TU_PROJECT_ID
npx supabase@latest functions deploy manage-staff
```

Obtén el Project ID en **Project Settings → General**. La CLI abrirá el flujo de inicio de sesión de Supabase; no compartas aquí tokens ni contraseñas. En **Authentication → URL Configuration**, permite `http://localhost:5173/update-password` como redirect URL para activar invitaciones en desarrollo. Agrega la URL de Vercel al publicar. La entrega de invitaciones por correo depende de la configuración de correo saliente de Supabase.

## Construcción

```powershell
npm run build
npm run preview
```

## Estado del alcance

- Una clínica y usuarios internos autenticados.
- Los pacientes no inician sesión; el personal administra sus datos.
- La agenda requiere conexión; no se guardan cambios offline.
- El envío al SII será una simulación académica con resultado ficticio.
- Las tablas, políticas RLS, auditoría y módulos funcionales se incorporarán en los siguientes pasos.

## Migraciones posteriores

Tras el esquema inicial, ejecuta en orden las migraciones nuevas de `supabase/migrations/`. Estas habilitan agenda, clínica y controles de pagos. `202611040003_financial_controls.sql` impide sobrepagos y actualiza el estado del presupuesto cuando queda pagado.

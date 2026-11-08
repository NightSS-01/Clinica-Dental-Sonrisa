const art = {
  agenda: { ink: '#477caf', soft: '#d7e7f6', light: '#f7fbff' },
  patients: { ink: '#348368', soft: '#d3eadc', light: '#f5fbf6' },
  clinical: { ink: '#8065a8', soft: '#e4daf0', light: '#fbf9fd' },
  finance: { ink: '#b17c2d', soft: '#f0dfbf', light: '#fffaf0' },
  inventory: { ink: '#638756', soft: '#dce9d3', light: '#f8fbf5' },
}

export default function ModuleIllustration({ type }) {
  const colors = art[type]

  return (
    <svg className={`module-illustration illustration-${type}`} viewBox="0 0 150 120" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="81" cy="105" rx="56" ry="8" fill={colors.soft} opacity=".55" />
      {type === 'agenda' && <>
        <rect x="37" y="17" width="73" height="79" rx="12" fill={colors.light} stroke={colors.ink} strokeOpacity=".24" strokeWidth="2" />
        <path d="M37 36h73" stroke={colors.ink} strokeOpacity=".28" strokeWidth="2" />
        <path d="M54 13v10M93 13v10" stroke={colors.ink} strokeWidth="4" strokeLinecap="round" />
        <rect x="49" y="47" width="49" height="10" rx="5" fill={colors.soft} />
        <rect x="49" y="64" width="34" height="10" rx="5" fill={colors.soft} />
        <rect x="49" y="81" width="42" height="7" rx="3.5" fill={colors.ink} opacity=".18" />
        <circle cx="105" cy="76" r="22" fill={colors.ink} />
        <path d="M105 64v13l8 5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {type === 'patients' && <>
        <rect x="31" y="20" width="78" height="74" rx="12" fill={colors.light} stroke={colors.ink} strokeOpacity=".22" strokeWidth="2" />
        <circle cx="60" cy="47" r="13" fill={colors.soft} />
        <path d="M40 83c2-13 10-20 20-20s18 7 20 20" fill={colors.soft} />
        <path d="M85 43h13M85 53h9" stroke={colors.ink} strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
        <circle cx="103" cy="83" r="20" fill={colors.ink} />
        <path d="M103 74v18M94 83h18" stroke="white" strokeWidth="3" strokeLinecap="round" />
      </>}
      {type === 'clinical' && <>
        <rect x="33" y="19" width="72" height="79" rx="12" fill={colors.light} stroke={colors.ink} strokeOpacity=".25" strokeWidth="2" />
        <path d="M49 40h39M49 51h25M49 78h35" stroke={colors.ink} strokeOpacity=".22" strokeWidth="4" strokeLinecap="round" />
        <path d="M79 16h13v12H79z" fill={colors.soft} />
        <path d="M67 61c-8 0-12 6-10 14l4 14c1 4 6 4 7 0l3-10 3 10c1 4 6 4 7 0l4-14c2-8-2-14-10-14-2 0-4 1-4 1s-2-1-4-1Z" fill={colors.soft} stroke={colors.ink} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="104" cy="80" r="18" fill={colors.ink} />
        <path d="M99 80h10M104 75v10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </>}
      {type === 'finance' && <>
        <rect x="31" y="23" width="76" height="69" rx="12" fill={colors.light} stroke={colors.ink} strokeOpacity=".25" strokeWidth="2" />
        <path d="M46 74l15-15 12 9 19-22" stroke={colors.ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M84 46h8v8" stroke={colors.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="43" y="80" width="48" height="5" rx="2.5" fill={colors.soft} />
        <circle cx="105" cy="82" r="20" fill={colors.ink} />
        <path d="M105 69v26M111 74c-2-3-11-4-11 2 0 7 12 2 12 9 0 6-9 7-13 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </>}
      {type === 'inventory' && <>
        <path d="m35 43 31-16 31 16-31 17-31-17Z" fill={colors.soft} stroke={colors.ink} strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
        <path d="M35 43v34l31 17V60L35 43Z" fill={colors.light} stroke={colors.ink} strokeOpacity=".45" strokeWidth="2" strokeLinejoin="round" />
        <path d="M97 43v34L66 94V60l31-17Z" fill={colors.soft} stroke={colors.ink} strokeOpacity=".45" strokeWidth="2" strokeLinejoin="round" />
        <path d="m73 67 29-15 18 10-29 16-18-11Z" fill={colors.light} stroke={colors.ink} strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
        <path d="M73 67v23l18 10V78L73 67Z" fill={colors.soft} stroke={colors.ink} strokeOpacity=".45" strokeWidth="2" strokeLinejoin="round" />
        <path d="M120 62v24L91 102V78l29-16Z" fill={colors.light} stroke={colors.ink} strokeOpacity=".45" strokeWidth="2" strokeLinejoin="round" />
        <path d="M62 43h8" stroke={colors.ink} strokeWidth="3" strokeLinecap="round" />
      </>}
    </svg>
  )
}

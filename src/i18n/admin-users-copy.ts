// Static page content module. See ./README.md for when to use *-copy.ts vs flat keys.
import type { Locale } from './locales'

type AdminUsersListCopy = {
  metadataTitle: string
  metadataDescription: string
  eyebrow: string
  title: string
  body: string
  resultSummary: (count: number) => string
  pageSummary: (page: number, totalPages: number) => string
  filtersTitle: string
  filtersBody: string
  matches: (count: number) => string
  range: (start: number, end: number) => string
  headers: {
    user: string
    role: string
    status: string
    email: string
    joined: string
    activity: string
    producer: string
    actions: string
  }
  activity: {
    lastLogin: (date: string) => string
    lastActivity: (date: string) => string
    noData: string
  }
  viewSheet: string
  emptyTitle: string
  emptyBody: string
  pagination: {
    showing: (start: number, end: number, total: number) => string
    previous: string
    next: string
    page: (page: number, totalPages: number) => string
  }
}

type AdminUsersDetailCopy = {
  metadataTitle: string
  metadataDescription: string
  backToList: string
  eyebrow: string
  titleBody: string
  accountTitle: string
  accountBody: string
  badges: {
    active: string
    inactive: string
    deleted: string
    emailVerified: string
    emailPending: string
    twoFactorActive: string
    twoFactorInactive: string
  }
  fields: {
    name: string
    role: string
    email: string
    emailVerified: string
    joined: string
    updated: string
    lastLogin: string
    lastActivity: string
    accountStatus: string
    twoFactor: string
  }
  activity: {
    noData: string
  }
  actionsTitle: string
  actionsBody: string
  actionsStatus: string
  actionsNoMutations: string
  sessionsTitle: string
  sessionsBody: string
  inlineEditTitle: string
  inlineEditBody: string
  availability: {
    available: string
    unavailable: string
  }
  quickAccessTitle: string
  quickAccessBody: string
  openAudit: string
  quickAccess: {
    orders: string
    auditUser: string
    producers: string
    auditVendor: string
  }
  hiddenResetPasswordTitle: string
  hiddenResetPasswordBody: string
  hiddenStateTitle: string
  hiddenStateBody: string
  producerTitle: string
  producerBody: string
  producerFields: {
    displayName: string
    slug: string
    status: string
    commission: string
    rating: string
    stripe: string
    shippingProvider: string
    noShippingProvider: string
    yes: string
    no: string
  }
  since: string
  activityTitle: string
  activityBody: string
  auditTitle: string
  auditBody: string
  auditEmptyTitle: string
  auditEmptyBody: string
  auditLabels: {
    before: string
    after: string
  }
}

type AdminUsersCopy = {
  list: AdminUsersListCopy
  detail: AdminUsersDetailCopy
}

const copy: Record<Locale, AdminUsersCopy> = {
  es: {
    list: {
      metadataTitle: 'Usuarios | Admin',
      metadataDescription: 'Gestiona clientes y productores con filtros, estados y contexto útil para soporte.',
      eyebrow: 'Soporte y seguridad',
      title: 'Usuarios',
      body: 'Listado operativo de clientes y productores con filtros, estados y contexto útil para soporte sin exponer datos innecesarios.',
      resultSummary: count => `${count} usuario${count === 1 ? '' : 's'} en el resultado`,
      pageSummary: (page, totalPages) => `Página ${page} de ${totalPages}`,
      filtersTitle: 'Buscar y filtrar',
      filtersBody: 'Encuentra usuarios por email, nombre, productor asociado o rol y acota por estado o verificación.',
      matches: count => `${count} coincidencias`,
      range: (start, end) => `${start}-${end}`,
      headers: {
        user: 'Usuario',
        role: 'Rol',
        status: 'Estado',
        email: 'Email',
        joined: 'Alta',
        activity: 'Actividad',
        producer: 'Productor',
        actions: 'Acciones',
      },
      activity: {
        lastLogin: date => `Último login ${date}`,
        lastActivity: date => `Última actividad ${date}`,
        noData: 'Sin dato fiable todavía',
      },
      viewSheet: 'Ver ficha',
      emptyTitle: 'No hay usuarios para este filtro.',
      emptyBody: 'Ajusta la búsqueda o limpia los filtros para ver más resultados.',
      pagination: {
        showing: (start, end, total) => `Mostrando ${start}-${end} de ${total} usuarios.`,
        previous: 'Anterior',
        next: 'Siguiente',
        page: (page, totalPages) => `Página ${page} de ${totalPages}`,
      },
    },
    detail: {
      metadataTitle: 'Detalle de usuario | Admin',
      metadataDescription: 'Ficha operativa para soporte: cuenta, productor, actividad y auditoría relevante.',
      backToList: 'Volver al listado',
      eyebrow: 'Ficha de soporte',
      titleBody: 'Vista consolidada de cuenta, productor, actividad y auditoría relevante para decisiones de soporte y operaciones.',
      accountTitle: 'Cuenta',
      accountBody: 'Identidad, verificación, 2FA y actividad visible para soporte.',
      badges: {
        active: 'Activa',
        inactive: 'Inactiva',
        deleted: 'Eliminado',
        emailVerified: 'Email verificado',
        emailPending: 'Email pendiente',
        twoFactorActive: '2FA activa',
        twoFactorInactive: '2FA no activada',
      },
      fields: {
        name: 'Nombre',
        role: 'Rol',
        email: 'Email',
        emailVerified: 'Email verificado',
        joined: 'Alta',
        updated: 'Actualización',
        lastLogin: 'Último login',
        lastActivity: 'Última actividad',
        accountStatus: 'Estado de la cuenta',
        twoFactor: '2FA',
      },
      activity: {
        noData: 'Sin dato fiable todavía',
      },
      actionsTitle: 'Acciones',
      actionsBody: 'Esta vista es solo lectura. Las acciones sensibles se habilitan en tickets posteriores.',
      actionsStatus: 'Sin mutaciones en V1',
      actionsNoMutations: 'Fuera de alcance para esta V1: la ficha es read-only.',
      sessionsTitle: 'Invalidar sesiones',
      sessionsBody: 'Se revoca en servidor con authVersion cuando se bloquea o reestablece la cuenta.',
      inlineEditTitle: 'Edición inline',
      inlineEditBody: 'Fuera de alcance para esta V1: la ficha es read-only.',
      availability: {
        available: 'Disponible',
        unavailable: 'No disponible',
      },
      quickAccessTitle: 'Acceso rápido',
      quickAccessBody: 'Saltos directos para revisar la actividad más útil sin perder el contexto de la ficha.',
      openAudit: 'Ver auditoría completa',
      quickAccess: {
        orders: 'Ver pedidos del usuario',
        auditUser: 'Ver auditoría del usuario',
        producers: 'Ver productores',
        auditVendor: 'Ver auditoría del productor',
      },
      hiddenResetPasswordTitle: 'Reset password',
      hiddenResetPasswordBody: 'Solo `ADMIN_SUPPORT`, `ADMIN_OPS` y `SUPERADMIN` pueden solicitar el reset.',
      hiddenStateTitle: 'Bloquear / desbloquear',
      hiddenStateBody: 'Solo `ADMIN_OPS` y `SUPERADMIN` pueden cambiar el estado de esta cuenta.',
      producerTitle: 'Productor',
      producerBody: 'Contexto operativo del productor asociado a esta cuenta.',
      producerFields: {
        displayName: 'Nombre comercial',
        slug: 'Slug',
        status: 'Estado',
        commission: 'Comisión',
        rating: 'Valoración',
        stripe: 'En Stripe',
        shippingProvider: 'Proveedor de envío',
        noShippingProvider: 'Proveedor de envío no definido',
        yes: 'Sí',
        no: 'No',
      },
      since: 'Desde',
      activityTitle: 'Actividad',
      activityBody: 'Últimos eventos relevantes para soporte y operaciones.',
      auditTitle: 'Auditoría reciente',
      auditBody: 'Últimos cambios relevantes sobre la cuenta o el productor asociado.',
      auditEmptyTitle: 'Sin auditoría reciente',
      auditEmptyBody: 'Todavía no hay eventos recientes registrados para esta ficha.',
      auditLabels: {
        before: 'Antes:',
        after: 'Después:',
      },
    },
  },
  en: {
    list: {
      metadataTitle: 'Users | Admin',
      metadataDescription: 'Manage customers and producers with filters, states, and support-friendly context.',
      eyebrow: 'Support and security',
      title: 'Users',
      body: 'Operational list of customers and producers with filters, states, and support context without exposing unnecessary data.',
      resultSummary: count => `${count} user${count === 1 ? '' : 's'} in the current result`,
      pageSummary: (page, totalPages) => `Page ${page} of ${totalPages}`,
      filtersTitle: 'Search and filter',
      filtersBody: 'Find users by email, name, associated producer, or role and narrow by state or verification.',
      matches: count => `${count} matches`,
      range: (start, end) => `${start}-${end}`,
      headers: {
        user: 'User',
        role: 'Role',
        status: 'Status',
        email: 'Email',
        joined: 'Joined',
        activity: 'Activity',
        producer: 'Producer',
        actions: 'Actions',
      },
      activity: {
        lastLogin: date => `Last login ${date}`,
        lastActivity: date => `Last activity ${date}`,
        noData: 'No reliable data yet',
      },
      viewSheet: 'View profile',
      emptyTitle: 'No users match this filter.',
      emptyBody: 'Adjust the search or clear the filters to see more results.',
      pagination: {
        showing: (start, end, total) => `Showing ${start}-${end} of ${total} users.`,
        previous: 'Previous',
        next: 'Next',
        page: (page, totalPages) => `Page ${page} of ${totalPages}`,
      },
    },
    detail: {
      metadataTitle: 'User details | Admin',
      metadataDescription: 'Operational support sheet for account, producer context, activity, and relevant audit trail.',
      backToList: 'Back to list',
      eyebrow: 'Support sheet',
      titleBody: 'Consolidated view of account, producer, activity, and audit context for support and operations.',
      accountTitle: 'Account',
      accountBody: 'Identity, verification, 2FA, and support-visible activity.',
      badges: {
        active: 'Active',
        inactive: 'Inactive',
        deleted: 'Deleted',
        emailVerified: 'Email verified',
        emailPending: 'Email pending',
        twoFactorActive: '2FA enabled',
        twoFactorInactive: '2FA not enabled',
      },
      fields: {
        name: 'Name',
        role: 'Role',
        email: 'Email',
        emailVerified: 'Email verified',
        joined: 'Joined',
        updated: 'Updated',
        lastLogin: 'Last login',
        lastActivity: 'Last activity',
        accountStatus: 'Account status',
        twoFactor: '2FA',
      },
      activity: {
        noData: 'No reliable data yet',
      },
      actionsTitle: 'Actions',
      actionsBody: 'This view is read-only. Sensitive actions will arrive in later tickets.',
      actionsStatus: 'No mutations in V1',
      actionsNoMutations: 'Out of scope for this V1: the sheet is read-only.',
      sessionsTitle: 'Invalidate sessions',
      sessionsBody: 'Server-side revocation uses authVersion when the account is blocked or restored.',
      inlineEditTitle: 'Inline editing',
      inlineEditBody: 'Out of scope for this V1: the sheet is read-only.',
      availability: {
        available: 'Available',
        unavailable: 'Unavailable',
      },
      quickAccessTitle: 'Quick access',
      quickAccessBody: 'Direct jumps to the most useful activity without leaving the user sheet.',
      openAudit: 'View full audit trail',
      quickAccess: {
        orders: 'View user orders',
        auditUser: 'View user audit',
        producers: 'View producers',
        auditVendor: 'View producer audit',
      },
      hiddenResetPasswordTitle: 'Reset password',
      hiddenResetPasswordBody: 'Only `ADMIN_SUPPORT`, `ADMIN_OPS`, and `SUPERADMIN` can request a reset.',
      hiddenStateTitle: 'Block / unblock',
      hiddenStateBody: 'Only `ADMIN_OPS` and `SUPERADMIN` can change the account state.',
      producerTitle: 'Producer',
      producerBody: 'Operational context for the producer associated with this account.',
      producerFields: {
        displayName: 'Display name',
        slug: 'Slug',
        status: 'Status',
        commission: 'Commission',
        rating: 'Rating',
        stripe: 'On Stripe',
        shippingProvider: 'Shipping provider',
        noShippingProvider: 'Shipping provider not defined',
        yes: 'Yes',
        no: 'No',
      },
      since: 'Since',
      activityTitle: 'Activity',
      activityBody: 'Latest relevant events for support and operations.',
      auditTitle: 'Recent audit trail',
      auditBody: 'Latest relevant changes on the account or linked producer.',
      auditEmptyTitle: 'No recent audit',
      auditEmptyBody: 'There are no recent events recorded for this sheet yet.',
      auditLabels: {
        before: 'Before:',
        after: 'After:',
      },
    },
  },
}

export function getAdminUsersCopy(locale: Locale): AdminUsersCopy {
  return copy[locale] ?? copy.es
}

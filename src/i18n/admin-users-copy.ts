// Admin users content module. See ./README.md for when to use *-copy.ts vs flat keys.
import type { Locale } from './locales'
import { defaultLocale } from './locales'

type AdminUserRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN_SUPPORT' | 'ADMIN_CATALOG' | 'ADMIN_FINANCE' | 'ADMIN_OPS' | 'SUPERADMIN'
type AdminUserFilterRole = 'ALL' | AdminUserRole
type AdminUserStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DELETED'

export type AdminUsersCopy = {
  list: {
    metadataTitle: string
    eyebrow: string
    title: string
    description: string
    badges: {
      results: (count: number) => string
      active: (count: number) => string
      admins: (count: number) => string
    }
    search: {
      label: string
      placeholder: string
    }
    filters: {
      role: string
      status: string
      submit: string
    }
    table: {
      user: string
      role: string
      status: string
      verified: string
      joined: string
      empty: string
    }
    roles: Record<AdminUserFilterRole, string>
    statuses: Record<AdminUserStatus, string>
    roleLabels: Record<AdminUserRole, string>
    pending: string
  }
  detail: {
    metadataTitle: string
    back: string
    eyebrow: string
    accountState: string
    relationships: string
    basicData: string
    labels: {
      createdAt: string
      updatedAt: string
      orders: string
      sessions: string
      emailVerified: string
      consent: string
      stripeCustomer: string
      twoFactor: string
      addresses: string
      pushSubscriptions: string
      notificationPreferences: string
      notificationDeliveries: string
      vendor: string
      id: string
      image: string
    }
    states: {
      pending: string
      notRegistered: string
      notActive: string
      noVendor: string
      hasVendor: string
      twoFactorActiveSince: string
    }
    roleLabels: Record<AdminUserRole, string>
  }
}

const adminUsersCopy: Record<Locale, AdminUsersCopy> = {
  es: {
    list: {
      metadataTitle: 'Usuarios | Admin',
      eyebrow: 'Gestión',
      title: 'Usuarios',
      description: 'Cuenta de usuarios, roles y estado de acceso.',
      badges: {
        results: count => `${count} resultado${count === 1 ? '' : 's'}`,
        active: count => `${count} activo${count === 1 ? '' : 's'}`,
        admins: count => `${count} admin${count === 1 ? '' : 's'}`,
      },
      search: {
        label: 'Buscar',
        placeholder: 'Email o nombre',
      },
      filters: {
        role: 'Rol',
        status: 'Estado',
        submit: 'Filtrar',
      },
      table: {
        user: 'Usuario',
        role: 'Rol',
        status: 'Estado',
        verified: 'Verificado',
        joined: 'Alta',
        empty: 'No hay usuarios para esos filtros.',
      },
      roles: {
        ALL: 'Todos',
        CUSTOMER: 'Clientes',
        VENDOR: 'Vendedores',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catálogo',
        ADMIN_FINANCE: 'Finanzas',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
      statuses: {
        ALL: 'Todos',
        ACTIVE: 'Activos',
        INACTIVE: 'Inactivos',
        DELETED: 'Eliminados',
      },
      roleLabels: {
        CUSTOMER: 'Cliente',
        VENDOR: 'Vendedor',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catálogo',
        ADMIN_FINANCE: 'Finanzas',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
      pending: 'Pendiente',
    },
    detail: {
      metadataTitle: 'Usuario | Admin',
      back: '← Volver a usuarios',
      eyebrow: 'Usuario',
      accountState: 'Estado de cuenta',
      relationships: 'Relaciones',
      basicData: 'Datos básicos',
      labels: {
        createdAt: 'Alta',
        updatedAt: 'Actualizado',
        orders: 'Pedidos',
        sessions: 'Sesiones',
        emailVerified: 'Email verificado',
        consent: 'Consentimiento',
        stripeCustomer: 'Stripe customer',
        twoFactor: '2FA',
        addresses: 'Direcciones',
        pushSubscriptions: 'Push subs',
        notificationPreferences: 'Notificaciones',
        notificationDeliveries: 'Notific. entregadas',
        vendor: 'Vendor',
        id: 'ID',
        image: 'Imagen',
      },
      states: {
        pending: 'Pendiente',
        notRegistered: 'No registrado',
        notActive: 'No activa',
        noVendor: 'No tiene',
        hasVendor: 'Tiene vendor',
        twoFactorActiveSince: 'Activa desde',
      },
      roleLabels: {
        CUSTOMER: 'Cliente',
        VENDOR: 'Vendedor',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catálogo',
        ADMIN_FINANCE: 'Finanzas',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
    },
  },
  en: {
    list: {
      metadataTitle: 'Users | Admin',
      eyebrow: 'Management',
      title: 'Users',
      description: 'User accounts, roles and access state.',
      badges: {
        results: count => `${count} result${count === 1 ? '' : 's'}`,
        active: count => `${count} active${count === 1 ? '' : 's'}`,
        admins: count => `${count} admin${count === 1 ? '' : 's'}`,
      },
      search: {
        label: 'Search',
        placeholder: 'Email or name',
      },
      filters: {
        role: 'Role',
        status: 'Status',
        submit: 'Filter',
      },
      table: {
        user: 'User',
        role: 'Role',
        status: 'Status',
        verified: 'Verified',
        joined: 'Joined',
        empty: 'No users match those filters.',
      },
      roles: {
        ALL: 'All',
        CUSTOMER: 'Customers',
        VENDOR: 'Vendors',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catalog',
        ADMIN_FINANCE: 'Finance',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
      statuses: {
        ALL: 'All',
        ACTIVE: 'Active',
        INACTIVE: 'Inactive',
        DELETED: 'Deleted',
      },
      roleLabels: {
        CUSTOMER: 'Customer',
        VENDOR: 'Vendor',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catalog',
        ADMIN_FINANCE: 'Finance',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
      pending: 'Pending',
    },
    detail: {
      metadataTitle: 'User | Admin',
      back: '← Back to users',
      eyebrow: 'User',
      accountState: 'Account state',
      relationships: 'Relationships',
      basicData: 'Basic data',
      labels: {
        createdAt: 'Joined',
        updatedAt: 'Updated',
        orders: 'Orders',
        sessions: 'Sessions',
        emailVerified: 'Email verified',
        consent: 'Consent',
        stripeCustomer: 'Stripe customer',
        twoFactor: '2FA',
        addresses: 'Addresses',
        pushSubscriptions: 'Push subs',
        notificationPreferences: 'Notifications',
        notificationDeliveries: 'Notification deliveries',
        vendor: 'Vendor',
        id: 'ID',
        image: 'Image',
      },
      states: {
        pending: 'Pending',
        notRegistered: 'Not registered',
        notActive: 'Not active',
        noVendor: 'None',
        hasVendor: 'Has vendor',
        twoFactorActiveSince: 'Active since',
      },
      roleLabels: {
        CUSTOMER: 'Customer',
        VENDOR: 'Vendor',
        ADMIN_SUPPORT: 'Support',
        ADMIN_CATALOG: 'Catalog',
        ADMIN_FINANCE: 'Finance',
        ADMIN_OPS: 'Ops',
        SUPERADMIN: 'Superadmin',
      },
    },
  },
}

export function getAdminUsersCopy(locale: Locale): AdminUsersCopy {
  return adminUsersCopy[locale] ?? adminUsersCopy[defaultLocale]
}

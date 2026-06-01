/// <reference types="npm:@types/react@18.3.1" />
import type * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string | ((data: any) => string)
}

import { template as notification } from './notification.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  notification,
}

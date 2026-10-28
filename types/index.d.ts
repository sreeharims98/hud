export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  model: string
  tokens?: number
  window: number
  percent?: number
  limits: Limit[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    hud: { snapshot: Shaped<Snapshot | null>; effort: string | null; isHidden: boolean }
  }
}

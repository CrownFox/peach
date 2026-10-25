export type RecentProject = {
  path: string
  name: string
}

export const RECENT_PROJECT_LIMIT = 8

export function sameProjectPath(left: string, right: string): boolean {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

export function rememberProject(list: RecentProject[], project: RecentProject): RecentProject[] {
  const projectPath = project.path.trim()
  if (!projectPath) return list
  const name = project.name.trim() || projectPath
  const next = [{ path: projectPath, name }, ...list.filter((item) => !sameProjectPath(item.path, projectPath))]
  return next.slice(0, RECENT_PROJECT_LIMIT)
}

export function forgetProject(list: RecentProject[], projectPath: string): RecentProject[] {
  return list.filter((item) => !sameProjectPath(item.path, projectPath))
}

export function parseRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) return []
  const entries: RecentProject[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as { path?: unknown; name?: unknown }
    if (typeof record.path !== 'string') continue
    const projectPath = record.path.trim()
    if (!projectPath) continue
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : projectPath
    entries.push({ path: projectPath, name })
  }
  return entries.reduceRight((list, project) => rememberProject(list, project), [] as RecentProject[])
}

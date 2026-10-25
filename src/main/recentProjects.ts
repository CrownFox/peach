import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { forgetProject, parseRecentProjects, rememberProject, type RecentProject } from '@shared/recent'
import { writeJson } from './projectFiles'

function recentFile(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json')
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  try {
    return parseRecentProjects(JSON.parse(await fs.readFile(recentFile(), 'utf8')))
  } catch {
    return []
  }
}

export async function rememberRecentProject(project: RecentProject): Promise<void> {
  try {
    const next = rememberProject(await listRecentProjects(), project)
    await writeJson(recentFile(), next)
  } catch (error) {
    console.error(error)
  }
}

export async function forgetRecentProject(projectPath: string): Promise<RecentProject[]> {
  const next = forgetProject(await listRecentProjects(), projectPath)
  await writeJson(recentFile(), next)
  return next
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaskListPage } from '@/pages/TaskListPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'
import { NewTaskPage } from '@/pages/NewTaskPage'
import { ProjectListPage } from '@/pages/ProjectListPage'
import { PeopleListPage } from '@/pages/PeopleListPage'
import { GanttChartPage } from '@/pages/GanttChartPage'
import { ConflictCenterPage } from '@/pages/ConflictCenterPage'
import { ConfigCenterPage } from '@/pages/ConfigCenterPage'
import { ToolCenterPage } from '@/pages/ToolCenterPage'
import { ResourceLibraryPage } from '@/pages/ResourceLibraryPage'
import SAAdminPage from '@/pages/SAAdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tasks" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/people" element={<PeopleListPage />} />
        <Route path="/gantt" element={<GanttChartPage />} />
        <Route path="/conflicts" element={<ConflictCenterPage />} />
        <Route path="/config" element={<ConfigCenterPage />} />
        <Route path="/tools" element={<ToolCenterPage />} />
        <Route path="/resources" element={<ResourceLibraryPage />} />
        <Route path="/admin" element={<SAAdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

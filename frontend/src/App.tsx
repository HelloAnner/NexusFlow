import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaskListPage } from '@/pages/TaskListPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'
import { NewTaskPage } from '@/pages/NewTaskPage'
import { ProjectListPage } from '@/pages/ProjectListPage'
import { PeopleListPage } from '@/pages/PeopleListPage'
import { OrganizationManagementPage } from '@/pages/OrganizationManagementPage'
import { GanttChartPage } from '@/pages/GanttChartPage'
import { ConflictCenterPage } from '@/pages/ConflictCenterPage'
import { ConfigCenterPage } from '@/pages/ConfigCenterPage'
import { ToolCenterPage } from '@/pages/ToolCenterPage'
import { ToolDetailPage } from '@/pages/ToolDetailPage'
import { ResourceLibraryPage } from '@/pages/ResourceLibraryPage'
import { ApprovalDetailPage, ApprovalListPage } from '@/pages/ApprovalPages'
import { TodoCenterPage } from '@/pages/TodoCenterPage'
import { NotificationCenterPage } from '@/pages/NotificationCenterPage'
import { ReportCenterPage } from '@/pages/ReportCenterPage'
import { SearchResultsPage } from '@/pages/SearchResultsPage'
import SAAdminPage from '@/pages/SAAdminPage'
import { RegisterInvitationPage } from '@/pages/RegisterInvitationPage'
import { PendingReviewPage } from '@/pages/PendingReviewPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-sm text-text-muted">
        正在加载登录状态...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  const pending = user.account_status === 'pending' || user.role_codes.includes('pending')
  if (pending && location.pathname !== '/pending-review') {
    return <Navigate to="/pending-review" replace />
  }
  if (!pending && location.pathname === '/pending-review') {
    return <Navigate to="/" replace />
  }
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/invitation" element={<RegisterInvitationPage />} />
          <Route path="/register/invitation/:token" element={<RegisterInvitationPage />} />
          <Route path="/pending-review" element={<ProtectedRoute><PendingReviewPage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><TaskListPage /></ProtectedRoute>} />
          <Route path="/tasks/new" element={<ProtectedRoute><NewTaskPage /></ProtectedRoute>} />
          <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetailPage /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><ProjectListPage /></ProtectedRoute>} />
          <Route path="/orgs" element={<ProtectedRoute><OrganizationManagementPage /></ProtectedRoute>} />
          <Route path="/people" element={<ProtectedRoute><PeopleListPage /></ProtectedRoute>} />
          <Route path="/gantt" element={<ProtectedRoute><GanttChartPage /></ProtectedRoute>} />
          <Route path="/conflicts" element={<ProtectedRoute><ConflictCenterPage /></ProtectedRoute>} />
          <Route path="/approvals" element={<ProtectedRoute><ApprovalListPage /></ProtectedRoute>} />
          <Route path="/approvals/:id" element={<ProtectedRoute><ApprovalDetailPage /></ProtectedRoute>} />
          <Route path="/todos" element={<ProtectedRoute><TodoCenterPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationCenterPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportCenterPage /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchResultsPage /></ProtectedRoute>} />
          <Route path="/config" element={<ProtectedRoute><ConfigCenterPage /></ProtectedRoute>} />
          <Route path="/tools" element={<ProtectedRoute><ToolCenterPage /></ProtectedRoute>} />
          <Route path="/tools/:id" element={<ProtectedRoute><ToolDetailPage /></ProtectedRoute>} />
          <Route path="/resources" element={<ProtectedRoute><ResourceLibraryPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><SAAdminPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

import { MainLayout } from '@/components/layout'
import { EmptyState, Panel } from '@/components/ui'

export function ResourceLibraryPage() {
  return (
    <MainLayout title="资料库" subtitle="任务资料与归档文件">
      <Panel className="h-[calc(100vh-180px)]">
        <EmptyState title="资料库正在建设中" desc="请稍后查看，资料库页面将按设计稿继续完善。" />
      </Panel>
    </MainLayout>
  )
}

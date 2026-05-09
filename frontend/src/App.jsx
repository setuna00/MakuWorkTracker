import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
import TimelinePage from './pages/TimelinePage'
import WorkDetailPage from './pages/WorkDetailPage'
import NewWorkPage from './pages/NewWorkPage'
import QuickRecordPage from './pages/QuickRecordPage'
import SettingsPage from './pages/SettingsPage'
import FavoritesPage from './pages/FavoritesPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/works/new" element={<NewWorkPage />} />
        <Route path="/works/:id" element={<WorkDetailPage />} />
        <Route path="/quick-record" element={<QuickRecordPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

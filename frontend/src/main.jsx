import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'
import { useLocaleStore, syncHtmlLang } from './lib/i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// 把 <html lang> 与当前 locale 保持同步
function HtmlLangSync() {
  const locale = useLocaleStore(s => s.locale)
  useEffect(() => {
    syncHtmlLang(locale)
    document.title = locale === 'en' ? 'Works Tracker' : '作品追踪'
  }, [locale])
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HtmlLangSync />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

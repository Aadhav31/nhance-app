import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            0,      // always refetch when invalidated
      refetchOnWindowFocus: true,   // refresh when user switches back to tab
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgb(var(--s1))',
              color: 'rgb(var(--t1))',
              border: '1px solid rgb(var(--s3))',
              boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: 'rgb(var(--s1))' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: 'rgb(var(--s1))' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

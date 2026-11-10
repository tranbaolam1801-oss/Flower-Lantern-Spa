import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/login';
import { SystemStatus } from './pages/system-status';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles.css';
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><Routes>
  <Route path="/dang-nhap" element={<Login/>}/>
  <Route path="/system" element={<SystemStatus/>}/>
  <Route path="*" element={<Navigate to="/dang-nhap" replace/>}/>
</Routes></BrowserRouter></QueryClientProvider></React.StrictMode>);

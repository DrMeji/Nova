import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DownloadPage } from './pages/DownloadPage';
import { ForgotPage } from './pages/ForgotPage';
import { ResetPage } from './pages/ResetPage';
import { PrivacyPage } from './pages/PrivacyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/profile" element={<Navigate to="/" replace />} />
      <Route path="/account" element={<Navigate to="/" replace />} />
      <Route path="/account/forgot" element={<ForgotPage />} />
      <Route path="/account/reset" element={<ResetPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

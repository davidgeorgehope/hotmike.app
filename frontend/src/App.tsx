import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RecordingProvider } from './contexts/RecordingContext';
import { AuthGuard } from './components/AuthGuard';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { RecordPage } from './pages/RecordPage';
import { LibraryPage } from './pages/LibraryPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <RecordingProvider>
                  <RecordPage />
                </RecordingProvider>
              </AuthGuard>
            }
          />
          <Route
            path="/library"
            element={
              <AuthGuard>
                <RecordingProvider>
                  <LibraryPage />
                </RecordingProvider>
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

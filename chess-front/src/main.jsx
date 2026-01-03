import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { UserProvider } from './context/UserContext.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google';

// REPLACE THIS WITH YOUR ACTUAL GOOGLE CLIENT ID
const GOOGLE_CLIENT_ID = "875811099732-e9cmsnp1u8ertp1hcd278nugv014hana.apps.googleusercontent.com";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <UserProvider>
        <App />
      </UserProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
